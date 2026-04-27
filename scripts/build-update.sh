#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

CURRENT_VERSION="$(node -p "require('./package.json').version")"

echo "Version actual: $CURRENT_VERSION"
printf "Nueva version: "
read -r NEW_VERSION

if [[ -z "$NEW_VERSION" ]]; then
  echo "No se ingreso version. Cancelado."
  exit 1
fi

if [[ ! "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.-]+)?$ ]]; then
  echo "Version invalida: $NEW_VERSION"
  echo "Usa formato semver, por ejemplo: 1.1.3"
  exit 1
fi

npm version "$NEW_VERSION" --no-git-tag-version

if [[ -z "${COSIGN_KEY:-}" && -f "$PROJECT_DIR/cosign.key" ]]; then
  export COSIGN_KEY="$PROJECT_DIR/cosign.key"
fi

npm run build
