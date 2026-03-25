RELEASE_DIR="$(cd "$(dirname "$0")" && pwd)"
export ENV_FILE="${ENV_FILE:-"$RELEASE_DIR/../.env"}"

# Load secrets into environment BEFORE the guard starts
if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
  echo "[secrets] Loaded .env into environment"
fi

npx tsx "$RELEASE_DIR/api/cli.ts" "$@"