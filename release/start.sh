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
export API_PORT="${API_PORT:-3001}"

if ! command -v npm >/dev/null 2>&1; then
	echo "Error: npm is required but was not found on PATH." >&2
	exit 1
fi

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

PIDS=()

cleanup() {
	trap - INT TERM EXIT
	for pid in "${PIDS[@]:-}"; do
		kill "$pid" >/dev/null 2>&1 || true
	done
	for pid in "${PIDS[@]:-}"; do
		wait "$pid" >/dev/null 2>&1 || true
	done
}

start_prefixed() {
	local name="$1"
	shift

	(
		set -o pipefail
		if command -v stdbuf >/dev/null 2>&1; then
			stdbuf -oL -eL "$@" 2>&1
		else
			"$@" 2>&1
		fi | while IFS= read -r line || [[ -n "$line" ]]; do
			printf '[%s] %s\n' "$name" "$line"
		done
	) &

	PIDS+=("$!")
}

trap cleanup INT TERM EXIT

echo "[start] web=http://localhost:${WEB_PORT} api=http://localhost:${API_PORT} entry=${API_ENTRY}"
start_prefixed "vite" npm run dev
start_prefixed "api" "${API_CMD[@]}"

set +e
wait -n "${PIDS[@]}"
status=$?
set -e

cleanup
exit "$status"
