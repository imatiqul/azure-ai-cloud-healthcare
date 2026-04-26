#!/usr/bin/env bash

set -euo pipefail

LIVE_API_BASE_URL="${LIVE_API_BASE_URL:-${GATEWAY_ACA_URL:-${GATEWAY_URL:-${API_BASE_URL:-}}}}"
LIVE_API_BASE_URL="${LIVE_API_BASE_URL%/}"

if [[ -z "$LIVE_API_BASE_URL" ]]; then
  echo "::error::LIVE_API_BASE_URL (or GATEWAY_ACA_URL/GATEWAY_URL/API_BASE_URL) is required"
  exit 1
fi

record_summary() {
  local line="$1"
  echo "$line"
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    echo "$line" >> "$GITHUB_STEP_SUMMARY"
  fi
}

is_hard_failure_status() {
  local status="$1"
  case "$status" in
    000|404|405|502|503|504)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

probe_route() {
  local name="$1"
  local method="$2"
  local path="$3"
  local url="${LIVE_API_BASE_URL}${path}"
  local body_file
  body_file="$(mktemp)"

  local status
  status=$(curl -sS -o "$body_file" -w '%{http_code}' \
    --max-time 30 \
    --location \
    -X "$method" \
    -H "Accept: application/json" \
    "$url" || echo 000)

  if is_hard_failure_status "$status"; then
    record_summary "- FAIL: ${name} (${method} ${path}) returned HTTP ${status}"
    if [[ -s "$body_file" ]]; then
      local snippet
      snippet="$(tr '\n' ' ' < "$body_file" | head -c 300)"
      if [[ -n "$snippet" ]]; then
        record_summary "  response: ${snippet}"
      fi
    fi
    rm -f "$body_file"
    return 1
  fi

  record_summary "- PASS: ${name} (${method} ${path}) returned HTTP ${status}"
  rm -f "$body_file"
  return 0
}

TOTAL=0
FAILED=0

run_probe() {
  local name="$1"
  local method="$2"
  local path="$3"

  TOTAL=$((TOTAL + 1))
  if ! probe_route "$name" "$method" "$path"; then
    FAILED=$((FAILED + 1))
  fi
}

record_summary "## Post-Rollback Route Smoke Probes"
record_summary ""
record_summary "Base URL: ${LIVE_API_BASE_URL}"
record_summary ""

run_probe "Agents triage list" "GET" "/api/v1/agents/triage"
run_probe "Voice sessions list" "GET" "/api/v1/voice/sessions"
run_probe "Voice WebPubSub negotiate" "GET" "/api/webpubsub/negotiate?sessionId=rollback-drill&userId=ops"
run_probe "Scheduling slots list" "GET" "/api/v1/scheduling/slots"
run_probe "Population health risks" "GET" "/api/v1/population-health/risks"
run_probe "Revenue coding jobs" "GET" "/api/v1/revenue/coding-jobs"
run_probe "FHIR metadata" "GET" "/api/v1/fhir/metadata"
run_probe "FHIR metadata legacy route" "GET" "/fhir/metadata"
run_probe "SMART configuration" "GET" "/.well-known/smart-configuration"
run_probe "Identity users" "GET" "/api/v1/identity/users?page=1&pageSize=1"
run_probe "Identity admin audit summary" "GET" "/api/v1/admin/audit/summary?days=1"
run_probe "Notification campaigns" "GET" "/api/v1/notifications/campaigns"
run_probe "OCR jobs list" "GET" "/api/v1/ocr/jobs"

record_summary ""
record_summary "Probe summary: ${TOTAL} executed, ${FAILED} failed"

if [[ "$FAILED" -gt 0 ]]; then
  echo "::error::Post-rollback route probes detected ${FAILED} hard failures"
  exit 1
fi

record_summary "All post-rollback route probes passed."
