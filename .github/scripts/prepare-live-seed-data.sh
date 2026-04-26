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

post_seed() {
  local service_name="$1"
  local base_url="$2"
  local path="$3"
  local attempts="${4:-12}"
  local body_file
  body_file="$(mktemp)"

  for attempt in $(seq 1 "$attempts"); do
    local status
    status=$(curl -sS -o "$body_file" -w '%{http_code}' -X POST --max-time 30 "${base_url}${path}" || echo 000)

    if [[ "$status" =~ ^20[0-9]$ ]]; then
      record_summary "- ${service_name}: seed endpoint returned HTTP ${status}"
      rm -f "$body_file"
      return 0
    fi

    # Some public gateway/APIM surfaces expose the live read endpoints but do not
    # publish the internal demo seed routes. In that case, continue and let the
    # subsequent live-data assertions decide whether the environment is usable.
    if [[ "$status" == "404" || "$status" == "405" ]]; then
      record_summary "- ${service_name}: seed endpoint unavailable on public surface (HTTP ${status}); continuing to live-data verification"
      rm -f "$body_file"
      return 0
    fi

    if [[ "$status" == "000" || "$status" == "500" || "$status" == "502" || "$status" == "503" || "$status" == "504" ]]; then
      echo "Waiting for ${service_name} seed endpoint (${attempt}/${attempts}, HTTP ${status})"
      sleep 10
      continue
    fi

    echo "::error::${service_name} seed endpoint failed with HTTP ${status}"
    cat "$body_file"
    rm -f "$body_file"
    return 1
  done

  echo "::error::${service_name} seed endpoint did not become ready after ${attempts} attempts"
  rm -f "$body_file"
  return 1
}

assert_non_empty_array() {
  local check_name="$1"
  local base_url="$2"
  local path="$3"
  local attempts="${4:-12}"
  local body_file
  body_file="$(mktemp)"

  for attempt in $(seq 1 "$attempts"); do
    local status
    status=$(curl -sS -o "$body_file" -w '%{http_code}' --max-time 30 "${base_url}${path}" || echo 000)

    if [[ "$status" == "000" || "$status" == "500" || "$status" == "502" || "$status" == "503" || "$status" == "504" ]]; then
      echo "Waiting for ${check_name} (${attempt}/${attempts}, HTTP ${status})"
      sleep 10
      continue
    fi

    if [[ ! "$status" =~ ^20[0-9]$ ]]; then
      echo "::error::${check_name} returned unexpected HTTP ${status}"
      cat "$body_file"
      rm -f "$body_file"
      return 1
    fi

    local count
    count=$(jq -er 'length' "$body_file" 2>/dev/null || echo "")
    if [[ -n "$count" && "$count" =~ ^[0-9]+$ && "$count" -gt 0 ]]; then
      record_summary "- ${check_name}: verified ${count} live records"
      rm -f "$body_file"
      return 0
    fi

    echo "${check_name} returned an empty payload (${attempt}/${attempts})"
    sleep 5
  done

  echo "::error::${check_name} did not return seeded data after ${attempts} attempts"
  rm -f "$body_file"
  return 1
}

record_summary "## Live Seed Data Preparation"
record_summary ""
record_summary "Seeding live backend data through ${LIVE_API_BASE_URL} and verifying AI-agent-backed APIs."
record_summary ""

post_seed "Voice"             "$LIVE_API_BASE_URL" "/api/v1/voice/seed"
post_seed "Scheduling"        "$LIVE_API_BASE_URL" "/api/v1/scheduling/seed"
post_seed "Population Health" "$LIVE_API_BASE_URL" "/api/v1/population-health/seed"
post_seed "Revenue Cycle"     "$LIVE_API_BASE_URL" "/api/v1/revenue/seed"
post_seed "Identity"          "$LIVE_API_BASE_URL" "/api/v1/identity/seed"
post_seed "AI Agent"          "$LIVE_API_BASE_URL" "/api/v1/agents/seed"

assert_non_empty_array "Voice sessions"            "$LIVE_API_BASE_URL" "/api/v1/voice/sessions"
assert_non_empty_array "Scheduling slots"          "$LIVE_API_BASE_URL" "/api/v1/scheduling/slots"
assert_non_empty_array "Population health risks"   "$LIVE_API_BASE_URL" "/api/v1/population-health/risks"
assert_non_empty_array "Revenue coding jobs"       "$LIVE_API_BASE_URL" "/api/v1/revenue/coding-jobs"
assert_non_empty_array "AI agent triage workflows" "$LIVE_API_BASE_URL" "/api/v1/agents/triage"
assert_non_empty_array "AI guide suggestions"      "$LIVE_API_BASE_URL" "/api/v1/agents/guide/suggestions"

record_summary ""
record_summary "Live seed-data preparation completed successfully."