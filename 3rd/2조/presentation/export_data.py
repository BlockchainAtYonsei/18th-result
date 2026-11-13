#!/usr/bin/env python3
"""Capture Public Backend results for an offline presentation; never send a chain transaction."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import sys
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from contracts.runtime import validate


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backend', default='http://127.0.0.1:8080')
    parser.add_argument('--output', type=Path, default=ROOT / 'presentation/data/demo.json')
    args = parser.parse_args()
    base = args.backend.rstrip('/')

    def call(method, path, body=None, contract=None):
        trace = 'presentation-' + uuid4().hex
        request = Request(base + path, data=None if body is None else json.dumps(body).encode(), method=method,
                          headers={'Content-Type': 'application/json', 'X-Request-ID': trace})
        try:
            with urlopen(request, timeout=30) as response:
                data = json.load(response)
                location = response.headers.get('Location')
                if response.headers.get('X-Request-ID') != trace:
                    raise RuntimeError('Backend returned a mismatched request trace')
        except HTTPError as error:
            raise RuntimeError(f'{method} {path}: HTTP {error.code}') from error
        if contract:
            validate(*contract.split('/'), data)
        return data, location

    def experiment(path, request, definition):
        validate('api', 'GatewayRequest' if path.endswith('gateway') else 'ConstellationRequest', request)
        result, location = call('POST', path, request, 'experiment/' + definition)
        if not location or not location.startswith('/api/v1/experiments/record-'):
            raise RuntimeError('The experiment was not saved by the Backend')
        audit, _ = call('GET', location, contract='api/ExperimentRecord')
        if audit['request'] != request or audit['result'] != result:
            raise RuntimeError('Saved audit differs from the execution')
        return {'request': request, 'result': result, 'audit': audit}

    analyses = {}
    sources = {}
    for role, fixture in [('sender', 'mainnet-normal-wallet'), ('recipient', 'mainnet-ofac-sdn-exact'),
                          ('pattern', 'mainnet-rapid-fan-out')]:
        directory = ROOT / 'services/collector/fixtures' / fixture
        request = json.loads((directory / 'collection-request.json').read_text())
        request.pop('requestId')
        validate('api', 'AnalysisRequest', request)
        accepted, _ = call('POST', '/api/v1/analyses', request, 'api/AnalysisAccepted')
        deadline = time.monotonic() + 60
        while True:
            result, _ = call('GET', '/api/v1/analyses/' + accepted['analysisId'], contract='api/KYTAnalysisResult')
            if result['status'] not in ('QUEUED', 'RUNNING'):
                break
            if time.monotonic() >= deadline:
                raise RuntimeError('Analysis timed out')
            time.sleep(.1)
        if result['status'] != 'COMPLETED':
            raise RuntimeError(f'{fixture} analysis did not complete: {result["status"]}')
        transfers = []
        cursor = None
        while True:
            from urllib.parse import urlencode
            page, _ = call('GET', '/api/v1/analyses/' + accepted['analysisId'] + '/transfers?' + urlencode(
                {'limit': 1000, **({'cursor': cursor} if cursor else {})}), contract='api/TransferPage')
            transfers.extend(page['items'])
            cursor = page['pagination']['nextCursor']
            if not cursor:
                break
        analyses[role] = {'request': request, 'result': result, 'transfers': transfers}
        source = json.loads((directory / 'source.json').read_text())
        sources[role] = {key: source[key] for key in ('fixtureId', 'dataType', 'capturedAt', 'provider', 'address', 'description')}

    review_request = {
        'intent': {'intentId': 'presentation-mainnet-' + uuid4().hex[:12], 'network': 'mainnet-beta',
                   'sender': analyses['sender']['request']['address'], 'recipient': analyses['recipient']['request']['address'],
                   'asset': {'type': 'SOL', 'mint': None, 'decimals': 9}, 'amountRaw': '1000000000',
                   'requestedAt': '2026-11-10T00:00:00Z'},
        'senderAnalysisId': analyses['sender']['result']['analysisId'],
        'recipientAnalysisId': analyses['recipient']['result']['analysisId'], 'policyVersion': '1.0.0'}
    validate('api', 'ComplianceRequest', review_request)
    review, _ = call('POST', '/api/v1/compliance/evaluate', review_request, 'api/ComplianceResponse')
    if review['decision']['action'] != 'BLOCK':
        raise RuntimeError('The selected presentation case no longer yields BLOCK; review the source data')
    comparisons = {}
    for role, expected in [('sender', 'ALLOW'), ('pattern', 'WARN')]:
        example_request = json.loads(json.dumps(review_request))
        example_request['intent']['intentId'] = 'presentation-' + role + '-' + uuid4().hex[:12]
        example_request['intent']['recipient'] = analyses[role]['request']['address']
        example_request['recipientAnalysisId'] = analyses[role]['result']['analysisId']
        validate('api', 'ComplianceRequest', example_request)
        example, _ = call('POST', '/api/v1/compliance/evaluate', example_request, 'api/ComplianceResponse')
        if example['decision']['action'] != expected:
            raise RuntimeError(f'{role}: policy result changed; review the source data')
        comparisons[role] = {'request': example_request, 'result': example}
    ids = {'intentId': review['intent']['intentId'], 'decisionId': review['decision']['decisionId']}
    gateway = {}
    for key, enforced in [('enforced', True), ('unenforced', False)]:
        gateway[key] = experiment('/api/v1/experiments/gateway', dict(ids, route={
            'routeId': key, 'policyEnforced': enforced, 'warningAcknowledged': False}), 'GatewayExperimentResult')
    scenarios = []
    for key, pslice, participation, expected in [('no_path', 0, 60, 'NO_SUBMISSION_PATH'),
                                                ('below', 39.99, 60, 'INCLUSION_NOT_ENFORCED'),
                                                ('boundary', 40, 60, 'INCLUSION_ENFORCED'),
                                                ('fifty', 50, 60, 'INCLUSION_ENFORCED'),
                                                ('skipped', 40, 59.99, 'BLOCK_SKIPPED')]:
        scenario = {'proposerCount': 16, 'rejectingProposerCount': 15, 'submittedToAcceptingProposer': True,
                    'psliceAvailable': True, 'attestationPercent': pslice, 'attesterParticipationPercent': participation,
                    'leaderAttemptsExclusion': True}
        if key == 'no_path':
            scenario.update(rejectingProposerCount=16, submittedToAcceptingProposer=False, psliceAvailable=False)
        models = {}
        for label, version in [('research', '0.2.0-research'), ('baseline', '0.2.0-single-leader')]:
            models[label] = experiment('/api/v1/experiments/constellation', dict(ids, protocolModelVersion=version, scenario=scenario), 'ConstellationSimulationResult')
        if models['research']['result']['outcome'] != expected:
            raise RuntimeError(f'{key}: research result changed; presentation data needs review')
        scenarios.append({'key': key, 'scenario': scenario, **models})
    bundle = {'format': 'scl-presentation', 'version': 1,
              'generatedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
              'gitRevision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
              'sources': sources, 'analyses': analyses, 'comparisonReviews': comparisons,
              'ruleset': json.loads((ROOT / 'contracts/config/rulesets/1.0.0.json').read_text()),
              'compliance': {'request': review_request, 'result': review}, 'gateway': gateway, 'scenarios': scenarios}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(bundle, ensure_ascii=False, indent=2) + '\n')
    print(f'Captured three analyses, three policy decisions and twelve saved experiments: {args.output}')


if __name__ == '__main__':
    main()
