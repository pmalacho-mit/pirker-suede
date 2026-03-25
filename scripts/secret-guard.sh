#!/bin/bash
set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────
SECRET_FILE="${SECRET_GUARD_FILE:?Set SECRET_GUARD_FILE to the path to watch}"
STARTUP_EVENTS="${SECRET_GUARD_ALLOWED_EVENTS:-2}"

if [ $# -eq 0 ]; then
  echo "Usage: SECRET_GUARD_FILE=/path/.env secret-guard.sh <command...>"
  exit 1
fi

if ! command -v inotifywait &>/dev/null; then
  echo "[secret-guard] ERROR: inotifywait not found. Install inotify-tools."
  exit 1
fi

# ─── State ───────────────────────────────────────────────────────
AGENT_PID=""
INOTIFY_PID=""

cleanup() {
  if [ -n "$INOTIFY_PID" ] && kill -0 "$INOTIFY_PID" 2>/dev/null; then
    kill "$INOTIFY_PID" 2>/dev/null || true
  fi
  if [ -n "$AGENT_PID" ] && kill -0 "$AGENT_PID" 2>/dev/null; then
    echo "[secret-guard] Shutting down agent (PID $AGENT_PID)..."
    kill -TERM -- -"$AGENT_PID" 2>/dev/null || true
    sleep 1
    kill -KILL -- -"$AGENT_PID" 2>/dev/null || true
  fi
  echo "[secret-guard] Exited."
}
trap cleanup EXIT

# ─── Start the agent in its own process group ────────────────────
setsid "$@" &
AGENT_PID=$!
echo "[secret-guard] Agent started (PID $AGENT_PID)"
echo "[secret-guard] Watching: $SECRET_FILE"
echo "[secret-guard] Startup grace: $STARTUP_EVENTS events allowed, then armed."

# ─── Start continuous monitor ────────────────────────────────────
# Watch both OPEN and ACCESS events.
#
# A normal read (cat, python open()) produces: OPEN then ACCESS
# An mmap bypass produces: OPEN only (no ACCESS)
#
# Startup grace: allow first 2 events (one open + one access).
# After armed:
#   ACCESS → kill immediately (unauthorized read)
#   OPEN   → wait 0.5s for ACCESS to follow:
#            - ACCESS arrives → kill (unauthorized read)
#            - timeout        → kill (mmap bypass detected)
#
# The 0.5s wait is NOT a security window — both paths end in death.
# It exists only to distinguish the attack type in logs.


EVENT_COUNT=0

kill_agent() {
  local reason="$1"
  echo "[secret-guard] *** $reason on $SECRET_FILE ***"
  echo "[secret-guard] Killing agent (PID $AGENT_PID)..."
  kill -TERM -- -"$AGENT_PID" 2>/dev/null || true
  sleep 1
  kill -KILL -- -"$AGENT_PID" 2>/dev/null || true
  echo "[secret-guard] Agent terminated."
  exit 1
}

inotifywait -m -q -e access -e open "$SECRET_FILE" 2>/dev/null | while read -r _dir events _file; do
  ((++EVENT_COUNT))

  if [ "$EVENT_COUNT" -le "$STARTUP_EVENTS" ]; then
    echo "[secret-guard] Startup event $EVENT_COUNT/$STARTUP_EVENTS ($events) — allowed."
    if [ "$EVENT_COUNT" -eq "$STARTUP_EVENTS" ]; then
      echo "[secret-guard] Now armed."
    fi
    continue
  fi

  case "$events" in
    *ACCESS*)
      kill_agent "UNAUTHORIZED READ (read syscall)"
      ;;
    *OPEN*)
      # Open without access yet — wait briefly for access to follow
      if read -t 0.5 -r _dir2 events2 _file2; then
        kill_agent "UNAUTHORIZED READ (open + read syscall)"
      else
        kill_agent "UNAUTHORIZED MMAP BYPASS (open without read)"
      fi
      ;;
  esac
done &
INOTIFY_PID=$!

# ─── Wait for agent to exit ─────────────────────────────────────
wait "$AGENT_PID" 2>/dev/null
AGENT_EXIT=$?

sleep 0.2
exit "$AGENT_EXIT"