# Amplifier VS Code Extension Development Guide

> **Status**: Design Document
> **Last Updated**: 2025-12-09

## Overview

This document provides the complete development setup, implementation phases, and technical guidance for building the Amplifier VS Code extension.

## Prerequisites

### Required Tools

- **Node.js** >= 18.x (for TypeScript extension)
- **Python** >= 3.11 (for backend server)
- **uv** (Python package manager) - [Installation](https://astral.sh/uv/install)
- **VS Code** >= 1.85.0 (target platform)
- **Git** (for module resolution)

### Recommended VS Code Extensions

- ESLint
- Prettier
- Python
- TypeScript + JavaScript Grammar

## Project Setup

### 1. Clone and Initialize

```bash
# Clone the repository
git clone https://github.com/microsoft/amplifier-app-vscode.git
cd amplifier-app-vscode

# Initialize submodules (if using amplifier-core as submodule)
git submodule update --init --recursive
```

### 2. Extension Setup (TypeScript)

```bash
cd extension

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode for development
npm run watch
```

### 3. Server Setup (Python)

```bash
cd server

# Create virtual environment and install dependencies
uv sync --dev

# Activate virtual environment
source .venv/bin/activate  # macOS/Linux
# or
.venv\Scripts\activate     # Windows
```

### 4. Development Workflow

**Terminal 1 - Extension Watch Mode**:
```bash
cd extension
npm run watch
```

**Terminal 2 - Server**:
```bash
cd server
uv run python -m amplifier_vscode_server
```

**Terminal 3 - VS Code Extension Host**:
- Press `F5` in VS Code to launch Extension Development Host
- Or: `code --extensionDevelopmentPath=./extension`

## Implementation Phases

### Phase 1: Foundation (Week 1-2)

**Goal**: Basic extension activation with server communication.

#### 1.1 Extension Skeleton

```typescript
// extension/src/extension.ts
import * as vscode from 'vscode';
import { AmplifierClient } from './client/AmplifierClient';
import { ServerManager } from './services/ServerManager';
import { CredentialsManager } from './services/CredentialsManager';

let client: AmplifierClient;
let serverManager: ServerManager;
let credentialsManager: CredentialsManager;
let statusBar: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext) {
    console.log('Amplifier extension activating...');

    // Initialize credentials manager
    credentialsManager = new CredentialsManager(context.secrets);

    // Initialize server manager
    serverManager = new ServerManager(context);

    // Create status bar item
    statusBar = vscode.window.createStatusBarItem(
        'amplifier.status',
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBar.command = 'amplifier.showChat';
    context.subscriptions.push(statusBar);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('amplifier.startServer', () => serverManager.start()),
        vscode.commands.registerCommand('amplifier.stopServer', () => serverManager.stop()),
        vscode.commands.registerCommand('amplifier.showChat', () => showChatPanel(context)),
        vscode.commands.registerCommand('amplifier.setApiKey', () => credentialsManager.promptForApiKey())
    );

    // Check prerequisites and start
    await initializeExtension(context);
}

async function initializeExtension(context: vscode.ExtensionContext): Promise<void> {
    // Update status bar to show starting
    updateStatusBar('starting');

    // Check prerequisites
    const prereqCheck = await serverManager.checkPrerequisites();
    if (!prereqCheck.ok) {
        updateStatusBar('error', prereqCheck.error);
        vscode.window.showErrorMessage(prereqCheck.error!, 'Get Help').then(selection => {
            if (selection === 'Get Help') {
                vscode.env.openExternal(vscode.Uri.parse('https://github.com/microsoft/amplifier-app-vscode#prerequisites'));
            }
        });
        return;
    }

    // Check for API key
    const hasApiKey = await credentialsManager.hasApiKey();
    if (!hasApiKey) {
        updateStatusBar('no-api-key');
        // Don't block - user can set key later via chat panel welcome screen
    }

    // Auto-start server if configured
    const config = vscode.workspace.getConfiguration('amplifier');
    if (config.get('server.autoStart', true)) {
        try {
            await serverManager.start();
            updateStatusBar('ready');
        } catch (error) {
            updateStatusBar('error', 'Failed to start server');
            vscode.window.showErrorMessage(`Amplifier: Failed to start server. ${error}`);
        }
    }

    // Initialize client
    client = new AmplifierClient(serverManager.getBaseUrl());
}

function updateStatusBar(state: 'starting' | 'ready' | 'error' | 'no-api-key', message?: string): void {
    switch (state) {
        case 'starting':
            statusBar.text = '$(loading~spin) Amplifier: Starting...';
            statusBar.tooltip = 'Amplifier is starting up';
            statusBar.backgroundColor = undefined;
            break;
        case 'ready':
            statusBar.text = '$(check) Amplifier';
            statusBar.tooltip = 'Amplifier is ready';
            statusBar.backgroundColor = undefined;
            break;
        case 'error':
            statusBar.text = '$(error) Amplifier: Error';
            statusBar.tooltip = message || 'Amplifier encountered an error';
            statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            break;
        case 'no-api-key':
            statusBar.text = '$(key) Amplifier: Set API Key';
            statusBar.tooltip = 'Click to set your API key';
            statusBar.command = 'amplifier.setApiKey';
            statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            break;
    }
    statusBar.show();
}

export function deactivate() {
    // Clean up active sessions before stopping server
    if (chatViewProvider) {
        chatViewProvider.stopAllSessions();
    }
    serverManager?.stop();
}
```

#### 1.2 Credentials Manager

```typescript
// extension/src/services/CredentialsManager.ts
import * as vscode from 'vscode';

export class CredentialsManager {
    private static readonly API_KEY_SECRET = 'amplifier.anthropicApiKey';

    constructor(private secrets: vscode.SecretStorage) {}

    async hasApiKey(): Promise<boolean> {
        const key = await this.getApiKey();
        return !!key;
    }

    async getApiKey(): Promise<string | undefined> {
        // First check SecretStorage
        const storedKey = await this.secrets.get(CredentialsManager.API_KEY_SECRET);
        if (storedKey) {
            return storedKey;
        }
        
        // Fall back to environment variable
        return process.env.ANTHROPIC_API_KEY;
    }

    async setApiKey(key: string): Promise<void> {
        await this.secrets.store(CredentialsManager.API_KEY_SECRET, key);
    }

    async clearApiKey(): Promise<void> {
        await this.secrets.delete(CredentialsManager.API_KEY_SECRET);
    }

    async promptForApiKey(): Promise<boolean> {
        const key = await vscode.window.showInputBox({
            prompt: 'Enter your Anthropic API Key',
            placeHolder: 'sk-ant-api03-...',
            password: true,
            ignoreFocusOut: true,
            validateInput: (value) => {
                if (!value) {
                    return 'API key is required';
                }
                if (!value.startsWith('sk-ant-')) {
                    return 'Anthropic API keys start with sk-ant-';
                }
                return null;
            }
        });

        if (key) {
            await this.setApiKey(key);
            vscode.window.showInformationMessage('API key saved securely');
            return true;
        }
        return false;
    }
}
```

#### 1.3 Server Manager

```typescript
// extension/src/services/ServerManager.ts
import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';

interface PrerequisiteCheck {
    ok: boolean;
    error?: string;
}

export class ServerManager {
    private process: cp.ChildProcess | null = null;
    private port: number;
    private host: string;

    constructor(private context: vscode.ExtensionContext) {
        const config = vscode.workspace.getConfiguration('amplifier');
        this.port = config.get('server.port', 8765);
        this.host = config.get('server.host', '127.0.0.1');
    }

    getBaseUrl(): string {
        return `http://${this.host}:${this.port}`;
    }

    async checkPrerequisites(): Promise<PrerequisiteCheck> {
        // Check Python version
        try {
            const pythonVersion = await this.getCommandOutput('python3 --version');
            const versionMatch = pythonVersion.match(/Python (\d+)\.(\d+)/);
            if (versionMatch) {
                const major = parseInt(versionMatch[1]);
                const minor = parseInt(versionMatch[2]);
                if (major < 3 || (major === 3 && minor < 11)) {
                    return {
                        ok: false,
                        error: `Python 3.11+ required (found ${major}.${minor}). Install from https://python.org`
                    };
                }
            }
        } catch {
            return {
                ok: false,
                error: 'Python 3.11+ is required. Install from https://python.org'
            };
        }

        // Check uv
        try {
            await this.getCommandOutput('uv --version');
        } catch {
            return {
                ok: false,
                error: 'uv package manager required. Install: curl -LsSf https://astral.sh/uv/install.sh | sh'
            };
        }

        return { ok: true };
    }

    private getCommandOutput(command: string): Promise<string> {
        return new Promise((resolve, reject) => {
            cp.exec(command, (error, stdout) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(stdout.trim());
                }
            });
        });
    }

    async start(): Promise<void> {
        if (this.process) {
            vscode.window.showInformationMessage('Amplifier server already running');
            return;
        }

        const serverPath = this.getServerPath();

        this.process = cp.spawn('uv', ['run', 'python', '-m', 'amplifier_vscode_server'], {
            cwd: serverPath,
            env: {
                ...process.env,
                AMPLIFIER_HOST: this.host,
                AMPLIFIER_PORT: String(this.port),
            }
        });

        this.process.stdout?.on('data', (data) => {
            console.log(`[Amplifier Server] ${data}`);
        });

        this.process.stderr?.on('data', (data) => {
            console.error(`[Amplifier Server Error] ${data}`);
        });

        // Wait for server to be ready
        await this.waitForReady();
        vscode.window.showInformationMessage('Amplifier server started');
    }

    async stop(): Promise<void> {
        if (this.process) {
            this.process.kill();
            this.process = null;
            vscode.window.showInformationMessage('Amplifier server stopped');
        }
    }

    private getServerPath(): string {
        // Server bundled with extension or external path
        return path.join(this.context.extensionPath, 'server');
    }

    private async waitForReady(timeout = 10000): Promise<void> {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            try {
                const response = await fetch(`${this.getBaseUrl()}/health`);
                if (response.ok) return;
            } catch {
                // Server not ready yet
            }
            await new Promise(r => setTimeout(r, 100));
        }
        throw new Error('Server failed to start within timeout');
    }
}
```

#### 1.3 Basic Python Server

```python
# server/amplifier_vscode_server/__main__.py
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
    )
```

```python
# server/amplifier_vscode_server/app.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Amplifier VS Code Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["vscode-webview://*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "healthy", "version": "0.1.0"}
```

### Phase 2: Session Management (Week 3-4)

**Goal**: Complete session lifecycle with SSE streaming.

#### 2.1 Session Runner (Adapted from Playground)

```python
# server/amplifier_vscode_server/core/session_runner.py
import asyncio
import uuid
from typing import Any, Callable, Literal

from amplifier_core import AmplifierSession
from amplifier_profiles import ProfileLoader, compile_profile_to_mount_plan

from .ux_systems import VSCodeApprovalSystem, VSCodeDisplaySystem

EventCallback = Callable[[str, dict[str, Any]], None]

class SessionRunner:
    """Wraps AmplifierSession with event streaming for VS Code."""

    def __init__(
        self,
        profile_name: str,
        credentials: dict[str, Any] | None = None,
        event_callback: EventCallback | None = None,
        approval_mode: Literal["auto", "deny", "queue"] = "queue",
        session_id: str | None = None,
        workspace_context: dict[str, Any] | None = None,
    ):
        self.session_id = session_id or str(uuid.uuid4())
        self.profile_name = profile_name
        self.credentials = credentials
        self.event_callback = event_callback
        self.approval_mode = approval_mode
        self.workspace_context = workspace_context

        self._session: AmplifierSession | None = None
        self._approval_system: VSCodeApprovalSystem | None = None
        self._running = False

    async def start(self) -> str:
        """Initialize and start the session."""
        # Load profile and compile mount plan
        loader = ProfileLoader()
        profile = loader.load_profile(self.profile_name)
        mount_plan = compile_profile_to_mount_plan(profile)

        # Inject credentials into provider config
        if self.credentials:
            mount_plan = self._inject_credentials(mount_plan, self.credentials)

        # Inject workspace context into system prompt if provided
        if self.workspace_context:
            mount_plan = self._inject_context(mount_plan, self.workspace_context)

        # Create UX systems
        self._approval_system = VSCodeApprovalSystem(
            event_callback=self.event_callback,
            mode=self.approval_mode,
        )
        display_system = VSCodeDisplaySystem(event_callback=self.event_callback)

        # Create session
        self._session = AmplifierSession(
            config=mount_plan,
            session_id=self.session_id,
            approval_system=self._approval_system,
            display_system=display_system,
        )

        # Initialize
        await self._session.initialize()
        self._running = True

        # Emit start event
        if self.event_callback:
            await self.event_callback("session:start", {
                "session_id": self.session_id,
                "profile": self.profile_name,
            })

        return self.session_id

    async def prompt(self, text: str) -> dict[str, Any]:
        """Submit a prompt and get the response."""
        if not self._session or not self._running:
            raise RuntimeError("Session not running")

        # Emit prompt submit event
        if self.event_callback:
            await self.event_callback("prompt:submit", {
                "session_id": self.session_id,
                "prompt": text,
            })

        # Execute
        response = await self._session.execute(text)

        # Emit complete event
        if self.event_callback:
            await self.event_callback("prompt:complete", {
                "session_id": self.session_id,
                "response": response,
            })

        return {"response": response}

    async def resolve_approval(self, decision: str) -> None:
        """Resolve a pending approval request."""
        if self._approval_system:
            await self._approval_system.resolve(decision)

    async def stop(self) -> None:
        """Stop and cleanup the session."""
        self._running = False

        if self._session:
            await self._session.cleanup()
            self._session = None

        if self.event_callback:
            await self.event_callback("session:end", {
                "session_id": self.session_id,
                "reason": "stopped",
            })

    def _inject_context(
        self,
        mount_plan: dict[str, Any],
        context: dict[str, Any]
    ) -> dict[str, Any]:
        """Inject workspace context into the mount plan."""
        # Build context string
        context_parts = []

        if context.get("workspace_root"):
            context_parts.append(f"Workspace: {context['workspace_root']}")

        if context.get("open_files"):
            files = [f["path"] for f in context["open_files"][:5]]
            context_parts.append(f"Open files: {', '.join(files)}")

        if context.get("git_state"):
            git = context["git_state"]
            context_parts.append(f"Git branch: {git.get('branch', 'unknown')}")

        if context.get("selection"):
            sel = context["selection"]
            context_parts.append(f"Selected: {sel['path']} (lines {sel['range']['start']['line']}-{sel['range']['end']['line']})")

        if context_parts:
            context_str = "\n".join(context_parts)
            # Prepend to system instruction in orchestrator config
            if "orchestrator" not in mount_plan:
                mount_plan["orchestrator"] = {}
            if "config" not in mount_plan["orchestrator"]:
                mount_plan["orchestrator"]["config"] = {}

            existing = mount_plan["orchestrator"]["config"].get("system_instruction", "")
            mount_plan["orchestrator"]["config"]["system_instruction"] = (
                f"## Current Workspace Context\n{context_str}\n\n{existing}"
            )

        return mount_plan

    def _inject_credentials(
        self,
        mount_plan: dict[str, Any],
        credentials: dict[str, Any]
    ) -> dict[str, Any]:
        """Inject API credentials into provider configs."""
        providers = mount_plan.get("providers", [])
        
        for provider in providers:
            module = provider.get("module", "")
            
            # Inject Anthropic API key
            if "anthropic" in module and "anthropic_api_key" in credentials:
                if "config" not in provider:
                    provider["config"] = {}
                provider["config"]["api_key"] = credentials["anthropic_api_key"]
            
            # Future: Add other providers (OpenAI, Azure, etc.)
            # if "openai" in module and "openai_api_key" in credentials:
            #     provider["config"]["api_key"] = credentials["openai_api_key"]
        
        return mount_plan
```

#### 2.2 SSE Event Streaming

```python
# server/amplifier_vscode_server/routes/sessions.py
import asyncio
import json
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..core.session_runner import SessionRunner

router = APIRouter(prefix="/sessions", tags=["sessions"])

# In-memory session storage
_sessions: dict[str, SessionRunner] = {}
_event_queues: dict[str, asyncio.Queue] = {}


class CreateSessionRequest(BaseModel):
    profile: str = "dev"
    credentials: dict[str, Any] | None = None
    context: dict[str, Any] | None = None


class PromptRequest(BaseModel):
    prompt: str
    context_update: dict[str, Any] | None = None


class ApprovalRequest(BaseModel):
    decision: str


def create_sse_event_callback(session_id: str):
    """Create an event callback that pushes to SSE queue."""
    async def callback(event: str, data: dict[str, Any]) -> None:
        if session_id in _event_queues:
            await _event_queues[session_id].put({
                "event": event,
                "data": {**data, "session_id": session_id}
            })
    return callback


@router.post("")
async def create_session(request: CreateSessionRequest):
    """Create a new session."""
    # Create event queue
    session_id = None

    def sync_callback(event: str, data: dict):
        asyncio.create_task(
            _event_queues[session_id].put({"event": event, "data": data})
        )

    # Create session runner
    runner = SessionRunner(
        profile_name=request.profile,
        credentials=request.credentials,
        event_callback=create_sse_event_callback,
        workspace_context=request.context,
    )

    # Start session
    session_id = await runner.start()

    # Store session and queue
    _sessions[session_id] = runner
    _event_queues[session_id] = asyncio.Queue()

    # Re-wire callback now that we have session_id
    runner.event_callback = create_sse_event_callback(session_id)

    return {
        "session_id": session_id,
        "status": "created",
        "profile": request.profile,
    }


@router.get("/{session_id}/events")
async def session_events(session_id: str):
    """SSE endpoint for session events."""
    if session_id not in _sessions:
        raise HTTPException(404, "Session not found")

    async def event_generator():
        queue = _event_queues[session_id]

        while True:
            try:
                # Wait for events with timeout for keepalive
                event = await asyncio.wait_for(queue.get(), timeout=5.0)
                yield f"data: {json.dumps(event)}\n\n"
            except asyncio.TimeoutError:
                # Send keepalive comment
                yield ": keepalive\n\n"
            except Exception:
                break

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@router.post("/{session_id}/prompt")
async def submit_prompt(session_id: str, request: PromptRequest):
    """Submit a prompt to the session."""
    if session_id not in _sessions:
        raise HTTPException(404, "Session not found")

    runner = _sessions[session_id]

    # Run in background so we can return immediately
    asyncio.create_task(runner.prompt(request.prompt))

    return {"status": "processing", "message": "Subscribe to events for response"}


@router.post("/{session_id}/approval")
async def submit_approval(session_id: str, request: ApprovalRequest):
    """Submit an approval decision."""
    if session_id not in _sessions:
        raise HTTPException(404, "Session not found")

    runner = _sessions[session_id]
    await runner.resolve_approval(request.decision)

    return {"status": "approved", "decision": request.decision}


@router.delete("/{session_id}")
async def delete_session(session_id: str):
    """Stop and delete a session."""
    if session_id not in _sessions:
        raise HTTPException(404, "Session not found")

    runner = _sessions.pop(session_id)
    _event_queues.pop(session_id, None)

    await runner.stop()

    return {"status": "stopped"}
```

### Phase 3: Chat Panel (Week 5-6)

**Goal**: Full-featured chat panel with streaming UI.

#### 3.1 Chat View Provider

```typescript
// extension/src/providers/ChatViewProvider.ts
import * as vscode from 'vscode';
import { AmplifierClient } from '../client/AmplifierClient';
import { EventStreamManager } from '../client/EventStream';
import { ContextGatherer } from '../services/ContextGatherer';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'amplifier.chatView';

    private _view?: vscode.WebviewView;
    private _sessionId?: string;
    private _eventStream?: EventStreamManager;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _client: AmplifierClient,
        private readonly _contextGatherer: ContextGatherer
    ) {}

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'newSession':
                    await this._startSession(message.profile);
                    break;
                case 'sendMessage':
                    await this._sendMessage(message.text);
                    break;
                case 'stopSession':
                    await this._stopSession();
                    break;
            }
        });
    }

    private async _startSession(profile: string = 'dev'): Promise<void> {
        // Gather workspace context
        const context = await this._contextGatherer.gather();

        // Create session
        const response = await this._client.createSession(profile, context);
        this._sessionId = response.session_id;

        // Subscribe to events with reconnection support
        this._eventStream = new EventStreamManager(this._client.baseUrl);
        this._eventStream.subscribe(this._sessionId, {
            onConnected: () => {
                this._postMessage({ type: 'connected' });
            },
            onReconnecting: (attempt, delay) => {
                this._postMessage({ type: 'reconnecting', attempt, delay });
            },
            onContentDelta: (data) => {
                this._postMessage({ type: 'contentDelta', data });
            },
            onThinkingDelta: (data) => {
                this._postMessage({ type: 'thinkingDelta', data });
            },
            onToolStart: (data) => {
                this._postMessage({ type: 'toolStart', data });
            },
            onToolEnd: (data) => {
                this._postMessage({ type: 'toolEnd', data });
            },
            onApprovalRequired: async (data) => {
                await this._handleApproval(data);
            },
            onPromptComplete: (data) => {
                this._postMessage({ type: 'promptComplete', data });
            },
            onError: (error) => {
                this._postMessage({ type: 'error', error: error.message });
            }
        });

        this._postMessage({ type: 'sessionStarted', sessionId: this._sessionId });
    }

    private async _sendMessage(text: string): Promise<void> {
        if (!this._sessionId) {
            vscode.window.showErrorMessage('No active session');
            return;
        }

        await this._client.submitPrompt(this._sessionId, text);
    }

    private async _stopSession(): Promise<void> {
        if (this._sessionId) {
            this._eventStream?.unsubscribe();
            await this._client.deleteSession(this._sessionId);
            this._sessionId = undefined;
            this._postMessage({ type: 'sessionStopped' });
        }
    }

    private async _handleApproval(data: ApprovalRequiredEvent): Promise<void> {
        const choice = await vscode.window.showQuickPick(data.options, {
            placeHolder: data.prompt,
            title: 'Amplifier: Approval Required',
            ignoreFocusOut: true
        });

        const decision = choice || (data.default === 'allow' ? data.options[0] : data.options[1]);
        await this._client.submitApproval(this._sessionId!, decision);
    }

    private _postMessage(message: any): void {
        this._view?.webview.postMessage(message);
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'chat.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'chat.css')
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource}; connect-src http://127.0.0.1:*; img-src ${webview.cspSource} data:;">
    <link href="${styleUri}" rel="stylesheet">
    <title>Amplifier Chat</title>
</head>
<body>
    <div id="app">
        <div id="messages"></div>
        <div id="thinking" class="hidden"></div>
        <div id="tools" class="hidden"></div>
        <div id="input-area">
            <textarea id="prompt" placeholder="Ask Amplifier..."></textarea>
            <button id="send">Send</button>
        </div>
    </div>
    <script src="${scriptUri}"></script>
</body>
</html>`;
    }
}
```

### Phase 4: Code Actions & Completions (Week 7-8)

**Goal**: IDE integration features.

#### 4.1 Code Action Provider

```typescript
// extension/src/providers/CodeActionProvider.ts
import * as vscode from 'vscode';
import { AmplifierClient } from '../client/AmplifierClient';

export class AmplifierCodeActionProvider implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix,
        vscode.CodeActionKind.Refactor
    ];

    constructor(private readonly client: AmplifierClient) {}

    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];

        // Add "Explain with Amplifier" action
        const explainAction = new vscode.CodeAction(
            'Explain with Amplifier',
            vscode.CodeActionKind.Empty
        );
        explainAction.command = {
            command: 'amplifier.explainSelection',
            title: 'Explain with Amplifier',
            arguments: [document, range]
        };
        actions.push(explainAction);

        // Add "Improve with Amplifier" action
        const improveAction = new vscode.CodeAction(
            'Improve with Amplifier',
            vscode.CodeActionKind.Refactor
        );
        improveAction.command = {
            command: 'amplifier.improveSelection',
            title: 'Improve with Amplifier',
            arguments: [document, range]
        };
        actions.push(improveAction);

        // If there are diagnostics, offer to fix them
        if (context.diagnostics.length > 0) {
            const fixAction = new vscode.CodeAction(
                'Fix with Amplifier',
                vscode.CodeActionKind.QuickFix
            );
            fixAction.command = {
                command: 'amplifier.fixDiagnostics',
                title: 'Fix with Amplifier',
                arguments: [document, range, context.diagnostics]
            };
            fixAction.diagnostics = context.diagnostics;
            fixAction.isPreferred = true;
            actions.push(fixAction);
        }

        return actions;
    }
}
```

### Phase 5: Polish & Testing (Week 9-10)

**Goal**: Production readiness.

#### 5.1 Test Structure

```
extension/
├── src/
│   └── test/
│       ├── suite/
│       │   ├── extension.test.ts
│       │   ├── client.test.ts
│       │   └── providers.test.ts
│       └── runTest.ts

server/
├── tests/
│   ├── test_app.py
│   ├── test_sessions.py
│   ├── test_session_runner.py
│   └── conftest.py
```

#### 5.2 Extension Tests

```typescript
// extension/src/test/suite/extension.test.ts
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Extension should be present', () => {
        assert.ok(vscode.extensions.getExtension('microsoft.amplifier-vscode'));
    });

    test('Extension should activate', async () => {
        const ext = vscode.extensions.getExtension('microsoft.amplifier-vscode');
        await ext?.activate();
        assert.strictEqual(ext?.isActive, true);
    });

    test('Commands should be registered', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(commands.includes('amplifier.showChat'));
        assert.ok(commands.includes('amplifier.startServer'));
        assert.ok(commands.includes('amplifier.stopServer'));
    });
});
```

#### 5.3 Server Tests

```python
# server/tests/test_sessions.py
import pytest
from httpx import AsyncClient
from amplifier_vscode_server.app import app


@pytest.fixture
async def client():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_health(client):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


@pytest.mark.asyncio
async def test_create_session(client):
    response = await client.post("/sessions", json={"profile": "dev"})
    assert response.status_code == 200
    assert "session_id" in response.json()


@pytest.mark.asyncio
async def test_session_lifecycle(client):
    # Create
    create_resp = await client.post("/sessions", json={"profile": "dev"})
    session_id = create_resp.json()["session_id"]

    # Get status
    status_resp = await client.get(f"/sessions/{session_id}")
    assert status_resp.status_code == 200

    # Delete
    delete_resp = await client.delete(f"/sessions/{session_id}")
    assert delete_resp.status_code == 200
```

## Configuration

### package.json (Extension Manifest)

```json
{
    "name": "amplifier-vscode",
    "displayName": "Amplifier AI Assistant",
    "description": "Native AI assistance powered by Amplifier",
    "version": "0.1.0",
    "publisher": "microsoft",
    "engines": {
        "vscode": "^1.85.0"
    },
    "categories": ["Other", "Machine Learning"],
    "activationEvents": [
        "onStartupFinished"
    ],
    "main": "./dist/extension.js",
    "contributes": {
        "commands": [
            {
                "command": "amplifier.showChat",
                "title": "Amplifier: Show Chat"
            },
            {
                "command": "amplifier.startServer",
                "title": "Amplifier: Start Server"
            },
            {
                "command": "amplifier.stopServer",
                "title": "Amplifier: Stop Server"
            },
            {
                "command": "amplifier.explainSelection",
                "title": "Amplifier: Explain Selection"
            },
            {
                "command": "amplifier.improveSelection",
                "title": "Amplifier: Improve Selection"
            }
        ],
        "viewsContainers": {
            "activitybar": [
                {
                    "id": "amplifier",
                    "title": "Amplifier",
                    "icon": "resources/amplifier.svg"
                }
            ]
        },
        "views": {
            "amplifier": [
                {
                    "type": "webview",
                    "id": "amplifier.chatView",
                    "name": "Chat"
                }
            ]
        },
        "configuration": {
            "title": "Amplifier",
            "properties": {
                "amplifier.enabled": {
                    "type": "boolean",
                    "default": true,
                    "description": "Enable Amplifier AI assistant"
                },
                "amplifier.server.autoStart": {
                    "type": "boolean",
                    "default": true,
                    "description": "Automatically start the Amplifier server"
                },
                "amplifier.server.port": {
                    "type": "number",
                    "default": 8765,
                    "description": "Port for the Amplifier server"
                },
                "amplifier.profile": {
                    "type": "string",
                    "default": "dev",
                    "description": "Default Amplifier profile"
                }
            }
        }
    },
    "scripts": {
        "compile": "tsc -p ./",
        "watch": "tsc -watch -p ./",
        "package": "vsce package",
        "test": "node ./out/test/runTest.js"
    },
    "devDependencies": {
        "@types/node": "^20.0.0",
        "@types/vscode": "^1.85.0",
        "typescript": "^5.3.0",
        "@vscode/test-electron": "^2.3.0",
        "vsce": "^2.15.0"
    }
}
```

### pyproject.toml (Server)

```toml
[project]
name = "amplifier-vscode-server"
version = "0.1.0"
description = "Backend server for Amplifier VS Code extension"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.109.0",
    "uvicorn>=0.27.0",
    "pydantic>=2.5.0",
    "amplifier-core",
    "amplifier-profiles",
    "amplifier-collections",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0.0",
    "pytest-asyncio>=0.23.0",
    "httpx>=0.26.0",
]

[tool.uv.sources]
# TODO: Pin to specific commit/tag before v1.0 release
# For now tracking main for development, but this should be changed to:
# amplifier-core = { git = "https://github.com/microsoft/amplifier-core", rev = "abc123" }
# or
# amplifier-core = { git = "https://github.com/microsoft/amplifier-core", tag = "v0.5.0" }
amplifier-core = { git = "https://github.com/microsoft/amplifier-core", branch = "main" }
amplifier-profiles = { git = "https://github.com/microsoft/amplifier-profiles", branch = "main" }
amplifier-collections = { git = "https://github.com/microsoft/amplifier-collections", branch = "main" }
```

## Debugging

### Extension Debugging

1. Open the extension folder in VS Code
2. Press `F5` to launch Extension Development Host
3. Set breakpoints in TypeScript code
4. View debug output in Debug Console

### Server Debugging

```bash
# Run with debug logging
AMPLIFIER_LOG_LEVEL=DEBUG uv run python -m amplifier_vscode_server

# Run with debugger
uv run python -m debugpy --listen 5678 -m amplifier_vscode_server
```

### Common Issues

**Issue**: Extension doesn't activate
- Check Output panel > Amplifier
- Verify server is running: `curl http://localhost:8765/health`

**Issue**: SSE connection fails
- Check CORS configuration
- Verify EventSource support in webview CSP

**Issue**: Sessions hang
- Check server logs for errors
- Verify amplifier-core modules are installed

## Deployment

### Building the Extension

```bash
cd extension
npm run package
# Creates amplifier-vscode-0.1.0.vsix
```

### Installing Locally

```bash
code --install-extension amplifier-vscode-0.1.0.vsix
```

### Publishing to Marketplace

```bash
vsce publish
```

## Advanced Features Implementation

### Inline Diff Preview

Shows proposed file changes as a diff before applying them.

```typescript
// extension/src/services/DiffPreviewProvider.ts
import * as vscode from 'vscode';
import * as path from 'path';

export class DiffPreviewProvider implements vscode.TextDocumentContentProvider {
  private static readonly SCHEME = 'amplifier-proposed';
  private proposedContents = new Map<string, string>();
  
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  constructor(context: vscode.ExtensionContext) {
    context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(
        DiffPreviewProvider.SCHEME,
        this
      )
    );
  }

  provideTextDocumentContent(uri: vscode.Uri): string | undefined {
    return this.proposedContents.get(uri.toString());
  }

  async showDiff(
    filePath: string,
    proposedContent: string
  ): Promise<'accept' | 'reject' | 'edit'> {
    const fileUri = vscode.Uri.file(filePath);
    const timestamp = Date.now();
    const proposedUri = vscode.Uri.parse(
      `${DiffPreviewProvider.SCHEME}:${filePath}?t=${timestamp}`
    );
    
    this.proposedContents.set(proposedUri.toString(), proposedContent);
    
    try {
      await vscode.commands.executeCommand(
        'vscode.diff',
        fileUri,
        proposedUri,
        `${path.basename(filePath)} ↔ Proposed Changes`,
        { preview: false, viewColumn: vscode.ViewColumn.Beside }
      );
      
      const choice = await vscode.window.showInformationMessage(
        `Apply proposed changes to ${path.basename(filePath)}?`,
        { modal: false },
        'Accept', 'Reject', 'Edit First'
      );
      
      return choice === 'Accept' ? 'accept' :
             choice === 'Edit First' ? 'edit' : 'reject';
    } finally {
      this.proposedContents.delete(proposedUri.toString());
    }
  }
}
```

### Context Mentions

Resolves `@mentions` in chat input to include explicit context.

```typescript
// extension/src/services/MentionResolver.ts
import * as vscode from 'vscode';
import * as path from 'path';

export interface ResolvedMention {
  type: 'file' | 'folder' | 'selection' | 'problems' | 'git' | 'url';
  content: string;
  metadata?: Record<string, any>;
}

export class MentionResolver {
  private readonly patterns = {
    file: /@file:([^\s]+)/g,
    folder: /@folder:([^\s]+)/g,
    selection: /@selection/g,
    problems: /@problems/g,
    git: /@git/g,
    url: /@url:([^\s]+)/g,
  };

  async resolve(input: string): Promise<{
    text: string;
    mentions: ResolvedMention[];
  }> {
    const mentions: ResolvedMention[] = [];
    let cleanText = input;

    // Resolve @file: mentions
    for (const match of input.matchAll(this.patterns.file)) {
      const filePath = match[1];
      const resolved = await this.resolveFile(filePath);
      if (resolved) {
        mentions.push(resolved);
        cleanText = cleanText.replace(match[0], '');
      }
    }

    // Resolve @folder: mentions
    for (const match of input.matchAll(this.patterns.folder)) {
      const folderPath = match[1];
      const resolved = await this.resolveFolder(folderPath);
      if (resolved) {
        mentions.push(resolved);
        cleanText = cleanText.replace(match[0], '');
      }
    }

    // Resolve @selection
    if (this.patterns.selection.test(input)) {
      const resolved = await this.resolveSelection();
      if (resolved) {
        mentions.push(resolved);
        cleanText = cleanText.replace(/@selection/g, '');
      }
    }

    // Resolve @problems
    if (this.patterns.problems.test(input)) {
      const resolved = await this.resolveProblems();
      if (resolved) {
        mentions.push(resolved);
        cleanText = cleanText.replace(/@problems/g, '');
      }
    }

    // Resolve @git
    if (this.patterns.git.test(input)) {
      const resolved = await this.resolveGit();
      if (resolved) {
        mentions.push(resolved);
        cleanText = cleanText.replace(/@git/g, '');
      }
    }

    // Resolve @url: mentions
    for (const match of input.matchAll(this.patterns.url)) {
      const url = match[1];
      const resolved = await this.resolveUrl(url);
      if (resolved) {
        mentions.push(resolved);
        cleanText = cleanText.replace(match[0], '');
      }
    }

    return { text: cleanText.trim(), mentions };
  }

  private async resolveFile(filePath: string): Promise<ResolvedMention | null> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) return null;

      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.join(workspaceFolder.uri.fsPath, filePath);

      const uri = vscode.Uri.file(absolutePath);
      const doc = await vscode.workspace.openTextDocument(uri);

      return {
        type: 'file',
        content: doc.getText(),
        metadata: { path: absolutePath, language: doc.languageId },
      };
    } catch {
      return null;
    }
  }

  private async resolveFolder(folderPath: string): Promise<ResolvedMention | null> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) return null;

      const absolutePath = path.isAbsolute(folderPath)
        ? folderPath
        : path.join(workspaceFolder.uri.fsPath, folderPath);

      const uri = vscode.Uri.file(absolutePath);
      const entries = await vscode.workspace.fs.readDirectory(uri);

      const fileList = entries
        .map(([name, type]) =>
          `${type === vscode.FileType.Directory ? '📁' : '📄'} ${name}`
        )
        .join('\n');

      return { type: 'folder', content: fileList, metadata: { path: absolutePath } };
    } catch {
      return null;
    }
  }

  private async resolveSelection(): Promise<ResolvedMention | null> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) return null;

    return {
      type: 'selection',
      content: editor.document.getText(editor.selection),
      metadata: {
        path: editor.document.uri.fsPath,
        range: editor.selection,
        language: editor.document.languageId,
      },
    };
  }

  private async resolveProblems(): Promise<ResolvedMention | null> {
    const allDiagnostics = vscode.languages.getDiagnostics();
    if (allDiagnostics.length === 0) {
      return { type: 'problems', content: 'No problems found.' };
    }

    const lines: string[] = [];
    for (const [uri, diagnostics] of allDiagnostics) {
      if (diagnostics.length > 0) {
        lines.push(`\n${uri.fsPath}:`);
        for (const diag of diagnostics) {
          const severity = ['Error', 'Warning', 'Info', 'Hint'][diag.severity];
          lines.push(`  Line ${diag.range.start.line + 1}: [${severity}] ${diag.message}`);
        }
      }
    }

    return { type: 'problems', content: lines.join('\n') };
  }

  private async resolveGit(): Promise<ResolvedMention | null> {
    try {
      const gitExtension = vscode.extensions.getExtension('vscode.git');
      if (!gitExtension) return null;

      await gitExtension.activate();
      const git = gitExtension.exports.getAPI(1);
      const repo = git.repositories[0];
      if (!repo) return null;

      const state = repo.state;
      const content = [
        `Branch: ${state.HEAD?.name || 'detached'}`,
        `Modified: ${state.workingTreeChanges.length} files`,
        `Staged: ${state.indexChanges.length} files`,
        `Untracked: ${state.untrackedChanges?.length || 0} files`,
      ].join('\n');

      return { type: 'git', content };
    } catch {
      return null;
    }
  }

  private async resolveUrl(url: string): Promise<ResolvedMention | null> {
    try {
      const response = await fetch(url);
      const content = await response.text();
      return {
        type: 'url',
        content: content.slice(0, 10000),
        metadata: { path: url },
      };
    } catch {
      return null;
    }
  }
}
```

### Mode System

Uses different Amplifier profiles for different interaction modes.

#### Profile Setup

**For Initial Development**: Use existing `sam-collection` or `foundation` profiles to validate core functionality:
- `sam-collection:dev` (recommended if available)
- `foundation:dev` (standard development profile)
- `foundation:general` (general-purpose profile)

**For Future Iteration**: Create vscode-specific profiles. The scaffolding is in place at:
- `server/amplifier_vscode_server/data/collections/vscode/profiles/`

Example vscode-specific profiles (to be refined later):

```yaml
# vscode-code.yaml
name: vscode-code
description: "Code mode - full development capabilities"
extends: foundation:dev
tools:
  - module: tool-filesystem
  - module: tool-bash
  - module: tool-web
  - module: tool-search
  - module: tool-task
```

```yaml
# vscode-architect.yaml
name: vscode-architect
description: "Architect mode - read-only for planning"
extends: foundation:dev
tools:
  - module: tool-filesystem
    config:
      read_only: true
  - module: tool-search
hooks:
  - module: hooks-approval
    config:
      deny_operations: ["write_file", "execute_command"]
```

```yaml
# vscode-ask.yaml
name: vscode-ask
description: "Ask mode - conversation only"
extends: foundation:simple
# No tools - pure conversation
orchestrator:
  config:
    system_instruction: |
      You are in Ask mode. Answer questions clearly.
      You cannot execute tools or make changes.
```

#### Extension Implementation

```typescript
// extension/src/types/modes.ts
export type AmplifierMode = 'code' | 'architect' | 'ask';

// For initial validation, use proven profiles
export const MODE_TO_PROFILE: Record<AmplifierMode, string> = {
  code: 'foundation:dev',        // Full dev capabilities
  architect: 'foundation:general', // General-purpose (more conservative)
  ask: 'foundation:foundation',  // Minimal foundation
};

// Future: Switch to vscode-specific profiles after iteration
// export const MODE_TO_PROFILE: Record<AmplifierMode, string> = {
//   code: 'vscode:code',
//   architect: 'vscode:architect',
//   ask: 'vscode:ask',
// };

export const MODE_INFO: Record<AmplifierMode, {
  label: string;
  description: string;
  icon: string;
}> = {
  code: {
    label: 'Code',
    description: 'Full access - read, write, execute',
    icon: '$(code)',
  },
  architect: {
    label: 'Architect',
    description: 'Read-only - design and planning',
    icon: '$(layers)',
  },
  ask: {
    label: 'Ask',
    description: 'Conversation only - no tools',
    icon: '$(comment-discussion)',
  },
};
```

```typescript
// In ChatViewProvider
private currentMode: AmplifierMode = 'code';

private async _startSession(mode?: AmplifierMode): Promise<void> {
  const config = vscode.workspace.getConfiguration('amplifier');
  this.currentMode = mode || config.get('defaultMode', 'code');
  
  const profileName = MODE_TO_PROFILE[this.currentMode];
  const context = await this._contextGatherer.gather();
  const apiKey = await this._credentialsManager.getApiKey();
  
  const response = await this._client.createSession({
    profile: profileName,
    credentials: { anthropic_api_key: apiKey },
    context,
  });
  
  this._sessionId = response.session_id;
  await this._subscribeToEvents();
  this._postMessage({ 
    type: 'sessionStarted',
    sessionId: this._sessionId,
    mode: this.currentMode,
  });
}

private async _switchMode(newMode: AmplifierMode): Promise<void> {
  if (this._sessionId) {
    await this._stopSession();
  }
  await this._startSession(newMode);
}
```

### Steering Files (Project Context)

Provides persistent project context via `.amplifier/steering/*.md` files.

#### Server Implementation

```python
# server/amplifier_vscode_server/core/steering_loader.py
from pathlib import Path
import yaml
from fnmatch import fnmatch

class SteeringDocument:
    def __init__(self, name: str, content: str, metadata: dict):
        self.name = name
        self.content = content
        self.inclusion = metadata.get("inclusion", "always")
        self.pattern = metadata.get("pattern")

class SteeringLoader:
    def __init__(self, workspace_root: Path):
        self.steering_dir = workspace_root / ".amplifier" / "steering"
    
    def load_all(self) -> list[SteeringDocument]:
        """Load all steering markdown files."""
        if not self.steering_dir.exists():
            return []
        
        docs = []
        for md_file in self.steering_dir.glob("*.md"):
            try:
                content = md_file.read_text()
                metadata, body = self._parse_frontmatter(content)
                docs.append(SteeringDocument(name=md_file.stem, content=body, metadata=metadata))
            except Exception as e:
                print(f"Warning: Failed to load {md_file}: {e}")
        
        return docs
    
    def filter_for_context(
        self,
        docs: list[SteeringDocument],
        current_file: str | None = None,
        exclude: list[str] | None = None,
    ) -> str:
        """Filter steering based on inclusion mode."""
        included = []
        exclude = exclude or []
        
        for doc in docs:
            if doc.name in exclude:
                continue
            
            if doc.inclusion == "always":
                included.append(doc)
            elif doc.inclusion == "fileMatch" and current_file:
                if fnmatch(current_file, doc.pattern):
                    included.append(doc)
        
        if not included:
            return ""
        
        parts = ["## Project Context (from steering files)\n"]
        for doc in included:
            parts.append(f"\n### {doc.name}\n{doc.content}\n")
        
        return "\n".join(parts)
    
    def _parse_frontmatter(self, content: str) -> tuple[dict, str]:
        """Parse YAML frontmatter from markdown."""
        if not content.startswith("---\n"):
            return {}, content
        
        end_index = content.find("\n---\n", 4)
        if end_index == -1:
            return {}, content
        
        frontmatter_str = content[4:end_index]
        body = content[end_index + 5:].strip()
        
        try:
            metadata = yaml.safe_load(frontmatter_str) or {}
            return metadata, body
        except:
            return {}, content
```

**Integration in SessionRunner:**

```python
# In SessionRunner.start()
async def start(self) -> str:
    loader = ProfileLoader()
    profile = loader.load_profile(self.profile_name)
    mount_plan = compile_profile_to_mount_plan(profile)
    
    # Load steering files
    if self.workspace_context and self.workspace_context.get("workspace_root"):
        workspace_root = Path(self.workspace_context["workspace_root"])
        steering_loader = SteeringLoader(workspace_root)
        steering_docs = steering_loader.load_all()
        
        current_file = self.workspace_context.get("selection", {}).get("path")
        exclude = self.workspace_context.get("exclude_steering", [])
        
        steering_content = steering_loader.filter_for_context(
            steering_docs,
            current_file=current_file,
            exclude=exclude,
        )
        
        if steering_content:
            if "orchestrator" not in mount_plan:
                mount_plan["orchestrator"] = {}
            if "config" not in mount_plan["orchestrator"]:
                mount_plan["orchestrator"]["config"] = {}
            
            existing = mount_plan["orchestrator"]["config"].get("system_instruction", "")
            mount_plan["orchestrator"]["config"]["system_instruction"] = (
                f"{steering_content}\n\n{existing}"
            )
    
    # Continue with session creation...
```

#### User Workflow

```bash
# Create steering directory
mkdir -p .amplifier/steering

# Create tech stack file
cat > .amplifier/steering/tech.md << 'EOF'
---
inclusion: always
---
# Technology Stack

- React 18 with TypeScript
- Tailwind CSS for styling
- Vitest for testing
EOF

# Create conditional testing guidelines
cat > .amplifier/steering/testing.md << 'EOF'
---
inclusion: fileMatch
pattern: "**/*.test.*"
---
# Testing Guidelines

- Use Vitest for all tests
- Prefer integration tests over unit tests
- Mock external APIs
EOF
```

### Terminal Integration

Uses integrated terminal for bash tool execution with output capture.

```typescript
// extension/src/services/TerminalManager.ts
import * as vscode from 'vscode';

export class TerminalManager {
  private amplifierTerminal: vscode.Terminal | undefined;

  async executeCommand(
    command: string,
    cwd: string
  ): Promise<{ exitCode: number | undefined; output: string }> {
    if (!this.amplifierTerminal || this.amplifierTerminal.exitStatus) {
      this.amplifierTerminal = vscode.window.createTerminal({
        name: 'Amplifier',
        cwd,
        iconPath: new vscode.ThemeIcon('hubot'),
      });
    }

    this.amplifierTerminal.show(false);

    // Use shell integration if available (VS Code 1.93+)
    if (this.amplifierTerminal.shellIntegration) {
      const execution = this.amplifierTerminal.shellIntegration.executeCommand(command);
      
      const output: string[] = [];
      const stream = execution.read();
      for await (const data of stream) {
        output.push(data);
      }
      
      const endEvent = await new Promise<vscode.TerminalShellExecutionEndEvent>(
        resolve => {
          const disposable = vscode.window.onDidEndTerminalShellExecution(event => {
            if (event.execution === execution) {
              disposable.dispose();
              resolve(event);
            }
          });
        }
      );
      
      return { exitCode: endEvent.exitCode, output: output.join('') };
    } else {
      // Fallback: send text without capture
      this.amplifierTerminal.sendText(command, true);
      return { exitCode: undefined, output: '[Output not captured]' };
    }
  }

  dispose(): void {
    this.amplifierTerminal?.dispose();
  }
}
```

---

## Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [VS Code Extension Samples](https://github.com/microsoft/vscode-extension-samples)
- [VS Code Built-in Commands](https://code.visualstudio.com/api/references/commands)
- [VS Code Virtual Documents Guide](https://code.visualstudio.com/api/extension-guides/virtual-documents)
- [Amplifier Core Documentation](https://github.com/microsoft/amplifier-core)
- [Amplifier Profiles Documentation](https://github.com/microsoft/amplifier-profiles)
