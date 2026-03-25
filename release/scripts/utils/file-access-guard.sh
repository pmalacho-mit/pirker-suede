#!/bin/bash
# ╔═══════════════════════════════════════════════════════════════════════════╗
# ║  file-access-guard — kill a process if it touches any protected file      ║
# ╚═══════════════════════════════════════════════════════════════════════════╝
#
# Wraps any command and monitors one or more sensitive files (e.g. .env,
# credentials, keys). If the wrapped process (or anything it spawns) reads
# ANY protected file after an initial per-file grace window, the entire
# process tree is killed immediately.
#
# HOW IT WORKS
#   Uses inotifywait to watch for OPEN and ACCESS inotify events on all
#   target files simultaneously. A normal read (cat, python open()) produces
#   OPEN then ACCESS. An mmap bypass produces OPEN only (no ACCESS).
#
#   Grace window: each file independently allows N startup events (default 2:
#   one OPEN + one ACCESS) so the wrapped command can load config at startup.
#   After a file's grace is exhausted, any touch on that file is fatal.
#
# USAGE
#   file-access-guard [OPTIONS] -- <command> [args...]
#
# OPTIONS
#   -f, --file <path>       File to protect (repeatable for multiple files)
#   -g, --grace <n>         Startup events to allow per file (default: 2)
#   -h, --help              Show this help
#
# EXAMPLES
#   # Protect a single file
#   file-access-guard -f .env -- python child.py
#
#   # Protect multiple files
#   file-access-guard -f .env -f credentials.json -f id_rsa -- python child.py
#
#   # Allow 4 startup events per file
#   file-access-guard -f secrets.json -f .env -g 4 -- node server.js
#
# CAVEATS
#   • Requires inotify-tools (inotifywait). Linux only.
#   • The wrapped command runs in its own process group (via setsid) so the
#     kill targets the entire tree. If the command itself calls setsid, its
#     children may escape.
#   • A 0.5 s window exists between OPEN and ACCESS detection. This is NOT
#     a security gap — both paths terminate the process. The delay only
#     exists to distinguish read(2) vs mmap(2) in the log output.
#   • inotify watches do not survive file replacement (mv new old). If a
#     protected file is atomically replaced, the watch silently stops.
#   • Grace events are tracked per file. If you protect 3 files with -g 2,
#     each file independently allows 2 startup events before arming.
#
# LICENSE
#   MIT — use at your own risk.
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Argument parsing ────────────────────────────────────────────
GUARDED_FILES=()
STARTUP_EVENTS=2
COMMAND=()

usage() {
  echo "Usage: file-access-guard -f <file> [-f <file>...] [-g <n>] -- <command> [args...]"
  echo ""
  echo "Options:"
  echo "  -f, --file <path>   File to protect (repeatable)"
  echo "  -g, --grace <n>     Startup events per file (default: 2)"
  echo "  -h, --help          Show this help"
}

while [ $# -gt 0 ]; do
  case "$1" in
    -f|--file)    GUARDED_FILES+=("$2"); shift 2 ;;
    -g|--grace)   STARTUP_EVENTS="$2";  shift 2 ;;
    -h|--help)    usage; exit 0                  ;;
    --)           shift; COMMAND=("$@"); break    ;;
    -*)           echo "[file-access-guard] ERROR: Unknown option: $1"; usage; exit 1 ;;
    *)            COMMAND=("$@"); break ;;
  esac
done

# ─── Validation ──────────────────────────────────────────────────
if [ ${#GUARDED_FILES[@]} -eq 0 ]; then
  echo "[file-access-guard] ERROR: No files specified. Use -f <path> (repeatable)."
  exit 1
fi

if [ ${#COMMAND[@]} -eq 0 ]; then
  echo "[file-access-guard] ERROR: No command specified."
  echo ""
  usage
  exit 1
fi

if ! command -v inotifywait &>/dev/null; then
  echo "[file-access-guard] ERROR: inotifywait not found. Install inotify-tools."
  exit 1
fi

# Resolve to absolute paths and verify existence
RESOLVED_FILES=()
for f in "${GUARDED_FILES[@]}"; do
  if [ ! -e "$f" ]; then
    echo "[file-access-guard] ERROR: Protected file does not exist: $f"
    exit 1
  fi
  RESOLVED_FILES+=("$(realpath "$f")")
done
GUARDED_FILES=("${RESOLVED_FILES[@]}")

# ─── State ───────────────────────────────────────────────────────
CHILD_PID=""
INOTIFY_PID=""

cleanup() {
  if [ -n "$INOTIFY_PID" ] && kill -0 "$INOTIFY_PID" 2>/dev/null; then
    kill "$INOTIFY_PID" 2>/dev/null || true
  fi
  if [ -n "$CHILD_PID" ] && kill -0 "$CHILD_PID" 2>/dev/null; then
    echo "[file-access-guard] Shutting down child (PID $CHILD_PID)..."
    kill -TERM -- -"$CHILD_PID" 2>/dev/null || true
    sleep 1
    kill -KILL -- -"$CHILD_PID" 2>/dev/null || true
  fi
  echo "[file-access-guard] Exited."
}
trap cleanup EXIT

# ─── Start the child in its own process group ────────────────────
setsid "${COMMAND[@]}" &
CHILD_PID=$!
echo "[file-access-guard] Child started (PID $CHILD_PID)"
echo "[file-access-guard] Watching: ${GUARDED_FILES[*]}"
echo "[file-access-guard] Startup grace: $STARTUP_EVENTS event(s) per file, then armed."

# ─── Start continuous monitor ────────────────────────────────────
#
# Watch both OPEN and ACCESS events on all protected files.
#
# A normal read (cat, python open()) produces: OPEN then ACCESS
# An mmap bypass produces: OPEN only (no ACCESS)
#
# Per-file grace: allow first N events on each file.
# After a file is armed:
#   ACCESS → kill immediately (unauthorized read)
#   OPEN   → wait 0.5s for ACCESS to follow:
#            - ACCESS arrives → kill (unauthorized read)
#            - timeout        → kill (mmap bypass detected)
#
# The 0.5s wait is NOT a security window — both paths end in death.
# It exists only to distinguish the attack type in logs.

kill_child() {
  local reason="$1"
  local file="$2"
  echo "[file-access-guard] *** $reason on $file ***"
  echo "[file-access-guard] Killing child (PID $CHILD_PID)..."
  kill -TERM -- -"$CHILD_PID" 2>/dev/null || true
  sleep 1
  kill -KILL -- -"$CHILD_PID" 2>/dev/null || true
  echo "[file-access-guard] Child terminated."
  exit 1
}

inotifywait -m -q -e access -e open "${GUARDED_FILES[@]}" 2>/dev/null | {
  # Per-file event counters using parallel arrays (bash 3.2 compatible —
  # no associative arrays, since macOS ships bash 3.2).
  EVENT_COUNTS=()
  for i in "${!GUARDED_FILES[@]}"; do
    EVENT_COUNTS[$i]=0
  done

  while read -r _dir events _file; do
    # Reconstruct full path. inotifywait output format varies:
    #   Linux:      /path/to/dir/ EVENTS filename
    #   Some ports: /path/to/file EVENTS
    if [ -n "$_file" ]; then
      filepath="${_dir}${_file}"
    else
      filepath="$_dir"
    fi

    # Find which watched file this event belongs to
    file_idx=-1
    for i in "${!GUARDED_FILES[@]}"; do
      if [ "${GUARDED_FILES[$i]}" = "$filepath" ]; then
        file_idx=$i
        break
      fi
    done
    if [ "$file_idx" -eq -1 ]; then
      # Event on an unrecognized path — skip
      continue
    fi

    count=${EVENT_COUNTS[$file_idx]}
    ((++count))
    EVENT_COUNTS[$file_idx]=$count
    shortname="${filepath##*/}"

    if [ "$count" -le "$STARTUP_EVENTS" ]; then
      echo "[file-access-guard] Startup event $count/$STARTUP_EVENTS on $shortname ($events) — allowed."
      if [ "$count" -eq "$STARTUP_EVENTS" ]; then
        echo "[file-access-guard] $shortname armed."
      fi
      continue
    fi

    case "$events" in
      *ACCESS*)
        kill_child "UNAUTHORIZED READ (read syscall)" "$filepath"
        ;;
      *OPEN*)
        # Open without access yet — wait briefly for access to follow
        if read -t 0.5 -r _d2 events2 _f2; then
          kill_child "UNAUTHORIZED READ (open + read syscall)" "$filepath"
        else
          kill_child "UNAUTHORIZED MMAP BYPASS (open without read)" "$filepath"
        fi
        ;;
    esac
  done
} &
INOTIFY_PID=$!

# ─── Wait for child to exit ─────────────────────────────────────
wait "$CHILD_PID" 2>/dev/null
CHILD_EXIT=$?

sleep 0.2
exit "$CHILD_EXIT"