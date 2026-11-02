#!/usr/bin/env bash
# True one-command install for macOS/Linux: checks for Node 20+, installs it
# (and wires up PATH) if it's missing, then runs the rest of setup (npm install,
# .env.local, Tectonic). Usage, from a fresh clone:
#   bash scripts/install.sh

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NVM_INSTALL_VERSION="v0.40.1"

node_major() {
  node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1
}

has_node_20() {
  command -v node >/dev/null 2>&1 || return 1
  local major
  major="$(node_major)"
  [ -n "$major" ] && [ "$major" -ge 20 ]
}

install_node_via_nvm() {
  curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_INSTALL_VERSION}/install.sh" | bash
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  nvm install 20
  nvm use 20
}

if has_node_20; then
  echo "Node $(node -v) found."
else
  echo "Node 20+ not found. Installing it..."

  case "$(uname -s)" in
    Darwin)
      if command -v brew >/dev/null 2>&1; then
        brew install node
      else
        echo "Homebrew not found — installing Node via nvm instead (also sets up your PATH)."
        install_node_via_nvm
      fi
      ;;
    Linux)
      # nvm manages the Node version and adds itself to ~/.bashrc / ~/.zshrc, so new
      # shells pick up node/npm on PATH automatically.
      install_node_via_nvm
      ;;
    *)
      echo "Unrecognized OS ($(uname -s)). Install Node 20+ yourself from https://nodejs.org," \
        "then re-run: bash scripts/install.sh"
      exit 1
      ;;
  esac

  if ! has_node_20; then
    echo "Node still isn't on PATH in this shell. Open a new terminal (so it picks up the" \
      "change) and re-run: bash scripts/install.sh"
    exit 1
  fi
  echo "Node $(node -v) installed."
fi

exec node "$ROOT/scripts/setup.mjs"
