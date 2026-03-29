#!/bin/bash
# Cosense API helper script
# Required env vars: COSENSE_SID, COSENSE_PROJECT

set -euo pipefail

# Load env vars from shell config if not already set
if [ -z "${COSENSE_SID:-}" ] || [ -z "${COSENSE_PROJECT:-}" ]; then
  for rc in "$HOME/.zshenv" "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.bash_profile"; do
    [ -f "$rc" ] && source "$rc" 2>/dev/null || true
  done
fi

if [ -z "${COSENSE_SID:-}" ]; then
  echo "Error: COSENSE_SID is not set. Export it in ~/.zshrc or ~/.zshenv" >&2
  exit 1
fi
if [ -z "${COSENSE_PROJECT:-}" ]; then
  echo "Error: COSENSE_PROJECT is not set. Export it in ~/.zshrc or ~/.zshenv" >&2
  exit 1
fi

BASE_URL="https://scrapbox.io"
COOKIE_HEADER="Cookie: connect.sid=${COSENSE_SID}"
BACKUP_DIR="${COSENSE_BACKUP_DIR:-/tmp/cosense_backups}"

# --- Helper functions ---

get_csrf_token() {
  curl -s -H "$COOKIE_HEADER" "${BASE_URL}/api/users/me" | \
    python3 -c "import sys,json; print(json.load(sys.stdin).get('csrfToken',''))"
}

do_import() {
  local IMPORT_JSON="$1"
  local TOKEN
  TOKEN=$(get_csrf_token)

  if [ -z "$TOKEN" ]; then
    echo "Error: Could not obtain CSRF token" >&2
    exit 1
  fi

  local TMPFILE
  TMPFILE=$(mktemp /tmp/cosense_import_XXXXXX.json)
  echo "$IMPORT_JSON" > "$TMPFILE"

  curl -s -H "$COOKIE_HEADER" \
    -H "Accept: application/json, text/plain, */*" \
    -H "X-CSRF-TOKEN: ${TOKEN}" \
    -X POST \
    -F "import-file=@${TMPFILE};type=application/json" \
    -F "name=undefined" \
    "${BASE_URL}/api/page-data/import/${COSENSE_PROJECT}.json"

  rm -f "$TMPFILE"
}

# --- Commands ---

case "${1:-}" in
  backup)
    # Usage: cosense_api.sh backup "Page Title"
    # Saves current page content as JSON backup before editing
    mkdir -p "${BACKUP_DIR}"
    TITLE="$2"
    ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$TITLE', safe=''))")
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    SAFE_NAME=$(echo "$TITLE" | sed 's/[^a-zA-Z0-9_-]/_/g')
    BACKUP_FILE="${BACKUP_DIR}/${COSENSE_PROJECT}_${SAFE_NAME}_${TIMESTAMP}.json"
    RESPONSE=$(curl -s -H "$COOKIE_HEADER" "${BASE_URL}/api/pages/${COSENSE_PROJECT}/${ENCODED}")

    # Verify page was retrieved successfully
    if echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'lines' in d" 2>/dev/null; then
      echo "$RESPONSE" > "$BACKUP_FILE"
      echo "Backup saved: ${BACKUP_FILE}"
    else
      echo "Error: Failed to retrieve page '${TITLE}' for backup" >&2
      echo "$RESPONSE" >&2
      exit 1
    fi
    ;;

  safe-import)
    # Usage: cosense_api.sh safe-import '{"pages":[...]}'
    # Backs up all affected pages before importing
    IMPORT_JSON="$2"

    # Extract titles from import JSON and backup each existing page
    TITLES=$(echo "$IMPORT_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for page in data.get('pages', []):
    print(page.get('title', ''))
")

    while IFS= read -r title; do
      [ -z "$title" ] && continue
      ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$title', safe=''))")
      RESPONSE=$(curl -s -H "$COOKIE_HEADER" "${BASE_URL}/api/pages/${COSENSE_PROJECT}/${ENCODED}")

      # Check if page exists (has lines = existing page)
      if echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'lines' in d and len(d['lines'])>0" 2>/dev/null; then
        mkdir -p "${BACKUP_DIR}"
        TIMESTAMP=$(date +%Y%m%d_%H%M%S)
        SAFE_NAME=$(echo "$title" | sed 's/[^a-zA-Z0-9_-]/_/g')
        BACKUP_FILE="${BACKUP_DIR}/${COSENSE_PROJECT}_${SAFE_NAME}_${TIMESTAMP}.json"
        echo "$RESPONSE" > "$BACKUP_FILE"
        echo "Backed up existing page '${title}' -> ${BACKUP_FILE}"
      else
        echo "Page '${title}' is new (no existing content to backup)"
      fi
    done <<< "$TITLES"

    # Proceed with import
    do_import "$IMPORT_JSON"
    ;;

  restore)
    # Usage: cosense_api.sh restore "/path/to/backup.json"
    # Restores a page from a backup file
    BACKUP_FILE="$2"
    if [ ! -f "$BACKUP_FILE" ]; then
      echo "Error: Backup file not found: ${BACKUP_FILE}" >&2
      exit 1
    fi

    # Extract title and lines from backup
    RESTORE_JSON=$(python3 -c "
import sys, json
with open('$BACKUP_FILE') as f:
    data = json.load(f)
title = data.get('title', '')
lines = [line['text'] for line in data.get('lines', [])]
print(json.dumps({'pages': [{'title': title, 'lines': lines}]}, ensure_ascii=False))
")

    do_import "$RESTORE_JSON"
    echo "Restored page from: ${BACKUP_FILE}"
    ;;

  list-backups)
    # Usage: cosense_api.sh list-backups
    if [ -d "$BACKUP_DIR" ]; then
      ls -lt "$BACKUP_DIR"/*.json 2>/dev/null || echo "No backups found"
    else
      echo "No backup directory found"
    fi
    ;;

  get-page)
    # Usage: cosense_api.sh get-page "Page Title"
    TITLE=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$2', safe=''))")
    curl -s -H "$COOKIE_HEADER" "${BASE_URL}/api/pages/${COSENSE_PROJECT}/${TITLE}"
    ;;

  get-page-text)
    # Usage: cosense_api.sh get-page-text "Page Title"
    TITLE=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$2', safe=''))")
    curl -s -H "$COOKIE_HEADER" "${BASE_URL}/api/pages/${COSENSE_PROJECT}/${TITLE}/text"
    ;;

  list-pages)
    # Usage: cosense_api.sh list-pages [limit] [skip] [sort]
    LIMIT="${2:-100}"
    SKIP="${3:-0}"
    SORT="${4:-updated}"
    curl -s -H "$COOKIE_HEADER" "${BASE_URL}/api/pages/${COSENSE_PROJECT}?limit=${LIMIT}&skip=${SKIP}&sort=${SORT}"
    ;;

  search)
    # Usage: cosense_api.sh search "query"
    QUERY=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$2', safe=''))")
    curl -s -H "$COOKIE_HEADER" "${BASE_URL}/api/pages/${COSENSE_PROJECT}/search/query?q=${QUERY}"
    ;;

  csrf-token)
    # Usage: cosense_api.sh csrf-token
    get_csrf_token
    ;;

  import)
    # Usage: cosense_api.sh import '{"pages":[...]}'
    do_import "$2"
    ;;

  *)
    echo "Usage: cosense_api.sh {get-page|get-page-text|list-pages|search|backup|safe-import|restore|list-backups|import} [args...]"
    exit 1
    ;;
esac
