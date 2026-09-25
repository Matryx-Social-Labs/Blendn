#!/usr/bin/env bash
# Wait for an EAS workflow run and leave an audit trail in the GitHub job.
#
#   scripts/eas-await-run.sh <workflow-run-id>
#
# Prints a timestamped line each time any job changes state, so the GitHub log
# shows where the time went: queued for a slot, building, or submitting. When
# the run ends it prints the logs of every job that failed, and, in Actions,
# writes a job table to the run summary. Exits 0 only on SUCCESS.
#
# Read-only against EAS: safe to point at any run, including a finished one.
set -uo pipefail

run_id="${1:?usage: eas-await-run.sh <workflow-run-id>}"
eas="${EAS:-npx --yes eas-cli@24.8.0}"
poll="${EAS_POLL_SECONDS:-60}"

prev=""
while :; do
  if ! view=$($eas workflow:view "$run_id" --json 2>/dev/null); then
    # One failed read is not a failed deploy. The job's timeout bounds this.
    echo "$(date -u +%H:%M:%SZ) could not read the run; retrying"
    sleep "$poll"
    continue
  fi
  status=$(jq -r .status <<<"$view")
  line=$(jq -r '[.jobs[] | "\(.key)=\(.status)"] | join("  ")' <<<"$view")
  if [ "$status $line" != "$prev" ]; then
    echo "$(date -u +%H:%M:%SZ) $status  $line"
    prev="$status $line"
  fi
  case "$status" in SUCCESS | FAILURE | CANCELED) break ;; esac
  sleep "$poll"
done

url=$(jq -r .logURL <<<"$view")
sha=$(jq -r .gitCommitHash <<<"$view")

for job_id in $(jq -r '.jobs[] | select(.status == "FAILURE") | .id' <<<"$view"); do
  key=$(jq -r --arg id "$job_id" '.jobs[] | select(.id == $id) | .key' <<<"$view")
  echo "::group::logs of failed job $key"
  $eas workflow:logs "$job_id" --non-interactive 2>&1 | tail -200
  echo "::endgroup::"
  echo "::error title=EAS job $key failed::$url"
done

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### EAS: $(jq -r .workflow.name <<<"$view") — $status"
    echo
    echo "Commit \`${sha:0:7}\` · [EAS run]($url)"
    echo
    echo "| Job | Status |"
    echo "| --- | --- |"
    jq -r '.jobs[] | "| \(.name) | \(.status) |"' <<<"$view"
  } >>"$GITHUB_STEP_SUMMARY"
fi

[ "$status" = SUCCESS ]
