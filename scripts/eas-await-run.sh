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

# Consecutive failed reads before giving up. One failed read is a blip; ten
# minutes of them is a bad run id, token or network, and not worth six hours.
max_misses=10

prev=""
misses=0
while :; do
  if ! view=$($eas workflow:view "$run_id" --json 2>/dev/null); then
    misses=$((misses + 1))
    if [ "$misses" -ge "$max_misses" ]; then
      echo "::error title=EAS run unreadable::workflow:view failed $max_misses times in a row for run $run_id"
      exit 1
    fi
    echo "$(date -u +%H:%M:%SZ) could not read the run ($misses/$max_misses); retrying"
    sleep "$poll"
    continue
  fi
  misses=0
  status=$(jq -r .status <<<"$view")
  line=$(jq -r '[.jobs[] | "\(.key)=\(.status)"] | join("  ")' <<<"$view")
  if [ "$status $line" != "$prev" ]; then
    echo "$(date -u +%H:%M:%SZ) $status  $line"
    prev="$status $line"
  fi
  # Queued (NEW, WAITING) or running: keep waiting. Anything else is a state
  # this job cannot move, ACTION_REQUIRED included, so stop and say so.
  case "$status" in NEW | WAITING | IN_PROGRESS) sleep "$poll" ;; *) break ;; esac
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

case "$status" in
  SUCCESS | FAILURE) ;;
  CANCELED) echo "::error title=EAS run was cancelled::$url" ;;
  *) echo "::error title=EAS run is $status::It will not finish without someone on the EAS page: $url" ;;
esac

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
