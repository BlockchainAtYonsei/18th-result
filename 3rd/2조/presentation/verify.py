#!/usr/bin/env python3
"""Check the shipped HTML is self-contained and preserves captured contract evidence."""
from html.parser import HTMLParser
import json
import html as html_lib
from datetime import datetime
from pathlib import Path
import re
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from contracts.runtime import validate

class Deck(HTMLParser):
    def __init__(self):
        super().__init__(); self.slides=0; self.dependencies=[]; self.ids=[]; self.in_data=False; self.data=''
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if 'id' in a:self.ids.append(a['id'])
        if tag=='section' and 'slide' in a.get('class','').split():self.slides+=1
        if tag in ('script','img','iframe','video','audio','source') and a.get('src') and not a['src'].startswith('data:'):self.dependencies.append(a['src'])
        if tag=='link' and a.get('href') and not a['href'].startswith('data:'):self.dependencies.append(a['href'])
        if tag=='script' and a.get('id')=='presentation-data':self.in_data=True
    def handle_endtag(self, tag):
        if tag=='script':self.in_data=False
    def handle_data(self, data):
        if self.in_data:self.data+=data

def main():
    text=(ROOT/'presentation/index.html').read_text()
    parsed=Deck();parsed.feed(text)
    assert parsed.slides==12, 'Twelve main slides required'
    expected_titles=['이상거래','거래 흐름 분석','탐지와 대응의 구분','규칙 기반 탐지','분산 송금 사례',
                     '온체인 분석 시연','위험 신호와 정책 판단','서비스 제출 통제','제출 경로의 차이','증명 조건과 포함 의무',
                     '블록 유효 조건','대응의 유효 범위']
    sections=re.findall(r'<section class="slide.*?</section>',text,re.S)
    titles=[re.sub(r'<[^>]+>','',re.search(r'<h[12][^>]*>(.*?)</h[12]>',s,re.S)[1]).strip() for s in sections]
    assert titles==expected_titles, 'Noun-form presentation titles changed'
    notes=json.loads(re.search(r'<script id="speaker-notes"[^>]*>(.*?)</script>',text,re.S)[1])
    assert len(notes)==parsed.slides and all(note['paragraphs'] for note in notes)
    assert notes==json.loads((ROOT/'presentation/src/notes.json').read_text())
    counts=[int(re.search(r'data-builds="(\d+)"',s)[1]) for s in sections]
    assert counts==[1,3,3,4,5,1,4,4,2,2,3,3] and sum(counts)==35
    assert all(len(note['steps'])==count for note,count in zip(notes,counts)), 'Missing linear speaker cues'
    assert all(len(note['screen'])==count for note,count in zip(notes,counts)), 'Missing on-screen interpretation'
    main=re.search(r'<main id="deck">(.*?)</main>',text,re.S)[1]
    assert not re.search(r'<(?:button|input|select|textarea)\b',main), 'Presentation content must have no branching controls'
    assert not re.search(r'class="(?:eyebrow|slide-foot|scene-head|nav-hint)"',text), 'Auxiliary presentation microcopy must be removed'
    assert not parsed.dependencies, parsed.dependencies
    embedded=re.search(r'<template id="offline-demo-document">(.*?)</template>',text,re.S)
    assert embedded, 'Missing offline React document'
    child=html_lib.unescape(embedded[1])
    child_parsed=Deck();child_parsed.feed(child)
    assert not child_parsed.dependencies, child_parsed.dependencies
    assert "connect-src 'none'" in child and "default-src 'none'" in child
    child_data=json.loads(re.search(r'<script id="offline-demo-data"[^>]*>(.*?)</script>',child,re.S)[1])
    assert child_data == json.loads((ROOT/'presentation/data/demo.json').read_text())
    assert 'data-service-url' not in main and '<iframe id="service-demo-frame"' in main
    text_without_demo=text[:embedded.start()]+text[embedded.end():]
    assert re.findall(r'<iframe[^>]+data-demo-stage="([^"]+)"', main) == ['analysis','gateway','network']
    assert 'data-interactive-demo' in sections[5] and '<iframe ' in sections[5]
    assert 'service-demo-image' not in text and 'INLINE_FE' not in text
    assert len(parsed.ids)==len(set(parsed.ids)), 'Duplicate HTML IDs'
    assert not re.search(r'@import|\bfetch\s*\(|XMLHttpRequest|WebSocket',text_without_demo), 'Runtime network dependency'
    assert all(url.startswith(('data:', '#')) for url in re.findall(r'url\(([^)]+)\)',text)), 'External stylesheet resource'
    assert '/*INLINE_' not in text, 'Unresolved build placeholder'
    data=json.loads(parsed.data)
    assert data==json.loads((ROOT/'presentation/data/demo.json').read_text())
    for a in data['analyses'].values():
        validate('api','AnalysisRequest',a['request']);validate('api','KYTAnalysisResult',a['result'])
        for transfer in a['transfers']:validate('collector','NormalizedTransfer',transfer)
        assert len(a['transfers']) == a['result']['coverage']['transferCount']
    validate('kyt', 'Ruleset', data['ruleset'])
    assert set(data['analyses']) == {'sender', 'recipient', 'pattern'}
    for role, expected in [('sender', 'ALLOW'), ('pattern', 'WARN')]:
        review = data['comparisonReviews'][role]
        validate('api', 'ComplianceRequest', review['request'])
        validate('api', 'ComplianceResponse', review['result'])
        assert review['result']['decision']['action'] == expected
        assert review['request']['recipientAnalysisId'] == data['analyses'][role]['result']['analysisId']
        assert review['result']['intent'] == review['request']['intent']
    pattern = data['analyses']['pattern']
    evaluation = pattern['result']['evaluation']
    assert pattern['result']['dataProvenance']['dataType'] == 'ON_CHAIN'
    assert pattern['result']['coverage']['status'] == 'COMPLETE'
    assert evaluation['riskScore'] == 35 and evaluation['riskLevel'] == 'MEDIUM'
    rule = next(r for r in evaluation['detectedRules'] if r['ruleId'] == 'RAPID_FAN_OUT')
    evidence = next(e for e in evaluation['evidences'] if e['evidenceId'] in rule['evidenceIds'])
    rows = sorted((t for t in pattern['transfers'] if t['id'] in evidence['transferIds']), key=lambda t:(t['timestamp'],t['id']))
    assert len(rows) == len(evidence['transferIds']) == 12
    assert {r['signature'] for r in rows} == set(evidence['transactionSignatures'])
    assert len(evidence['transactionSignatures']) == 7
    # The four displayed transfers illustrate one qualifying window, not the full union of windows.
    excerpt = rows[:4]
    assert len({r['toAddress'] for r in excerpt}) == 4
    assert (datetime.fromisoformat(excerpt[-1]['timestamp']) - datetime.fromisoformat(excerpt[0]['timestamp'])).total_seconds() == 111
    assert evidence['evidenceId'] in data['comparisonReviews']['pattern']['result']['decision']['referencedEvidenceIds']
    validate('api','ComplianceRequest',data['compliance']['request'])
    validate('api','ComplianceResponse',data['compliance']['result'])
    assert data['compliance']['result']['decision']['action']=='BLOCK'
    intent=data['compliance']['result']['intent']['intentId']
    count=0
    def audit(record,request_def,result_def):
        nonlocal count
        validate('api',request_def,record['request'])
        validate('experiment',result_def,record['result'])
        validate('api','ExperimentRecord',record['audit'])
        assert record['request']==record['audit']['request']
        assert record['result']==record['audit']['result']
        assert record['result']['intentId']==intent
        assert record['audit']['review']==data['compliance']['result']
        count+=1
    for record in data['gateway'].values():audit(record,'GatewayRequest','GatewayExperimentResult')
    assert {s['key'] for s in data['scenarios']}=={'no_path','below','boundary','fifty','skipped'}
    expected = {'no_path':'NO_SUBMISSION_PATH','below':'INCLUSION_NOT_ENFORCED','boundary':'INCLUSION_ENFORCED',
                'fifty':'INCLUSION_ENFORCED','skipped':'BLOCK_SKIPPED'}
    for scenario in data['scenarios']:
        assert scenario['research']['result']['outcome'] == expected[scenario['key']]
        for model in ['research','baseline']:
            record=scenario[model]
            assert record['request']['scenario']==scenario['scenario']
            audit(record,'ConstellationRequest','ConstellationSimulationResult')
    assert count==12
    scenarios = {s['key']:s for s in data['scenarios']}
    assert scenarios['no_path']['scenario']['rejectingProposerCount'] == scenarios['no_path']['scenario']['proposerCount']
    assert not scenarios['no_path']['research']['result']['proposerPathAvailable']
    below, boundary = scenarios['below']['scenario'], scenarios['boundary']['scenario']
    assert {k:v for k,v in below.items() if k!='attestationPercent'} == {k:v for k,v in boundary.items() if k!='attestationPercent'}
    assert scenarios['boundary']['research']['result']['leaderExclusionValid'] is False
    assert scenarios['skipped']['research']['result']['blockStatus'] == 'SKIPPED'
    assert scenarios['skipped']['research']['result']['leaderExclusionValid'] is None
    assert data['analyses']['recipient']['result']['coverage']['transferCount']==0
    print('PASS: twelve slides, 35 linear states and matching cues, network-disabled bundled FE with embedded JSON, contract-valid data and twelve consistent saved audits')
if __name__=='__main__':main()
