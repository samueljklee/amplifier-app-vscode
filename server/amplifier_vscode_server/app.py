"""FastAPI application for Amplifier VS Code extension."""

import logging
import sys

# Configure logging BEFORE any other imports
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stdout,
    force=True  # Override any existing configuration
)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import router

app = FastAPI(
    title="Amplifier VS Code Server",
    description="Backend server for Amplifier VS Code extension",
    version="0.1.0"
)

# CORS middleware for webview communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["vscode-webview://*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router)


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "version": "0.1.0"
    }


@app.get("/info")
async def info():
    """Server information endpoint."""
    return {
        "name": "Amplifier VS Code Server",
        "version": "0.1.0",
        "api_version": "v1",
        "capabilities": {
            "sessions": True,
            "sse": True,
            "profiles": True
        }
    }
