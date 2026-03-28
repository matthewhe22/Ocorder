#!/bin/bash
NODE_BIN="/Users/matthewhe/.nvm/versions/node/v24.14.0/bin"
export PATH="$NODE_BIN:$PATH"
# Ensure yarn is available (symlink npm's global bin if needed)
if ! command -v yarn &>/dev/null; then
  export PATH="$(npm root -g 2>/dev/null | xargs dirname 2>/dev/null || echo ''):$PATH"
fi
cd /Users/matthewhe/Documents/ClaudeProject/OCC_Order/tocs-deploy
exec "$NODE_BIN/vercel" dev --listen 3000
