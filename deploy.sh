#!/usr/bin/env bash
set -Eeuo pipefail
PROJECT_ID="${FIREBASE_PROJECT_ID:-vibraaltoai-11f55}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"
for file in rey/index.html rey/game.js rey/net.js rey/app.js firebase.json; do
  [[ -f "$file" ]] || { echo "Falta $file" >&2; exit 1; }
done
command -v node >/dev/null 2>&1 || { echo "Node.js no está instalado" >&2; exit 1; }
command -v firebase >/dev/null 2>&1 || { echo "Firebase CLI no está instalado" >&2; exit 1; }
node scripts/validate.mjs
firebase deploy --project "$PROJECT_ID" --only hosting
echo "REINOS desplegado en el hosting de $PROJECT_ID"
