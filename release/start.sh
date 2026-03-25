#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")"

API_ENTRY=""
if [[ -f "api/index.ts" ]]; then
	API_ENTRY="api/index.ts"
else
	echo "Error: could not find API entry (expected api/index.ts, src/server/index.ts, or server.ts)." >&2
	exit 1
fi

# Keep frontend and API ports synchronized across Vite and Hono.
export WEB_PORT="${WEB_PORT:-5173}"
export API_PORT="${API_PORT:-3002}"

if ! command -v npm >/dev/null 2>&1; then
	echo "Error: npm is required but was not found on PATH." >&2
	exit 1
fi

echo "[install] npm install"
npm install

if command -v tsx >/dev/null 2>&1; then
	TSX_CMD=(tsx)
elif command -v npx >/dev/null 2>&1; then
	TSX_CMD=(npx tsx)
else
	echo "Error: tsx (or npx) is required to run the server watcher." >&2
	exit 1
fi

INSTALL_SCRIPT="api/ai/tools/external/cli/install.ts"
API_CMD=("${TSX_CMD[@]}" watch "$API_ENTRY")

echo "[install] ensuring external tools"
"${TSX_CMD[@]}" "$INSTALL_SCRIPT"

echo "[codegen] generating model schemas"
npm run codegen

PIDS=()

start_prefixed() {
	local name="$1"
	shift

	setsid bash -c '
		if command -v stdbuf >/dev/null 2>&1; then
			stdbuf -oL -eL "$@" 2>&1
		else
			"$@" 2>&1
		fi
	' _ "$@" 2>&1 | while IFS= read -r line || [[ -n "$line" ]]; do
		printf '[%s] %s\n' "$name" "$line"
	done &

	PIDS+=("$!")
}

_CLEANED=0
cleanup() {
	(( _CLEANED )) && return
	_CLEANED=1
	for pid in "${PIDS[@]:-}"; do
		# Get the process group ID of the setsid child and kill the whole group
		local pgid
		pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ') || true
		if [[ -n "$pgid" ]]; then
			kill -TERM -"$pgid" 2>/dev/null || true
		fi
		kill "$pid" 2>/dev/null || true
	done
	sleep 1
	for pid in "${PIDS[@]:-}"; do
		local pgid
		pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ') || true
		if [[ -n "$pgid" ]]; then
			kill -KILL -"$pgid" 2>/dev/null || true
		fi
		kill -KILL "$pid" 2>/dev/null || true
	done
	fuser -k "${API_PORT}/tcp" 2>/dev/null || true
	fuser -k "${WEB_PORT}/tcp" 2>/dev/null || true
	wait 2>/dev/null || true
}

trap cleanup INT TERM EXIT

echo "[start] web=http://localhost:${WEB_PORT} api=http://localhost:${API_PORT} entry=${API_ENTRY}"
start_prefixed "vite" npm run dev


export SECRET_GUARD_FILE="../.env"

# Load secrets into environment BEFORE the guard starts
if [[ -f "$SECRET_GUARD_FILE" ]]; then
  set -a
  source "$SECRET_GUARD_FILE"
  set +a
  echo "[secrets] Loaded .env into environment"
fi

# Zero allowed reads — the file should never be touched again
export SECRET_GUARD_ALLOWED_EVENTS=0

start_prefixed "api" bash scripts/secret-guard.sh "${API_CMD[@]}"

set +e
wait -n "${PIDS[@]}"
status=$?
set -e

cleanup
exit "$status"
