#!/usr/bin/env bash

set -euo pipefail

RELEASE_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_EXTERNAL_TOOLS_SCRIPT="$RELEASE_DIR/scripts/install-external-tools.ts"
FILE_ACCESS_GUARD_SCRIPT="$RELEASE_DIR/scripts/utils/file-access-guard.sh"
ENV_FILE="${ENV_FILE:-"$RELEASE_DIR/../.env"}"
API_ENTRY=""
TSX_CMD=()
API_CMD=()

PIDS=()
_CLEANED=0

resolve_api_entry() {
	if [[ -f "$RELEASE_DIR/api/index.ts" ]]; then
		API_ENTRY="$RELEASE_DIR/api/index.ts"
		return
	fi

	echo "Error: could not find API entry (expected api/index.ts, src/server/index.ts, or server.ts)." >&2
	exit 1
}

configure_ports() {
	# Keep frontend and API ports synchronized across Vite and Hono.
	export WEB_PORT="${WEB_PORT:-5173}"
	export API_PORT="${API_PORT:-3002}"
}

require_npm() {
	if command -v npm >/dev/null 2>&1; then
		return
	fi

	echo "Error: npm is required but was not found on PATH." >&2
	exit 1
}

install_npm_dependencies() {
	echo "[install] npm install"
	npm --prefix "$RELEASE_DIR" install
}

resolve_tsx_cmd() {
	if command -v tsx >/dev/null 2>&1; then
		TSX_CMD=(tsx)
		return
	fi

	if command -v npx >/dev/null 2>&1; then
		TSX_CMD=(npx tsx)
		return
	fi

	echo "Error: tsx (or npx) is required to run the server watcher." >&2
	exit 1
}

install_external_tools() {
	echo "[install] ensuring external tools"
	"${TSX_CMD[@]}" "$INSTALL_EXTERNAL_TOOLS_SCRIPT"
}

generate_model_schemas() {
	echo "[codegen] generating model schemas"
	npm --prefix "$RELEASE_DIR" run codegen
}

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

signal_processes() {
	local signal="$1"

	for pid in "${PIDS[@]:-}"; do
		local pgid
		pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ') || true
		if [[ -n "$pgid" ]]; then
			kill "-$signal" -"$pgid" 2>/dev/null || true
		fi
		kill "-$signal" "$pid" 2>/dev/null || true
	done
}

cleanup() {
	(( _CLEANED )) && return
	_CLEANED=1
	signal_processes TERM
	sleep 1
	signal_processes KILL
	fuser -k "${API_PORT}/tcp" 2>/dev/null || true
	fuser -k "${WEB_PORT}/tcp" 2>/dev/null || true
	wait 2>/dev/null || true
}

load_secrets() {
	if [[ ! -f "$ENV_FILE" ]]; then
		return
	fi

	set -a
	source "$ENV_FILE"
	set +a
	echo "[secrets] Loaded .env into environment"
}

start_web() {
	start_prefixed "vite" npm --prefix "$RELEASE_DIR" run dev
}

start_api() {
	local prefix="api"
	local script="$FILE_ACCESS_GUARD_SCRIPT"
	local file="$ENV_FILE"
	local grace=0
	local cmd=("${TSX_CMD[@]}" watch "$API_ENTRY")
	start_prefixed "$prefix" bash "$script" --file "$file" --grace "$grace" -- "${cmd[@]}"
}

wait_for_services() {
	local status

	set +e
	wait -n "${PIDS[@]}"
	status=$?
	set -e

	cleanup
	exit "$status"
}

main() {
	trap cleanup INT TERM EXIT

	resolve_api_entry
	configure_ports
	require_npm
	install_npm_dependencies
	resolve_tsx_cmd
	install_external_tools
	generate_model_schemas
	load_secrets

	echo "[start] web=http://localhost:${WEB_PORT} api=http://localhost:${API_PORT} entry=${API_ENTRY}"
	start_web
	start_api
	wait_for_services
}

main "$@"
