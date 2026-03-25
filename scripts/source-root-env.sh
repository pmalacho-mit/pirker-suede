SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export SECRET_GUARD_FILE="${1:-"$SCRIPT_DIR/../../.env"}"

echo $SECRET_GUARD_FILE

# Load secrets into environment BEFORE the guard starts
if [[ -f "$SECRET_GUARD_FILE" ]]; then
  set -a
  source "$SECRET_GUARD_FILE"
  set +a
  echo "[secrets] Loaded .env into environment"
fi

echo $ANTHROPIC_API_KEY