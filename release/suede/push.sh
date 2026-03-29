SUEDE_DIR="$(cd "$(dirname "$0")" && pwd)"
bash <(curl https://suede.sh/push) --dry "$SUEDE_DIR/"