"""Main entry point for Amplifier VS Code server."""

import uvicorn
import os


if __name__ == "__main__":
    host = os.getenv("AMPLIFIER_HOST", "127.0.0.1")
    port = int(os.getenv("AMPLIFIER_PORT", "8765"))

    uvicorn.run(
        "amplifier_vscode_server.app:app",
        host=host,
        port=port,
        reload=False,
        log_level="info"
    )
