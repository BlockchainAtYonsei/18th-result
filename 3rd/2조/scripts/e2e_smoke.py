"""Backend Public API E2E 스모크 테스트.

실제 KYT/Policy 엔진 + Gateway/Constellation + Collector + Backend를 띄운 상태에서
Public API 전체 흐름을 호출하고, 모든 응답을 solana-compliance-lab/contracts 의 JSON Schema로 검증한다.

    scripts/run-local.sh start
    .venv/bin/python scripts/e2e_smoke.py
"""
import json, os, sys, time, urllib.request, urllib.error, uuid
from pathlib import Path
sys.path.insert(0, os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from contracts.runtime import validate

BASE = os.environ.get("BACKEND_URL", "http://127.0.0.1:8080")
SENDER = "4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi"
RECIPIENT = "8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR"
results = []

def canonical_headers(headers):
    # HTTP header names are case-insensitive; Vite/Nginx may change their casing.
    result = dict(headers)
    for name in ("Location", "X-Request-ID"):
        value = headers.get(name)
        if value is not None:
            result[name] = value
    return result

def call(method, path, body=None, headers=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=data, method=method, headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, canonical_headers(r.headers), json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, canonical_headers(e.headers), json.loads(e.read())

def check(name, cond, detail=""):
    results.append((name, cond))
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f"  -> {detail}"))

def schema(name, file, definition, value):
    try:
        validate(file, definition, value); check(name + " schema", True)
    except Exception as e:
        check(name + " schema", False, e)

def audit_record(headers, result):
    location = headers.get("Location")
    check("experiment audit Location", isinstance(location, str) and location.startswith("/api/v1/experiments/record-"), location)
    if not location:
        return
    status, _, record = call("GET", location)
    check("experiment record GET", status == 200 and record.get("result") == result, (status, record))
    schema("experiment record", "api", "ExperimentRecord", record)

def analyze(address, fixture, ruleset=None):
    body = {"address": address, "network": "mainnet-beta", "mode": "FIXTURE", "fixtureId": fixture,
            "scope": {"fromTime": "2026-11-01T00:00:00Z", "toTime": "2026-11-02T00:00:00Z", "maxTransactions": 100}}
    if ruleset: body["rulesetVersion"] = ruleset
    s, h, b = call("POST", "/api/v1/analyses", body)
    check(f"analyze {fixture} 202", s == 202, (s, b))
    schema(f"accepted {fixture}", "api", "AnalysisAccepted", b)
    check(f"analyze {fixture} Location", h.get("Location") == f"/api/v1/analyses/{b['analysisId']}", h)
    for _ in range(50):
        s, _, r = call("GET", f"/api/v1/analyses/{b['analysisId']}")
        if r["status"] in ("COMPLETED", "PARTIAL", "FAILED"): break
        time.sleep(0.1)
    schema(f"analysis {fixture} {r['status']}", "api", "KYTAnalysisResult", r)
    return r

intent = lambda iid: {"intentId": iid, "network": "mainnet-beta", "sender": SENDER, "recipient": RECIPIENT,
                      "asset": {"type": "SOL", "mint": None, "decimals": 9}, "amountRaw": "1000000000", "requestedAt": "2026-11-02T00:00:00Z"}

def comply(iid, sender, recipient, version="1.0.0"):
    s, _, b = call("POST", "/api/v1/compliance/evaluate", {"intent": intent(iid), "senderAnalysisId": sender["analysisId"],
                   "recipientAnalysisId": recipient["analysisId"], "policyVersion": version})
    check(f"compliance {iid} 200", s == 200, (s, b))
    if s == 200: schema(f"compliance {iid}", "api", "ComplianceResponse", b)
    return b

def gateway(iid, decision, route_id, enforced, ack):
    s, h, b = call("POST", "/api/v1/experiments/gateway", {"intentId": iid, "decisionId": decision["decisionId"],
                   "route": {"routeId": route_id, "policyEnforced": enforced, "warningAcknowledged": ack}})
    check(f"gateway {route_id} 200", s == 200, (s, b))
    if s == 200: schema(f"gateway {route_id}", "experiment", "GatewayExperimentResult", b)
    if s == 200: audit_record(h, b)
    return b

# 1) analyses
sender = analyze(SENDER, "sender")
check("sender COMPLETED LOW", sender["status"] == "COMPLETED" and sender["evaluation"]["riskLevel"] == "LOW", sender["status"])
sanctioned = analyze(RECIPIENT, "sanctioned")
check("sanctioned HIGH 100", sanctioned["evaluation"]["riskScore"] == 100, sanctioned.get("evaluation"))
partial = analyze(RECIPIENT, "partial")
check("partial PARTIAL null score", partial["status"] == "PARTIAL" and partial["evaluation"]["riskScore"] is None, partial["status"])
warn = analyze(RECIPIENT, "warn")
direct = analyze(RECIPIENT, "direct-flow")
bad_ruleset = analyze(RECIPIENT, "normal", ruleset="9.9.9")
check("unsupported ruleset FAILED/UNSUPPORTED_VERSION", bad_ruleset["status"] == "FAILED" and bad_ruleset["error"]["code"] == "UNSUPPORTED_VERSION", bad_ruleset.get("error"))
wrong_addr = analyze(SENDER, "sanctioned")
check("fixture/address mismatch FAILED", wrong_addr["status"] == "FAILED", wrong_addr["status"])

# 2) transfers
s, _, page = call("GET", f"/api/v1/analyses/{warn['analysisId']}/transfers?limit=2")
check("transfers 200", s == 200, page); schema("transfers p1", "api", "TransferPage", page)
check("transfers p1 has cursor", len(page["items"]) == 2 and page["pagination"]["nextCursor"], page["pagination"])
s, _, page2 = call("GET", f"/api/v1/analyses/{warn['analysisId']}/transfers?limit=2&cursor={page['pagination']['nextCursor']}")
schema("transfers p2", "api", "TransferPage", page2)
check("transfers p2 last page", len(page2["items"]) == 1 and page2["pagination"]["nextCursor"] is None, page2["pagination"])
s, _, e = call("GET", f"/api/v1/analyses/{bad_ruleset['analysisId']}/transfers")
check("transfers FAILED -> 409", s == 409 and e["error"]["code"] == "ANALYSIS_NOT_READY", (s, e)); schema("409 error", "common", "ErrorResponse", e)

# 3) compliance + gateway decision table
block = comply("sanctioned-intent", sender, sanctioned)
check("sanctioned -> BLOCK", block["decision"]["action"] == "BLOCK", block["decision"]["action"])
r = gateway("sanctioned-intent", block["decision"], "block", True, False)
block_gateway = r
check("enforced BLOCK -> REJECTED", r["outcome"] == "SUBMISSION_REJECTED" and r["reasonCodes"] == ["POLICY_BLOCK"], r)
r = gateway("sanctioned-intent", block["decision"], "bypass", False, False)
check("not enforced -> ALLOWED (bypass comparison)", r["outcome"] == "SUBMISSION_ALLOWED" and r["reasonCodes"] == ["POLICY_NOT_ENFORCED"] and r["actualBroadcast"] is False, r)

w = comply("warn-intent", sender, warn)
check("warn -> WARN", w["decision"]["action"] == "WARN", w["decision"]["action"])
r = gateway("warn-intent", w["decision"], "warn-unack", True, False)
check("WARN unack -> REVIEW_REQUIRED", r["outcome"] == "REVIEW_REQUIRED" and r["reasonCodes"] == ["WARNING_NOT_ACKNOWLEDGED"], r)
r = gateway("warn-intent", w["decision"], "warn-ack", True, True)
check("WARN ack -> ALLOWED", r["outcome"] == "SUBMISSION_ALLOWED" and r["reasonCodes"] == ["WARNING_ACKNOWLEDGED"], r)

p = comply("partial-intent", sender, partial)
check("partial -> REVIEW", p["decision"]["action"] == "REVIEW", p["decision"])
r = gateway("partial-intent", p["decision"], "review", True, False)
check("REVIEW -> REVIEW_REQUIRED", r["outcome"] == "REVIEW_REQUIRED", r)

ok = comply("normal-intent", sender, analyze(RECIPIENT, "normal"))
check("normal -> ALLOW", ok["decision"]["action"] == "ALLOW", ok["decision"]["action"])
r = gateway("normal-intent", ok["decision"], "allow", True, False)
check("ALLOW -> ALLOWED", r["outcome"] == "SUBMISSION_ALLOWED" and r["reasonCodes"] == ["POLICY_ALLOW"], r)

d10 = comply("direct-intent", sender, direct, "1.0.0"); d11 = comply("direct-intent", sender, direct, "1.1.0")
check("direct-flow policy 1.0.0 REVIEW / 1.1.0 BLOCK", d10["decision"]["action"] == "REVIEW" and d11["decision"]["action"] == "BLOCK",
      (d10["decision"]["action"], d11["decision"]["action"]))

s, _, e = call("POST", "/api/v1/compliance/evaluate", {"intent": intent("x"), "senderAnalysisId": sanctioned["analysisId"],
               "recipientAnalysisId": sender["analysisId"], "policyVersion": "1.0.0"})
check("swapped analyses -> 409 ASSESSMENT_MISMATCH", s == 409 and e["error"]["code"] == "ASSESSMENT_MISMATCH", (s, e))
s, _, e = call("POST", "/api/v1/compliance/evaluate", {"intent": intent("x"), "senderAnalysisId": sender["analysisId"],
               "recipientAnalysisId": sanctioned["analysisId"], "policyVersion": "7.0.0"})
check("unknown policyVersion -> 422", s == 422 and e["error"]["code"] == "UNSUPPORTED_VERSION", (s, e))

# 4) constellation
scenario = {"proposerCount": 4, "rejectingProposerCount": 1, "submittedToAcceptingProposer": True, "psliceAvailable": True,
            "attestationPercent": 100, "attesterParticipationPercent": 100, "leaderAttemptsExclusion": True}
s, _, c = call("POST", "/api/v1/experiments/constellation", {"intentId": "sanctioned-intent", "decisionId": block["decision"]["decisionId"],
               "protocolModelVersion": "0.0.0-research-pending", "scenario": scenario})
check("constellation mock 200", s == 200, (s, c)); schema("constellation", "experiment", "ConstellationSimulationResult", c)
s, _, c = call("POST", "/api/v1/experiments/constellation", {"intentId": "sanctioned-intent", "decisionId": block["decision"]["decisionId"],
               "protocolModelVersion": "0.0.0-research-pending", "scenario": {**scenario, "rejectingProposerCount": 9}})
check("constellation INVALID_SCENARIO", s == 200 and c["outcome"] == "INVALID_SCENARIO", c); schema("constellation invalid", "experiment", "ConstellationSimulationResult", c)
s, _, c = call("POST", "/api/v1/experiments/constellation", {"intentId": "sanctioned-intent", "decisionId": block["decision"]["decisionId"],
               "protocolModelVersion": "1.0.0", "scenario": scenario})
check("constellation unapproved -> 422", s == 422 and c["error"]["code"] == "UNSUPPORTED_VERSION", (s, c))

# 4b) constellation draft vs single-leader baseline (same scenario)
def simulate(version, sc):
    s, h, c = call("POST", "/api/v1/experiments/constellation", {"intentId": "sanctioned-intent", "decisionId": block["decision"]["decisionId"],
                   "protocolModelVersion": version, "scenario": sc})
    check(f"constellation {version} 200", s == 200, (s, c))
    if s == 200:
        schema(f"constellation {version}", "experiment", "ConstellationSimulationResult", c)
        audit_record(h, c)
    return c
c = simulate("0.2.0-research", scenario)
check("draft: attested pslice -> INCLUSION_ENFORCED, exclusion invalid", c["outcome"] == "INCLUSION_ENFORCED" and c["leaderExclusionValid"] is False, c)
c = simulate("0.2.0-single-leader", scenario)
check("baseline: INCLUSION_NOT_ENFORCED, exclusion valid", c["outcome"] == "INCLUSION_NOT_ENFORCED" and c["leaderExclusionValid"] is True, c)
c = simulate("0.2.0-research", {**scenario, "attestationPercent": 39.99})
check("draft: low attestation -> NOT_ENFORCED", c["outcome"] == "INCLUSION_NOT_ENFORCED" and "ATTESTATION_CONDITION_NOT_MET" in c["explanationCodes"], c)
for pslice, participation, expected in [(39.99,60,"INCLUSION_NOT_ENFORCED"),(40,60,"INCLUSION_ENFORCED"),(50,60,"INCLUSION_ENFORCED"),(40,59.99,"BLOCK_SKIPPED"),(70,60,"INVALID_SCENARIO")]:
    boundary = simulate("0.2.0-research", {**scenario, "attestationPercent":pslice,"attesterParticipationPercent":participation})
    check(f"40/60 research boundary {pslice}/{participation}", boundary["outcome"] == expected, boundary)
    check("pinned research parameters", boundary["modelParameters"] == {"sourceId":"team-research-40-60-v1","psliceInclusionThresholdPercent":40,"blockParticipationThresholdPercent":60})
c = simulate("0.2.0-research", {**scenario, "rejectingProposerCount": 4, "submittedToAcceptingProposer": False})
check("draft: all reject -> NO_SUBMISSION_PATH", c["outcome"] == "NO_SUBMISSION_PATH" and c["explanationCodes"] == ["NO_ACCEPTING_PROPOSER"], c)

# 5) errors / headers
s, h, e = call("GET", "/api/v1/analyses/missing", headers={"X-Request-ID": "trace-e2e"})
check("404 + X-Request-ID echo", s == 404 and e["requestId"] == "trace-e2e" and h.get("X-Request-ID") == "trace-e2e", (s, e, h.get("X-Request-ID")))
schema("404 error", "common", "ErrorResponse", e)

# Persisted audit queries are independent of the original execution endpoints.
s, _, records = call("GET", "/api/v1/experiments?type=GATEWAY&intentId=sanctioned-intent&limit=1")
check("experiment record list", s == 200 and len(records.get("items", [])) == 1, (s, records))
if s == 200:
    schema("experiment page", "api", "ExperimentPage", records)
    check("experiment record filters", all(r["type"] == "GATEWAY" and r["intentId"] == "sanctioned-intent" for r in records["items"]))
s, _, error = call("GET", "/api/v1/experiments/missing")
check("missing experiment record 404", s == 404 and error["error"]["code"] == "NOT_FOUND", (s, error))

# Dashboard snapshots use server storage, separate from immutable experiment audit records.
case_write = json.loads((Path(__file__).resolve().parents[1] / "contracts/fixtures/api/case-write.json").read_text())
case_id = "CL-" + str(uuid.uuid4().int)[:30]
case = case_write["case"]
case["id"] = case_id
run = case["runs"][0]
for side, analysis in (("sender", sender), ("recipient", sanctioned)):
    status, _, transfers = call("GET", f"/api/v1/analyses/{analysis['analysisId']}/transfers")
    check(f"case {side} transfer snapshot", status == 200)
    run[side] = {"analysisId": analysis["analysisId"], "result": analysis, "transfers": transfers["items"]}
run["compliance"] = block
run["complianceRequest"] = {"intent": block["intent"], "senderAnalysisId": sender["analysisId"],
                            "recipientAnalysisId": sanctioned["analysisId"], "policyVersion": "1.0.0"}
run["gateway"] = [{"key": "case-gateway", "at": case["createdAt"],
                   "route": {"routeId": "block", "policyEnforced": True, "warningAcknowledged": False},
                   "result": block_gateway, "error": None}]
run["constellation"] = [{"key": "case-constellation", "at": case["createdAt"], "batch": "case-batch",
                         "purpose": "compare", "version": "0.2.0-research",
                         "scenario": {**scenario, "rejectingProposerCount": 4, "submittedToAcceptingProposer": False},
                         "result": c, "error": None}]
status, _, saved_case = call("PUT", f"/api/v1/cases/{case_id}", case_write)
check("case server save", status == 200 and saved_case.get("revision") == 1, (status, saved_case))
if status == 200:
    schema("saved case", "api", "CaseDocument", saved_case)
    status, _, loaded = call("GET", f"/api/v1/cases/{case_id}")
    check("case server detail preserves all snapshots", status == 200 and loaded == saved_case)
    status, _, case_page = call("GET", "/api/v1/cases")
    check("case server list", status == 200)
    schema("case page", "api", "CasePage", case_page)
    status, _, conflict = call("PUT", f"/api/v1/cases/{case_id}", case_write)
    check("stale case write refused", status == 409 and conflict["error"]["code"] == "CONFLICT")
    schema("case conflict", "common", "ErrorResponse", conflict)
    status, _, deleted = call("DELETE", f"/api/v1/cases/{case_id}?revision=1")
    check("case server delete", status == 200 and deleted.get("deleted") is True)
    schema("case deletion", "api", "CaseDeleted", deleted)
    status, _, missing = call("GET", f"/api/v1/cases/{case_id}")
    check("deleted case 404", status == 404 and missing["error"]["code"] == "NOT_FOUND")

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
