#!/bin/bash
# Run Amplifier VS Code Extension
# Usage: ./scripts/run.sh [options]
#
# Options:
#   --install    Build and install the VSIX extension
#   --server     Start only the backend server
#   --help       Show this help message

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[amplifier]${NC} $1"; }
warn() { echo -e "${YELLOW}[amplifier]${NC} $1"; }
error() { echo -e "${RED}[amplifier]${NC} $1"; exit 1; }

show_help() {
    echo "Amplifier VS Code Extension Runner"
    echo ""
    echo "Usage: ./scripts/run.sh [options]"
    echo ""
    echo "Options:"
    echo "  (no args)    Launch VS Code with extension in development mode"
    echo "  --install    Build VSIX and install it to your VS Code"
    echo "  --server     Start only the backend server"
    echo "  --build      Build the VSIX without installing"
    echo "  --help       Show this help message"
    echo ""
    echo "Environment:"
    echo "  ANTHROPIC_API_KEY    Required for Anthropic provider"
    echo "  OPENAI_API_KEY       Required for OpenAI provider"
}

check_deps() {
    if ! command -v uv &> /dev/null; then
        error "uv not found. Install from https://docs.astral.sh/uv/"
    fi
    if ! command -v node &> /dev/null; then
        error "node not found. Install Node.js 18+"
    fi
    if ! command -v code &> /dev/null; then
        error "VS Code CLI not found. Install VS Code and add 'code' to PATH"
    fi
}

setup_server() {
    log "Setting up server..."
    cd "$ROOT_DIR/server"
    uv sync
}

setup_extension() {
    log "Setting up extension..."
    cd "$ROOT_DIR/extension"
    npm install
}

build_vsix() {
    log "Building VSIX..."
    cd "$ROOT_DIR/extension"
    npm run vsix
    log "VSIX built: $ROOT_DIR/amplifier-vscode.vsix"
}

install_vsix() {
    build_vsix
    log "Installing VSIX..."
    code --install-extension "$ROOT_DIR/amplifier-vscode.vsix" --force
    log "Extension installed! Restart VS Code to activate."
}

start_server() {
    log "Starting server on http://localhost:8765..."
    cd "$ROOT_DIR/server"
    uv run python -m amplifier_vscode_server
}

launch_dev() {
    # Ensure extension is compiled
    cd "$ROOT_DIR/extension"
    if [ ! -d "dist" ]; then
        log "Compiling extension..."
        npm run compile
    fi
    
    log "Launching VS Code with extension..."
    code "${1:-.}" --extensionDevelopmentPath="$ROOT_DIR/extension"
}

# Parse arguments
case "${1:-}" in
    --help|-h)
        show_help
        exit 0
        ;;
    --install)
        check_deps
        setup_extension
        install_vsix
        ;;
    --build)
        check_deps
        setup_extension
        build_vsix
        ;;
    --server)
        check_deps
        setup_server
        start_server
        ;;
    *)
        check_deps
        setup_extension
        launch_dev "$2"
        ;;
esac
