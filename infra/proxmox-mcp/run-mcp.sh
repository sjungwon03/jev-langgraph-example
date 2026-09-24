#!/usr/bin/env bash
set -euo pipefail

# Script to verify environment and start Theorvane/proxmox-mcp
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ -z "${PROXMOX_BASE_URL:-}" ] || [ -z "${PROXMOX_TOKEN_ID:-}" ] || [ -z "${PROXMOX_TOKEN_SECRET:-}" ]; then
  echo "⚠️ PROXMOX_BASE_URL, PROXMOX_TOKEN_ID, or PROXMOX_TOKEN_SECRET not set!"
  echo "Please export them or use the simulation mode."
fi

echo "Starting Proxmox MCP Server (stdio)..."
if [ ! -f "dist/index.js" ]; then
  echo "Building proxmox-mcp..."
  npm install --omit=dev
  npm run build || npx tsup
fi

exec node dist/index.js
