#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

if [[ -z "${COSIGN_KEY:-}" ]]; then
  export COSIGN_KEY="$PROJECT_DIR/cosign.key"
fi

if [[ ! -f "$COSIGN_KEY" ]]; then
  echo "No existe la llave COSIGN_KEY: $COSIGN_KEY"
  exit 1
fi

if [[ -z "${COSIGN_PASSWORD:-}" ]]; then
  printf "Password de Cosign: "
  stty -echo
  read -r COSIGN_PASSWORD
  stty echo
  printf "\n"
  export COSIGN_PASSWORD
fi

node ./dist/sign.js
