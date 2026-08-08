#!/usr/bin/env bash
#
# Refresh docs/api/ from the Blendn-Admin repo.
#
# These are mirrors, not sources. The API and its documentation live together in
# Blendn-Admin so they change in one commit; copying them here lets you read the
# contract without a second checkout. The cost is that a copy rots, so this
# script exists to make refreshing it one command and to stamp each file with
# the commit it came from — a mirror whose age you cannot see is worse than no
# mirror, because it reads as current.
#
#   ./scripts/sync-api-docs.sh [path-to-blendn-admin]
#
# Then `git diff docs/api/` shows exactly what changed on the server side since
# the last sync. That diff is the point of the whole exercise.

set -euo pipefail

ADMIN="${1:-../blendn-admin}"
DEST="$(cd "$(dirname "$0")/.." && pwd)/docs/api"

if [ ! -d "$ADMIN/docs" ]; then
  echo "Not a Blendn-Admin checkout: $ADMIN" >&2
  echo "Usage: $0 [path-to-blendn-admin]" >&2
  exit 1
fi

SHA=$(git -C "$ADMIN" rev-parse --short HEAD)
DATE=$(git -C "$ADMIN" log -1 --format=%cs)
VERSION=$(node -p "require('$ADMIN/package.json').version" 2>/dev/null || echo "unknown")

# Only the documents an app developer needs. The dashboard design briefs, the
# venue and organisation models and the leads pipeline are all organiser-side and
# would only add noise here.
DOCS=(
  API.md
  SOCKET_EVENTS.md
  CHECKIN.md
  USER_JOURNEY.md
  DESIGN_HANDOFF.md
  DESIGN_SYSTEM.md
  client-chat-moderation-guide.md
)

mkdir -p "$DEST"

for doc in "${DOCS[@]}"; do
  src="$ADMIN/docs/$doc"
  [ -f "$src" ] || { echo "missing upstream: $doc" >&2; continue; }
  {
    echo "<!--"
    echo "  MIRROR — do not edit here. Edits belong in Blendn-Admin/docs/$doc."
    echo "  From Blendn-Admin @ $SHA (v$VERSION, $DATE)."
    echo "  Refresh: ./scripts/sync-api-docs.sh"
    echo "-->"
    echo
    cat "$src"
  } > "$DEST/$doc"
  echo "  $doc"
done

echo "Synced from Blendn-Admin @ $SHA (v$VERSION)."
