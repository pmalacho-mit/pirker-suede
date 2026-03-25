#!/bin/bash

# No set -e: test scripts need to handle failures gracefully

TEST_DIR=$(mktemp -d)
SECRET_FILE="$TEST_DIR/.env"
GUARD_SCRIPT="${1:?Usage: test-secret-guard.sh /path/to/secret-guard.sh}"

echo "SECRET=hunter2" > "$SECRET_FILE"
echo "=== Test setup ==="
echo "  Secret file: $SECRET_FILE"
echo "  Guard script: $GUARD_SCRIPT"
echo ""

cleanup() {
  rm -rf "$TEST_DIR"
}
trap cleanup EXIT

PASS=0
FAIL=0

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  ✓ $label"
    ((PASS++))
  else
    echo "  ✗ $label (expected=$expected, actual=$actual)"
    ((FAIL++))
  fi
}

# ─── Test 1: First read is allowed ──────────────────────────────
echo "=== Test 1: First read is allowed ==="

SECRET_GUARD_FILE="$SECRET_FILE" bash "$GUARD_SCRIPT" bash -c '
  sleep 1
  cat "$0" > /dev/null
  sleep 30
' "$SECRET_FILE" &
GUARD_PID=$!
sleep 2

if kill -0 "$GUARD_PID" 2>/dev/null; then
  assert_eq "Guard still alive after first read" "alive" "alive"
else
  assert_eq "Guard still alive after first read" "alive" "dead"
fi

kill "$GUARD_PID" 2>/dev/null; wait "$GUARD_PID" 2>/dev/null || true
echo ""

# ─── Test 2: Second read kills the agent ─────────────────────────
echo "=== Test 2: Second read kills the agent ==="

echo "SECRET=hunter2" > "$SECRET_FILE"

SECRET_GUARD_FILE="$SECRET_FILE" bash "$GUARD_SCRIPT" bash -c '
  sleep 1
  cat "$0" > /dev/null      # first read — allowed
  sleep 1
  cat "$0" > /dev/null      # second read — should trigger kill
  sleep 30                   # should never reach here
' "$SECRET_FILE" &
GUARD_PID=$!

# With monitor mode, kill should be near-instant after second read
sleep 4

if kill -0 "$GUARD_PID" 2>/dev/null; then
  assert_eq "Guard exited after second read" "exited" "still running"
  kill "$GUARD_PID" 2>/dev/null; wait "$GUARD_PID" 2>/dev/null || true
else
  wait "$GUARD_PID" 2>/dev/null
  EXIT_CODE=$?
  assert_eq "Guard exited after second read" "exited" "exited"
  assert_eq "Guard exit code is non-zero" "true" "$([ $EXIT_CODE -ne 0 ] && echo true || echo false)"
fi
echo ""

# ─── Test 3: Guard death kills agent ────────────────────────────
echo "=== Test 3: Guard death kills the agent ==="

echo "SECRET=hunter2" > "$SECRET_FILE"

SECRET_GUARD_FILE="$SECRET_FILE" bash "$GUARD_SCRIPT" bash -c 'sleep 60' &
GUARD_PID=$!
sleep 1

kill "$GUARD_PID" 2>/dev/null
sleep 2

# Check no orphan processes from the agent
ORPHANS=$(pgrep -f "sleep 60" 2>/dev/null | wc -l)
assert_eq "No orphaned agent processes" "0" "$ORPHANS"
echo ""

# ─── Test 4: Near-instant detection ─────────────────────────────
echo "=== Test 4: Kill happens within 1 second of second read ==="

echo "SECRET=hunter2" > "$SECRET_FILE"

SECRET_GUARD_FILE="$SECRET_FILE" bash "$GUARD_SCRIPT" bash -c '
  sleep 1
  cat "$0" > /dev/null      # first read
  sleep 1
  cat "$0" > /dev/null      # second read — should die instantly
  sleep 30
' "$SECRET_FILE" &
GUARD_PID=$!

# Wait for first read + gap + second read = ~3s
sleep 3

# By 3s the guard should already be dead (second read was at ~2s)
# If monitor mode works, kill is near-instant
if kill -0 "$GUARD_PID" 2>/dev/null; then
  assert_eq "Kill was near-instant" "dead by now" "still running"
  kill "$GUARD_PID" 2>/dev/null; wait "$GUARD_PID" 2>/dev/null || true
else
  assert_eq "Kill was near-instant" "dead by now" "dead by now"
fi
echo ""

# ─── Results ─────────────────────────────────────────────────────
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1