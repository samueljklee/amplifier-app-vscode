# Amplifier VS Code Extension Architecture

> **Status**: Design Document
> **Last Updated**: 2025-12-09

## Overview

The Amplifier VS Code extension provides native AI assistance within Visual Studio Code, leveraging the full Amplifier modular architecture. This document defines the complete architecture based on validated VS Code APIs and Amplifier kernel contracts.

## System Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                      VS Code Extension (TypeScript)                         │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      Extension Host Process                           │  │
│  │                                                                       │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │  │
│  │  │ ChatView    │  │ CodeAction  │  │ Completion  │  │ Diagnostics │ │  │
│  │  │ Provider    │  │ Provider    │  │ Provider    │  │ Provider    │ │  │
│  │  │ (Webview)   │  │             │  │             │  │             │ │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘ │  │
│  │         │                │                │                │        │  │
│  │         └────────────────┼────────────────┼────────────────┘        │  │
│  │                          ▼                ▼                          │  │
│  │                 ┌────────────────────────────────┐                   │  │
│  │                 │      AmplifierClient           │                   │  │
│  │                 │  ┌──────────────────────────┐  │                   │  │
│  │                 │  │ EventStreamManager       │  │◀── SSE Events    │  │
│  │                 │  │ SessionManager           │  │                   │  │
│  │                 │  │ ApprovalHandler          │  │                   │  │
│  │                 │  └──────────────────────────┘  │                   │  │
│  │                 └────────────────┬───────────────┘                   │  │
│  │                                  │                                   │  │
│  │  ┌──────────────────────────────┐│┌──────────────────────────────┐  │  │
│  │  │ StatusBar                    │││ OutputChannel                │  │  │
│  │  │ - Connection status          │││ - Event logs                 │  │  │
│  │  │ - Token usage                │││ - Debug output               │  │  │
│  │  └──────────────────────────────┘│└──────────────────────────────┘  │  │
│  └──────────────────────────────────┼───────────────────────────────────┘  │
│                                     │ HTTP + SSE                           │
└─────────────────────────────────────┼──────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Python Backend Server (FastAPI)                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         REST API Layer                                 │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐   │  │
│  │  │ POST /sessions  │  │ POST /sessions/ │  │ GET /sessions/{id}/ │   │  │
│  │  │ Create session  │  │ {id}/prompt     │  │ events (SSE)        │   │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────┘   │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐   │  │
│  │  │ GET /profiles   │  │ POST /sessions/ │  │ DELETE /sessions/   │   │  │
│  │  │ List profiles   │  │ {id}/approval   │  │ {id}                │   │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                     │                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        Session Management                              │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │ SessionRunner (adapted from amplifier-playground)                │  │  │
│  │  │  • Wraps AmplifierSession                                        │  │  │
│  │  │  • Event callback → SSE queue                                    │  │  │
│  │  │  • VSCodeApprovalSystem integration                              │  │  │
│  │  │  • VSCodeDisplaySystem integration                               │  │  │
│  │  │  • Profile context loading with @mention expansion               │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │ SessionManager                                                   │  │  │
│  │  │  • Multiple concurrent sessions                                  │  │  │
│  │  │  • Session lifecycle (create, prompt, stop)                      │  │  │
│  │  │  • Event queue management per session                            │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                     │                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      amplifier-core (kernel)                           │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │  │
│  │  │Providers │  │ Tools    │  │ Hooks    │  │Orchestr. │  │ Context │ │  │
│  │  │anthropic │  │filesystem│  │logging   │  │loop-     │  │simple   │ │  │
│  │  │openai    │  │bash      │  │approval  │  │streaming │  │persist. │ │  │
│  │  │azure     │  │web       │  │streaming │  │basic     │  │         │ │  │
│  │  │ollama    │  │search    │  │ui        │  │events    │  │         │ │  │
│  │  │          │  │task      │  │redaction │  │          │  │         │ │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## VS Code API Integration

### Validated VS Code APIs

Based on official VS Code documentation and API references:

#### 1. WebviewViewProvider (Chat Panel)

**API**: `vscode.window.registerWebviewViewProvider`

```typescript
// Registration
vscode.window.registerWebviewViewProvider(
  'amplifier.chatView',
  chatViewProvider,
  { webviewOptions: { retainContextWhenHidden: true } }
);

// Provider implementation
class ChatViewProvider implements vscode.WebviewViewProvider {
  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ): void | Thenable<void>;
}
```

**Communication**:
- Extension → Webview: `webviewView.webview.postMessage(message)`
- Webview → Extension: `webviewView.webview.onDidReceiveMessage(callback)`

**Sources**:
- [Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [Sidebars UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/sidebars)

#### 2. CodeActionProvider (Lightbulb Actions)

**API**: `vscode.languages.registerCodeActionsProvider`

```typescript
// Registration
vscode.languages.registerCodeActionsProvider(
  { scheme: 'file' },
  codeActionProvider,
  { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
);

// Provider implementation
class CodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.CodeAction[] | Thenable<vscode.CodeAction[]>;
}
```

**Sources**:
- [VS Code API Reference](https://code.visualstudio.com/api/references/vscode-api)
- [Code Actions Sample](https://github.com/microsoft/vscode-extension-samples/tree/main/code-actions-sample)

#### 3. CompletionItemProvider (IntelliSense)

**API**: `vscode.languages.registerCompletionItemProvider`

```typescript
// Registration with trigger characters
vscode.languages.registerCompletionItemProvider(
  { scheme: 'file' },
  completionProvider,
  '.', '(', ' '  // Trigger characters
);

// Provider implementation
class CompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.CompletionItem[] | Thenable<vscode.CompletionItem[]>;

  resolveCompletionItem?(
    item: vscode.CompletionItem,
    token: vscode.CancellationToken
  ): vscode.CompletionItem | Thenable<vscode.CompletionItem>;
}
```

**Sources**:
- [Programmatic Language Features](https://code.visualstudio.com/api/language-extensions/programmatic-language-features)
- [Completions Sample](https://github.com/microsoft/vscode-extension-samples/tree/main/completions-sample)

#### 4. DiagnosticCollection (Problems Panel)

**API**: `vscode.languages.createDiagnosticCollection`

```typescript
// Creation
const diagnosticCollection = vscode.languages.createDiagnosticCollection('amplifier');

// Setting diagnostics
diagnosticCollection.set(document.uri, [
  new vscode.Diagnostic(
    range,
    '[Amplifier] Potential issue detected',
    vscode.DiagnosticSeverity.Warning
  )
]);

// Severity levels
enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3
}
```

**Sources**:
- [VS Code API Reference](https://code.visualstudio.com/api/references/vscode-api)
- [Diagnostics Sample](https://github.com/microsoft/vscode-extension-samples/blob/main/code-actions-sample/src/diagnostics.ts)

#### 5. StatusBarItem

**API**: `vscode.window.createStatusBarItem`

```typescript
// Creation with ID (VS Code 1.57+)
const statusBarItem = vscode.window.createStatusBarItem(
  'amplifier.status',
  vscode.StatusBarAlignment.Right,
  100
);

// Properties
statusBarItem.text = '$(hubot) Amplifier';
statusBarItem.tooltip = 'Amplifier AI Assistant';
statusBarItem.command = 'amplifier.showChat';
statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
statusBarItem.show();
```

**Sources**:
- [Status Bar UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/status-bar)
- [StatusBar Sample](https://github.com/microsoft/vscode-extension-samples/blob/main/statusbar-sample/src/extension.ts)

## Amplifier API Integration

### Validated Amplifier Core APIs

Based on `amplifier-core` source code analysis:

#### 1. AmplifierSession

**Location**: `amplifier_core/session.py`

```python
class AmplifierSession:
    def __init__(
        self,
        config: dict[str, Any],           # Mount plan (required)
        loader: ModuleLoader | None,       # Custom loader
        session_id: str | None,            # UUID if not provided
        parent_id: str | None,             # For child sessions
        approval_system: ApprovalSystem | None,
        display_system: DisplaySystem | None,
    ): ...

    async def initialize(self) -> None:
        """Load and mount all configured modules."""

    async def execute(self, prompt: str) -> str:
        """Execute prompt using mounted orchestrator."""

    async def cleanup(self) -> None:
        """Clean up session resources."""

    # Async context manager support
    async def __aenter__(self) -> "AmplifierSession": ...
    async def __aexit__(self, exc_type, exc_val, exc_tb): ...
```

#### 2. Mount Plan Structure

**Contract**: Configuration dictionary for `AmplifierSession`

```python
mount_plan = {
    "session": {
        "orchestrator": "loop-streaming",      # Required
        "context": "context-simple",           # Required
        "orchestrator_source": "git+https://...",  # Optional
        "context_source": "git+https://...",   # Optional
    },
    "orchestrator": {
        "config": {
            "extended_thinking": True,
            "stream_delay": 0.0,
        }
    },
    "context": {
        "config": {
            "max_tokens": 200000,
            "compact_threshold": 0.92,
        }
    },
    "providers": [
        {
            "module": "provider-anthropic",
            "source": "git+https://github.com/microsoft/amplifier-module-provider-anthropic@main",
            "config": {
                "default_model": "claude-sonnet-4-5",
                "api_key": "${ANTHROPIC_API_KEY}",
            }
        }
    ],
    "tools": [
        {
            "module": "tool-filesystem",
            "source": "git+https://...",
            "config": {"allowed_paths": ["."]}
        },
        {"module": "tool-bash", "config": {"timeout": 30}},
    ],
    "hooks": [
        {"module": "hooks-logging", "config": {"mode": "session-only"}},
        {"module": "hooks-streaming-ui", "config": {"show_thinking_stream": True}},
        {"module": "hooks-approval"},
    ],
    "agents": {
        "zen-architect": {...},
        "bug-hunter": {...},
    }
}
```

#### 3. HookRegistry Events

**Location**: `amplifier_core/events.py`

```python
# Session lifecycle
SESSION_START = "session:start"
SESSION_END = "session:end"
SESSION_FORK = "session:fork"
SESSION_RESUME = "session:resume"

# Prompt lifecycle
PROMPT_SUBMIT = "prompt:submit"
PROMPT_COMPLETE = "prompt:complete"

# Provider calls
PROVIDER_REQUEST = "provider:request"
PROVIDER_RESPONSE = "provider:response"
PROVIDER_ERROR = "provider:error"
LLM_REQUEST = "llm:request"
LLM_RESPONSE = "llm:response"

# Content streaming
CONTENT_BLOCK_START = "content_block:start"
CONTENT_BLOCK_DELTA = "content_block:delta"
CONTENT_BLOCK_END = "content_block:end"
THINKING_DELTA = "thinking:delta"
THINKING_FINAL = "thinking:final"

# Tool execution
TOOL_PRE = "tool:pre"
TOOL_POST = "tool:post"
TOOL_ERROR = "tool:error"

# Context management
CONTEXT_PRE_COMPACT = "context:pre_compact"
CONTEXT_POST_COMPACT = "context:post_compact"

# Approvals
APPROVAL_REQUIRED = "approval:required"
APPROVAL_GRANTED = "approval:granted"
APPROVAL_DENIED = "approval:denied"

# Other
ORCHESTRATOR_COMPLETE = "orchestrator:complete"
USER_NOTIFICATION = "user:notification"
ARTIFACT_WRITE = "artifact:write"
ARTIFACT_READ = "artifact:read"
POLICY_VIOLATION = "policy:violation"
```

#### 4. HookResult API

**Location**: `amplifier_core/models.py`

```python
class HookResult(BaseModel):
    # Core action
    action: Literal["continue", "deny", "modify", "inject_context", "ask_user"]

    # Data modification
    data: dict[str, Any] | None = None
    reason: str | None = None

    # Context injection
    context_injection: str | None = None
    context_injection_role: Literal["system", "user", "assistant"] = "system"
    ephemeral: bool = False
    append_to_last_tool_result: bool = False

    # Approval gates
    approval_prompt: str | None = None
    approval_options: list[str] | None = None
    approval_timeout: float = 300.0
    approval_default: Literal["allow", "deny"] = "deny"

    # Output control
    suppress_output: bool = False
    user_message: str | None = None
    user_message_level: Literal["info", "warning", "error"] = "info"
```

#### 5. Protocol Interfaces

**Location**: `amplifier_core/interfaces.py`

```python
@runtime_checkable
class Provider(Protocol):
    @property
    def name(self) -> str: ...
    def get_info(self) -> ProviderInfo: ...
    async def list_models(self) -> list[ModelInfo]: ...
    async def complete(self, request: ChatRequest, **kwargs) -> ChatResponse: ...
    def parse_tool_calls(self, response: ChatResponse) -> list[ToolCall]: ...

@runtime_checkable
class Tool(Protocol):
    @property
    def name(self) -> str: ...
    @property
    def description(self) -> str: ...
    async def execute(self, input: dict[str, Any]) -> ToolResult: ...

@runtime_checkable
class ContextManager(Protocol):
    async def add_message(self, message: dict[str, Any]) -> None: ...
    async def get_messages(self) -> list[dict[str, Any]]: ...
    async def should_compact(self) -> bool: ...
    async def compact(self) -> None: ...
    async def clear(self) -> None: ...

@runtime_checkable
class HookHandler(Protocol):
    async def __call__(self, event: str, data: dict[str, Any]) -> HookResult: ...

@runtime_checkable
class ApprovalProvider(Protocol):
    async def request_approval(self, request: ApprovalRequest) -> ApprovalResponse: ...
```

#### 6. Profile Loading

**Location**: `amplifier_profiles`

```python
from amplifier_profiles import (
    ProfileLoader,
    AgentLoader,
    AgentResolver,
    compile_profile_to_mount_plan,
)

# Build loaders with search paths
loader = ProfileLoader(
    search_paths=[Path(".amplifier/profiles"), Path.home() / ".amplifier/profiles"],
    collection_resolver=collection_resolver,
)

agent_loader = AgentLoader(
    resolver=AgentResolver(search_paths=agent_search_paths),
    mention_loader=mention_loader,
)

# Load and compile
profile = loader.load_profile("foundation:dev")
mount_plan = compile_profile_to_mount_plan(profile, agent_loader=agent_loader)
```

## Event Streaming Architecture

### SSE (Server-Sent Events) Protocol

The extension uses SSE for real-time event streaming from the Python backend:

```
Client                                      Server
   │                                           │
   │  GET /sessions/{id}/events               │
   │  Accept: text/event-stream               │
   │─────────────────────────────────────────>│
   │                                           │
   │  HTTP/1.1 200 OK                         │
   │  Content-Type: text/event-stream         │
   │  Cache-Control: no-cache                 │
   │  Connection: keep-alive                  │
   │<─────────────────────────────────────────│
   │                                           │
   │  data: {"event": "session:start", ...}   │
   │<─────────────────────────────────────────│
   │                                           │
   │  data: {"event": "content_block:start"}  │
   │<─────────────────────────────────────────│
   │                                           │
   │  data: {"event": "tool:pre", ...}        │
   │<─────────────────────────────────────────│
   │                                           │
   │  : keepalive (every 5 seconds)           │
   │<─────────────────────────────────────────│
   │                                           │
```

### Event Format

```typescript
interface AmplifierEvent {
  event: string;          // Event name from canonical list
  data: {
    session_id: string;   // Session identifier
    parent_id?: string;   // Parent session (for child sessions)
    timestamp?: string;   // ISO timestamp
    [key: string]: any;   // Event-specific data
  };
}
```

### TypeScript Event Handler

```typescript
class EventStreamManager {
  private eventSource: EventSource | null = null;
  private sessionId: string | null = null;
  private handlers: EventHandlers | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private baseReconnectDelay = 1000; // 1 second

  subscribe(sessionId: string, handlers: EventHandlers): void {
    this.sessionId = sessionId;
    this.handlers = handlers;
    this.reconnectAttempts = 0;
    this.connect();
  }

  private connect(): void {
    if (!this.sessionId || !this.handlers) return;

    const url = `${this.baseUrl}/sessions/${this.sessionId}/events`;
    this.eventSource = new EventSource(url);

    this.eventSource.onopen = () => {
      // Reset reconnect counter on successful connection
      this.reconnectAttempts = 0;
      this.handlers?.onConnected?.();
    };

    this.eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.dispatch(data.event, data.data, this.handlers!);
    };

    this.eventSource.onerror = (error) => {
      this.eventSource?.close();
      this.eventSource = null;

      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s
        const delay = this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts);
        this.reconnectAttempts++;
        this.handlers?.onReconnecting?.(this.reconnectAttempts, delay);
        setTimeout(() => this.connect(), delay);
      } else {
        // Max retries exceeded
        this.handlers?.onError?.(new Error('SSE connection failed after max retries'));
      }
    };
  }

  private dispatch(event: string, data: any, handlers: EventHandlers): void {
    switch (event) {
      case 'content_block:start':
        handlers.onThinkingStart?.(data);
        break;
      case 'content_block:end':
        handlers.onThinkingEnd?.(data);
        break;
      case 'tool:pre':
        handlers.onToolStart?.(data);
        break;
      case 'tool:post':
        handlers.onToolEnd?.(data);
        break;
      case 'approval:required':
        handlers.onApprovalRequired?.(data);
        break;
      // ... more handlers
    }
  }

  unsubscribe(): void {
    this.eventSource?.close();
    this.eventSource = null;
    this.sessionId = null;
    this.handlers = null;
    this.reconnectAttempts = 0;
  }
}
```

## Approval Flow

### Sequence Diagram

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│Extension│     │ Server  │     │ Session │     │  Hook   │
└────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
     │               │               │               │
     │               │               │  tool:pre     │
     │               │               │<──────────────│
     │               │               │               │
     │               │               │  HookResult   │
     │               │               │  ask_user     │
     │               │               │<──────────────│
     │               │               │               │
     │  SSE: approval:required       │               │
     │<──────────────────────────────│               │
     │               │               │               │
     │  Show QuickPick              │               │
     │───────┐       │               │               │
     │       │       │               │               │
     │<──────┘       │               │               │
     │               │               │               │
     │  POST /sessions/{id}/approval │               │
     │──────────────>│               │               │
     │               │               │               │
     │               │  resolve_approval             │
     │               │──────────────>│               │
     │               │               │               │
     │               │               │  Continue     │
     │               │               │──────────────>│
     │               │               │               │
```

### VS Code QuickPick Integration

```typescript
async function handleApprovalRequest(data: ApprovalRequiredEvent): Promise<void> {
  const options = data.approval_options || ['Allow', 'Deny'];

  const choice = await vscode.window.showQuickPick(options, {
    placeHolder: data.approval_prompt,
    title: 'Amplifier: Approval Required',
    ignoreFocusOut: true,
  });

  if (choice) {
    await client.resolveApproval(data.session_id, choice);
  } else {
    // Timeout or cancelled - use default
    await client.resolveApproval(data.session_id, data.approval_default === 'allow' ? 'Allow' : 'Deny');
  }
}
```

## Configuration

### VS Code Settings Schema

```json
{
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
  "amplifier.server.host": {
    "type": "string",
    "default": "127.0.0.1",
    "description": "Host for the Amplifier server"
  },
  "amplifier.profile": {
    "type": "string",
    "default": "dev",
    "description": "Default Amplifier profile to use"
  },
  "amplifier.features.inlineChat": {
    "type": "boolean",
    "default": true,
    "description": "Enable inline chat panel"
  },
  "amplifier.features.codeActions": {
    "type": "boolean",
    "default": true,
    "description": "Enable code action suggestions"
  },
  "amplifier.features.completions": {
    "type": "boolean",
    "default": false,
    "description": "Enable AI-powered completions (experimental)"
  },
  "amplifier.features.diagnostics": {
    "type": "boolean",
    "default": true,
    "description": "Enable AI-detected problems"
  },
  "amplifier.context.includeOpenFiles": {
    "type": "boolean",
    "default": true,
    "description": "Include open files in context"
  },
  "amplifier.context.includeGitState": {
    "type": "boolean",
    "default": true,
    "description": "Include git status in context"
  },
  "amplifier.context.includeDiagnostics": {
    "type": "boolean",
    "default": true,
    "description": "Include VS Code diagnostics in context"
  }
}
```

## File Structure

```
amplifier-app-vscode/
├── extension/                      # TypeScript VS Code extension
│   ├── src/
│   │   ├── extension.ts           # Entry point, activation
│   │   ├── client/
│   │   │   ├── AmplifierClient.ts # HTTP client for backend
│   │   │   ├── EventStream.ts     # SSE event handling
│   │   │   └── types.ts           # TypeScript interfaces
│   │   ├── providers/
│   │   │   ├── ChatViewProvider.ts     # Webview chat panel
│   │   │   ├── CodeActionProvider.ts   # Lightbulb actions
│   │   │   ├── CompletionProvider.ts   # AI completions
│   │   │   └── DiagnosticsProvider.ts  # Problems integration
│   │   ├── services/
│   │   │   ├── ContextGatherer.ts      # IDE state collection
│   │   │   ├── ApprovalHandler.ts      # User approval UI
│   │   │   └── ServerManager.ts        # Backend lifecycle
│   │   └── views/
│   │       └── chat/
│   │           ├── index.html
│   │           ├── styles.css
│   │           └── main.ts
│   ├── package.json               # Extension manifest
│   ├── tsconfig.json
│   └── webpack.config.js
│
├── server/                        # Python backend (adapted from playground)
│   ├── amplifier_vscode_server/
│   │   ├── __init__.py
│   │   ├── app.py                # FastAPI application
│   │   ├── routes/
│   │   │   ├── sessions.py       # Session management + SSE
│   │   │   └── profiles.py       # Profile listing
│   │   ├── core/
│   │   │   ├── session_runner.py # Wraps AmplifierSession
│   │   │   ├── session_manager.py
│   │   │   ├── ux_systems.py     # VSCode approval/display
│   │   │   ├── collection_manager.py
│   │   │   └── mention_loader.py
│   │   └── models.py             # Pydantic models
│   └── pyproject.toml
│
├── docs/
│   ├── ARCHITECTURE.md           # This document
│   ├── API_REFERENCE.md          # REST API documentation
│   ├── DEVELOPMENT.md            # Development setup
│   └── USER_GUIDE.md             # End-user documentation
│
└── README.md
```

## API Key Management

The extension requires an API key for the LLM provider (Anthropic for v1). Keys are managed securely using VS Code's SecretStorage API.

### Storage Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         VS Code Extension                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    SecretStorage                             │   │
│  │  • amplifier.anthropicApiKey (encrypted)                    │   │
│  │  • Future: amplifier.openaiApiKey, etc.                     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              Session Creation Request                        │   │
│  │  POST /sessions { credentials: { anthropic_api_key: "..." }} │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Python Backend                              │
│  • Receives API key per-session (not stored on server)             │
│  • Passes to amplifier-core provider configuration                 │
│  • Key exists only in memory during session lifetime               │
└─────────────────────────────────────────────────────────────────────┘
```

### API Key Flow

```typescript
// 1. User sets API key via command
vscode.commands.registerCommand('amplifier.setApiKey', async () => {
  const key = await vscode.window.showInputBox({
    prompt: 'Enter your Anthropic API Key',
    password: true,
    placeHolder: 'sk-ant-...',
    validateInput: (value) => {
      if (!value?.startsWith('sk-ant-')) {
        return 'API key should start with sk-ant-';
      }
      return null;
    }
  });
  
  if (key) {
    await context.secrets.store('amplifier.anthropicApiKey', key);
    vscode.window.showInformationMessage('API key saved securely');
  }
});

// 2. Key retrieved when creating session
const apiKey = await context.secrets.get('amplifier.anthropicApiKey');
if (!apiKey) {
  // Prompt user to set key
  vscode.commands.executeCommand('amplifier.setApiKey');
  return;
}

// 3. Key passed to server in session creation
const session = await client.createSession({
  profile: 'dev',
  context: workspaceContext,
  credentials: {
    anthropic_api_key: apiKey
  }
});
```

### Validation Flow

```
User enters API key
        ↓
Extension validates format (sk-ant-*)
        ↓
Store in SecretStorage
        ↓
On first use: Server validates with test API call
        ↓
    [Invalid?] ───Yes──→ Return error, prompt to re-enter
        │
        No
        ↓
    Continue with session
```

---

## User Experience Flows

### First-Run Experience

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Extension Activation                            │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Check Prerequisites │
                    └─────────────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
    ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
    │ Python 3.11+? │  │ uv installed? │  │ API key set?  │
    └───────────────┘  └───────────────┘  └───────────────┘
            │                  │                  │
         [No]               [No]               [No]
            ▼                  ▼                  ▼
    ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
    │ Show error    │  │ Show error    │  │ Show setup    │
    │ with install  │  │ with install  │  │ prompt in     │
    │ instructions  │  │ instructions  │  │ chat panel    │
    └───────────────┘  └───────────────┘  └───────────────┘
            │                  │                  │
            └──────────────────┴──────────────────┘
                               │
                          [All OK]
                               ▼
                    ┌─────────────────────┐
                    │   Start Server      │
                    │   Show Ready State  │
                    └─────────────────────┘
```

### Welcome Screen (Chat Panel)

When API key is not set:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│     ╭─────────────────────────────────────────────────────╮    │
│     │                                                     │    │
│     │   Welcome to Amplifier! 👋                          │    │
│     │                                                     │    │
│     │   To get started, you'll need an Anthropic API     │    │
│     │   key. Get one at console.anthropic.com            │    │
│     │                                                     │    │
│     │   ┌─────────────────────────────────────────────┐  │    │
│     │   │         Set API Key                         │  │    │
│     │   └─────────────────────────────────────────────┘  │    │
│     │                                                     │    │
│     │   Already have a key configured via environment?   │    │
│     │   The extension will use ANTHROPIC_API_KEY if set. │    │
│     │                                                     │    │
│     ╰─────────────────────────────────────────────────────╯    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

When ready:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   [User messages and assistant responses here]                  │
│                                                                 │
│   ─────────────────────────────────────────────────────────────│
│                                                                 │
│   │ Ask Amplifier...                                        │  │
│   └─────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Server Startup Feedback

```
Status Bar States:
──────────────────────────────────────────────────────────────────

[Starting]     $(loading~spin) Amplifier: Starting...

[Ready]        $(check) Amplifier: Ready

[Error]        $(error) Amplifier: Error (click for details)

[No API Key]   $(key) Amplifier: Set API Key
```

### Error Handling UX

| Error Type | User Message | Action |
|------------|--------------|--------|
| Missing Python | "Python 3.11+ is required. [Install Python](https://python.org)" | Link to python.org |
| Missing uv | "uv package manager required. [Install uv](https://astral.sh/uv)" | Link to install script |
| Invalid API key | "Invalid API key. Please check and try again." | Button: "Update API Key" |
| API rate limited | "Rate limit reached. Retry in X seconds." | Auto-retry countdown |
| Network error | "Cannot reach API. Check your connection." | Button: "Retry" |
| Server crash | "Server stopped unexpectedly. Restarting..." | Auto-restart |

### Token Usage Display

After each response:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   [Assistant response content...]                               │
│                                                                 │
│   ─────────────────────────────────────────────────────────────│
│   📊 1,234 input tokens · 567 output tokens                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Configuration

### VS Code Settings Schema

```json
{
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
  "amplifier.server.host": {
    "type": "string",
    "default": "127.0.0.1",
    "description": "Host for the Amplifier server"
  },
  "amplifier.profile": {
    "type": "string",
    "default": "dev",
    "description": "Default Amplifier profile to use"
  },
  "amplifier.model": {
    "type": "string",
    "default": "claude-sonnet-4-5",
    "enum": ["claude-sonnet-4-5", "claude-3-5-haiku-latest"],
    "enumDescriptions": [
      "Claude Sonnet 4.5 - Best balance of capability and speed",
      "Claude 3.5 Haiku - Faster and more cost-effective"
    ],
    "description": "AI model to use for chat and code actions"
  },
  "amplifier.showTokenUsage": {
    "type": "boolean",
    "default": true,
    "description": "Show token usage after each response"
  },
  "amplifier.features.inlineChat": {
    "type": "boolean",
    "default": true,
    "description": "Enable inline chat panel"
  },
  "amplifier.features.codeActions": {
    "type": "boolean",
    "default": true,
    "description": "Enable code action suggestions"
  },
  "amplifier.features.completions": {
    "type": "boolean",
    "default": false,
    "description": "Enable AI-powered completions (experimental)"
  },
  "amplifier.features.diagnostics": {
    "type": "boolean",
    "default": true,
    "description": "Enable AI-detected problems"
  },
  "amplifier.context.includeOpenFiles": {
    "type": "boolean",
    "default": true,
    "description": "Include open files in context"
  },
  "amplifier.context.includeGitState": {
    "type": "boolean",
    "default": true,
    "description": "Include git status in context"
  },
  "amplifier.context.includeDiagnostics": {
    "type": "boolean",
    "default": true,
    "description": "Include VS Code diagnostics in context"
  }
}
```

---

## Security Considerations

1. **Local-only server**: Backend runs on `127.0.0.1` by default
2. **Secure credential storage**: API keys stored in VS Code SecretStorage (encrypted, OS keychain)
3. **No server-side key storage**: Keys passed per-session, never persisted on server
4. **Approval gates**: All potentially destructive operations require user approval
5. **Content Security Policy**: Webviews use strict CSP
6. **Path restrictions**: File access limited to workspace

---

## Advanced Features

### Inline Diff Preview

When Amplifier proposes file changes, users see a diff view before applying changes.

#### VS Code API

**Built-in Command**: `vscode.diff`

```typescript
commands.executeCommand('vscode.diff',
  leftUri: Uri,      // Original file
  rightUri: Uri,     // Proposed content (virtual document)
  title: string,     // "file.ts ↔ Proposed Changes"
  options?: TextDocumentShowOptions
): Thenable<void>
```

**Virtual Document Provider**: `vscode.workspace.registerTextDocumentContentProvider`

```typescript
class DiffPreviewProvider implements vscode.TextDocumentContentProvider {
  private static readonly SCHEME = 'amplifier-proposed';
  private proposedContents = new Map<string, string>();

  provideTextDocumentContent(uri: vscode.Uri): string | undefined {
    return this.proposedContents.get(uri.toString());
  }
}
```

#### Implementation Flow

```
AI proposes file change (tool:post with write_file)
        ↓
Extension creates virtual URI for proposed content
        ↓
Execute vscode.diff command to show diff editor
        ↓
User sees side-by-side diff (original ↔ proposed)
        ↓
User chooses: [Accept] [Reject] [Edit First]
        ↓
    [Accept] → Apply change, send approval to continue
    [Reject] → Skip change, notify AI to try different approach  
    [Edit]   → Open in editor for manual modification
```

#### Complete Implementation

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
    // Register the virtual document provider
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
    
    // Create virtual URI with unique query to avoid caching
    const timestamp = Date.now();
    const proposedUri = vscode.Uri.parse(
      `${DiffPreviewProvider.SCHEME}:${filePath}?t=${timestamp}`
    );
    
    // Store proposed content
    this.proposedContents.set(proposedUri.toString(), proposedContent);
    
    try {
      // Open diff editor
      await vscode.commands.executeCommand(
        'vscode.diff',
        fileUri,
        proposedUri,
        `${path.basename(filePath)} ↔ Proposed Changes`,
        { preview: false, viewColumn: vscode.ViewColumn.Beside }
      );
      
      // Show approval dialog
      const choice = await vscode.window.showInformationMessage(
        `Apply proposed changes to ${path.basename(filePath)}?`,
        { modal: false },
        'Accept',
        'Reject',
        'Edit First'
      );
      
      return choice === 'Accept' ? 'accept' :
             choice === 'Edit First' ? 'edit' : 'reject';
    } finally {
      // Cleanup
      this.proposedContents.delete(proposedUri.toString());
    }
  }
}
```

**Integration with Event Stream:**

```typescript
// In ChatViewProvider event handlers
onToolEnd: async (data) => {
  // Intercept file write operations
  if (data.tool_name === 'filesystem' && 
      data.operation === 'write_file' && 
      data.result?.proposed_content) {
    
    const decision = await this.diffPreviewProvider.showDiff(
      data.input.path,
      data.result.proposed_content
    );
    
    if (decision === 'accept') {
      // Continue with write
      await this._client.submitApproval(this._sessionId!, 'Accept');
    } else if (decision === 'edit') {
      // Open file for manual editing
      const doc = await vscode.workspace.openTextDocument(data.input.path);
      await vscode.window.showTextDocument(doc);
      await this._client.submitApproval(this._sessionId!, 'Edit');
    } else {
      // Reject the change
      await this._client.submitApproval(this._sessionId!, 'Reject');
    }
  }
}
```

---

### Context Mentions

Users can explicitly include context using `@` mentions in chat.

#### Supported Mentions

| Mention | Description | VS Code API |
|---------|-------------|-------------|
| `@file:path` | Include specific file | `workspace.openTextDocument(Uri)` |
| `@folder:path` | Include folder listing | `workspace.fs.readDirectory(Uri)` |
| `@selection` | Current editor selection | `window.activeTextEditor.selection` |
| `@problems` | VS Code diagnostics | `languages.getDiagnostics()` |
| `@git` | Git diff/status | Git extension API |
| `@url:` | Fetch URL content | `fetch()` |

#### Implementation

```typescript
// extension/src/services/MentionResolver.ts
export interface ResolvedMention {
  type: 'file' | 'folder' | 'selection' | 'problems' | 'git' | 'url';
  content: string;
  metadata?: {
    path?: string;
    range?: vscode.Range;
    language?: string;
  };
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

    // Parse each mention type
    for (const [type, pattern] of Object.entries(this.patterns)) {
      const matches = [...input.matchAll(pattern)];
      for (const match of matches) {
        const resolved = await this.resolveMention(type, match[1]);
        if (resolved) {
          mentions.push(resolved);
          cleanText = cleanText.replace(match[0], '');
        }
      }
    }

    return { text: cleanText.trim(), mentions };
  }

  private async resolveMention(
    type: string,
    value?: string
  ): Promise<ResolvedMention | null> {
    switch (type) {
      case 'file':
        return this.resolveFile(value!);
      case 'folder':
        return this.resolveFolder(value!);
      case 'selection':
        return this.resolveSelection();
      case 'problems':
        return this.resolveProblems();
      case 'git':
        return this.resolveGit();
      case 'url':
        return this.resolveUrl(value!);
      default:
        return null;
    }
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
        metadata: {
          path: absolutePath,
          language: doc.languageId,
        },
      };
    } catch (error) {
      console.error(`Failed to resolve @file:${filePath}`, error);
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

      return {
        type: 'folder',
        content: fileList,
        metadata: { path: absolutePath },
      };
    } catch (error) {
      console.error(`Failed to resolve @folder:${folderPath}`, error);
      return null;
    }
  }

  private async resolveSelection(): Promise<ResolvedMention | null> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      return null;
    }

    const selection = editor.selection;
    const text = editor.document.getText(selection);

    return {
      type: 'selection',
      content: text,
      metadata: {
        path: editor.document.uri.fsPath,
        range: selection,
        language: editor.document.languageId,
      },
    };
  }

  private async resolveProblems(): Promise<ResolvedMention | null> {
    // Get all diagnostics from VS Code
    const allDiagnostics = vscode.languages.getDiagnostics();

    if (allDiagnostics.length === 0) {
      return {
        type: 'problems',
        content: 'No problems found in workspace.',
      };
    }

    // Format diagnostics
    const lines: string[] = [];
    for (const [uri, diagnostics] of allDiagnostics) {
      if (diagnostics.length > 0) {
        lines.push(`\n${uri.fsPath}:`);
        for (const diag of diagnostics) {
          const severity = ['Error', 'Warning', 'Info', 'Hint'][diag.severity];
          lines.push(
            `  Line ${diag.range.start.line + 1}: [${severity}] ${diag.message}`
          );
        }
      }
    }

    return {
      type: 'problems',
      content: lines.join('\n'),
    };
  }

  private async resolveGit(): Promise<ResolvedMention | null> {
    try {
      // Access VS Code's built-in Git extension
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
    } catch (error) {
      console.error('Failed to resolve @git', error);
      return null;
    }
  }

  private async resolveUrl(url: string): Promise<ResolvedMention | null> {
    try {
      const response = await fetch(url);
      const content = await response.text();

      return {
        type: 'url',
        content: content.slice(0, 10000), // Limit to 10KB
        metadata: { path: url },
      };
    } catch (error) {
      console.error(`Failed to resolve @url:${url}`, error);
      return null;
    }
  }
}
```

#### Chat Integration

```typescript
// In ChatViewProvider._sendMessage
private async _sendMessage(text: string): Promise<void> {
  if (!this._sessionId) return;

  // Resolve mentions
  const { text: cleanText, mentions } = await this.mentionResolver.resolve(text);

  // Build context update from resolved mentions
  const contextUpdate: any = {};

  for (const mention of mentions) {
    switch (mention.type) {
      case 'file':
        if (!contextUpdate.open_files) contextUpdate.open_files = [];
        contextUpdate.open_files.push({
          path: mention.metadata?.path,
          language: mention.metadata?.language,
          content: mention.content,
        });
        break;

      case 'selection':
        contextUpdate.selection = {
          path: mention.metadata?.path,
          text: mention.content,
          range: mention.metadata?.range,
        };
        break;

      case 'problems':
        contextUpdate.diagnostics_summary = mention.content;
        break;

      case 'git':
        contextUpdate.git_summary = mention.content;
        break;

      case 'folder':
      case 'url':
        // Add to general context
        if (!contextUpdate.additional_context) {
          contextUpdate.additional_context = [];
        }
        contextUpdate.additional_context.push({
          type: mention.type,
          content: mention.content,
        });
        break;
    }
  }

  // Send to server
  await this._client.submitPrompt(this._sessionId, cleanText, contextUpdate);
}
```

#### Chat UI with Autocomplete

```html
<!-- Mention autocomplete in chat input -->
<div id="mention-suggestions" class="hidden">
  <div class="mention-item" data-mention="@file:">
    <span class="codicon codicon-file"></span> @file: - Include a file
  </div>
  <div class="mention-item" data-mention="@folder:">
    <span class="codicon codicon-folder"></span> @folder: - Include folder
  </div>
  <div class="mention-item" data-mention="@selection">
    <span class="codicon codicon-selection"></span> @selection - Current selection
  </div>
  <div class="mention-item" data-mention="@problems">
    <span class="codicon codicon-warning"></span> @problems - All diagnostics
  </div>
  <div class="mention-item" data-mention="@git">
    <span class="codicon codicon-git-branch"></span> @git - Git status
  </div>
  <div class="mention-item" data-mention="@url:">
    <span class="codicon codicon-globe"></span> @url: - Fetch URL content
  </div>
</div>
```

**Example Usage**:
```
User: "Explain @file:src/utils.ts and check for @problems"

Extension resolves:
- @file:src/utils.ts → reads file content
- @problems → gets all VS Code diagnostics

Server receives:
- prompt: "Explain and check for"
- context_update: {
    open_files: [{ path: "src/utils.ts", content: "..." }],
    diagnostics_summary: "Line 5: [Error] Undefined variable..."
  }
```

---

### Mode System

Different modes optimize Amplifier for different tasks by using different **Amplifier profiles**.

#### Architecture Principle

**Modes are profiles, not filters.** The extension doesn't filter tools; instead, it loads different Amplifier profiles that come pre-configured with appropriate tool sets.

#### Available Modes

| Mode | Profile | Tools | Use Case |
|------|---------|-------|----------|
| **Code** | `vscode:code` | filesystem, bash, web, search, task | Writing/editing code |
| **Architect** | `vscode:architect` | filesystem (read-only), search | Design, planning, analysis |
| **Ask** | `vscode:ask` | None | Quick questions, explanations |

#### Profile Definitions

```yaml
# ~/.amplifier/profiles/vscode:code.yaml
name: vscode:code
description: "Code mode - full development capabilities"
extends: foundation:dev
tools:
  - module: tool-filesystem
  - module: tool-bash
  - module: tool-web
  - module: tool-search
  - module: tool-task
hooks:
  - module: hooks-logging
  - module: hooks-streaming-ui
  - module: hooks-approval
```

```yaml
# ~/.amplifier/profiles/vscode:architect.yaml
name: vscode:architect
description: "Architect mode - read-only for planning"
extends: foundation:dev
tools:
  - module: tool-filesystem
    config:
      read_only: true  # Only read operations allowed
  - module: tool-search
  # No bash, web, or task tools
hooks:
  - module: hooks-logging
  - module: hooks-streaming-ui
  - module: hooks-approval
    config:
      deny_operations: ["write_file", "execute_command"]
```

```yaml
# ~/.amplifier/profiles/vscode:ask.yaml
name: vscode:ask
description: "Ask mode - conversation only"
extends: foundation:simple
# No tools configured - pure conversation
orchestrator:
  config:
    system_instruction: |
      You are in Ask mode. Answer questions clearly and concisely.
      You cannot execute tools or make changes to files.
```

#### Implementation

```typescript
// extension/src/types/modes.ts
export type AmplifierMode = 'code' | 'architect' | 'ask';

export const MODE_TO_PROFILE: Record<AmplifierMode, string> = {
  code: 'vscode:code',
  architect: 'vscode:architect',
  ask: 'vscode:ask',
};

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
  // Use provided mode or setting default
  const config = vscode.workspace.getConfiguration('amplifier');
  this.currentMode = mode || config.get('defaultMode', 'code');
  
  // Map mode to profile name
  const profileName = MODE_TO_PROFILE[this.currentMode];
  
  // Gather context
  const context = await this._contextGatherer.gather();
  const apiKey = await this._credentialsManager.getApiKey();
  
  if (!apiKey) {
    this._postMessage({ type: 'needsApiKey' });
    return;
  }
  
  // Create session with mode-specific profile
  const response = await this._client.createSession({
    profile: profileName,  // 'vscode:code' | 'vscode:architect' | 'vscode:ask'
    credentials: { anthropic_api_key: apiKey },
    context,
  });
  
  this._sessionId = response.session_id;
  
  // Subscribe to events and notify UI
  await this._subscribeToEvents();
  this._postMessage({ 
    type: 'sessionStarted', 
    sessionId: this._sessionId,
    mode: this.currentMode,
  });
}

private async _switchMode(newMode: AmplifierMode): Promise<void> {
  // Stop current session
  if (this._sessionId) {
    await this._stopSession();
  }
  
  // Start new session with new mode/profile
  await this._startSession(newMode);
}
```

#### Chat UI Mode Selector

```html
<!-- Mode selector in chat panel -->
<div id="mode-selector" class="mode-selector">
  <button class="mode-btn active" data-mode="code" title="Full access">
    <span class="codicon codicon-code"></span> Code
  </button>
  <button class="mode-btn" data-mode="architect" title="Read-only">
    <span class="codicon codicon-layers"></span> Architect
  </button>
  <button class="mode-btn" data-mode="ask" title="Conversation only">
    <span class="codicon codicon-comment-discussion"></span> Ask
  </button>
</div>
```

#### VS Code Settings

```json
{
  "amplifier.defaultMode": {
    "type": "string",
    "default": "code",
    "enum": ["code", "architect", "ask"],
    "enumDescriptions": [
      "Full access to all tools for code changes",
      "Read-only access for design and planning",
      "No tools - questions and explanations only"
    ],
    "description": "Default mode when starting a new chat session"
  }
}
```

#### Server API Update

```python
# Update CreateSessionRequest model
class CreateSessionRequest(BaseModel):
    profile: str = "vscode:code"  # Profile name, not generic "dev"
    credentials: Credentials | None = None
    context: WorkspaceContext | None = None
```

The server simply loads the requested profile - no mode-specific logic needed!

---

### Steering Files (Project Context)

Steering files provide persistent project context that Amplifier uses in every interaction.

#### File Location

```
.amplifier/
└── steering/
    ├── product.md      # What this product does, who it's for
    ├── tech.md         # Technology stack, frameworks, constraints
    ├── conventions.md  # Coding style, patterns, best practices
    └── testing.md      # Testing approach (example conditional)
```

#### File Format

```markdown
---
inclusion: always
---

# Technology Stack

## Frontend
- React 18 with TypeScript
- Tailwind CSS for styling
- Vite for bundling

## Backend
- FastAPI with Python 3.11+
- PostgreSQL database
- Redis for caching

## Code Style
- Use functional components
- Prefer composition over inheritance
- Keep functions under 50 lines
```

#### Inclusion Modes

```yaml
---
inclusion: always      # Always included in every session
---

---
inclusion: fileMatch
pattern: "**/*.test.*"  # Only when working with test files
---

---
inclusion: manual      # Only via explicit #tech mention in chat
---
```

#### User Workflow

**Creating steering files** (file-based, simple):

```bash
# Option 1: Manual creation
mkdir -p .amplifier/steering
cat > .amplifier/steering/tech.md << 'EOF'
---
inclusion: always
---
# Tech Stack
- React 18
- TypeScript
EOF

# Option 2: Via VS Code command (to be implemented)
# Command Palette → "Amplifier: Generate Steering Files"
```

**Disabling steering** (just delete the file):

```bash
rm .amplifier/steering/tech.md
```

**Temporary exclusion** (for one session):

In chat:
```
User: "Ignore tech stack guidelines for this question"
```

Extension can send:
```json
{
  "prompt": "...",
  "context_update": {
    "exclude_steering": ["tech"]
  }
}
```

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
    """Loads and filters steering files from .amplifier/steering/"""
    
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
                
                docs.append(SteeringDocument(
                    name=md_file.stem,
                    content=body,
                    metadata=metadata,
                ))
            except Exception as e:
                # Log but don't fail if one file is malformed
                print(f"Warning: Failed to load {md_file}: {e}")
        
        return docs
    
    def filter_for_context(
        self,
        docs: list[SteeringDocument],
        current_file: str | None = None,
        exclude: list[str] | None = None,
    ) -> str:
        """Filter steering based on inclusion mode and context."""
        included = []
        exclude = exclude or []
        
        for doc in docs:
            # Skip excluded
            if doc.name in exclude:
                continue
            
            # Always include
            if doc.inclusion == "always":
                included.append(doc)
            
            # Conditional on file pattern
            elif doc.inclusion == "fileMatch" and current_file:
                if self._matches_pattern(current_file, doc.pattern):
                    included.append(doc)
            
            # Manual inclusion - skip (only via explicit #mention)
        
        # Format for injection into system prompt
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
        
        # Find end of frontmatter
        end_index = content.find("\n---\n", 4)
        if end_index == -1:
            return {}, content
        
        frontmatter_str = content[4:end_index]
        body = content[end_index + 5:].strip()
        
        try:
            metadata = yaml.safe_load(frontmatter_str) or {}
            return metadata, body
        except yaml.YAMLError:
            # Invalid YAML - treat whole thing as content
            return {}, content
    
    def _matches_pattern(self, file_path: str, pattern: str) -> bool:
        """Check if file matches glob pattern."""
        # Convert to relative path for matching
        return fnmatch(file_path, pattern)
```

**Inject into SessionRunner:**

```python
# In SessionRunner.start()
async def start(self) -> str:
    # Load profile and compile mount plan
    loader = ProfileLoader()
    profile = loader.load_profile(self.profile_name)
    mount_plan = compile_profile_to_mount_plan(profile)
    
    # Load and inject steering files
    if self.workspace_context and self.workspace_context.get("workspace_root"):
        workspace_root = Path(self.workspace_context["workspace_root"])
        steering_loader = SteeringLoader(workspace_root)
        steering_docs = steering_loader.load_all()
        
        # Filter based on current file context
        current_file = None
        if self.workspace_context.get("selection"):
            current_file = self.workspace_context["selection"].get("path")
        
        exclude = self.workspace_context.get("exclude_steering", [])
        steering_content = steering_loader.filter_for_context(
            steering_docs,
            current_file=current_file,
            exclude=exclude,
        )
        
        # Inject into orchestrator system instruction
        if steering_content:
            if "orchestrator" not in mount_plan:
                mount_plan["orchestrator"] = {}
            if "config" not in mount_plan["orchestrator"]:
                mount_plan["orchestrator"]["config"] = {}
            
            existing = mount_plan["orchestrator"]["config"].get("system_instruction", "")
            mount_plan["orchestrator"]["config"]["system_instruction"] = (
                f"{steering_content}\n\n{existing}"
            )
    
    # Continue with workspace context injection...
    if self.workspace_context:
        mount_plan = self._inject_context(mount_plan, self.workspace_context)
    
    # Create and initialize session
    # ...
```

#### UX Benefits

1. **Persistent Memory**: Project conventions survive across sessions
2. **Team Alignment**: Shared steering files ensure consistent AI behavior
3. **Conditional Context**: Testing guidelines only appear when writing tests
4. **Zero Configuration**: Just create `.md` files, no settings needed
5. **Version Controlled**: Steering files live in `.amplifier/` and can be committed to git

---

### Terminal Integration

Amplifier uses both **integrated terminal** and **output channel** contextually.

#### When to Use Each

| Use Case | Component | Visibility | API |
|----------|-----------|------------|-----|
| `bash` tool execution | Integrated Terminal | Visible, user sees commands run | `Terminal.shellIntegration.executeCommand` |
| Server logs | Output Channel | Hidden, available on demand | `OutputChannel.appendLine` |
| Event debugging | Output Channel | Hidden, developer tool | `LogOutputChannel` |
| AI thinking | Chat Panel | Visible, inline with conversation | WebView |

#### Integrated Terminal for bash Tool

```typescript
// extension/src/services/TerminalManager.ts
import * as vscode from 'vscode';

export class TerminalManager {
  private amplifierTerminal: vscode.Terminal | undefined;

  async executeCommand(
    command: string,
    cwd: string
  ): Promise<{ exitCode: number | undefined; output: string }> {
    // Get or create Amplifier terminal
    if (!this.amplifierTerminal || this.amplifierTerminal.exitStatus) {
      this.amplifierTerminal = vscode.window.createTerminal({
        name: 'Amplifier',
        cwd,
        iconPath: new vscode.ThemeIcon('hubot'),
      });
    }

    // Show terminal (user sees command execution)
    this.amplifierTerminal.show(false); // Focus terminal

    // Check for shell integration (VS Code 1.93+)
    if (this.amplifierTerminal.shellIntegration) {
      // Execute with shell integration - can capture output
      const execution = this.amplifierTerminal.shellIntegration.executeCommand(command);
      
      // Stream output
      const output: string[] = [];
      const stream = execution.read();
      
      for await (const data of stream) {
        output.push(data);
      }
      
      // Wait for completion
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
      
      return {
        exitCode: endEvent.exitCode,
        output: output.join(''),
      };
    } else {
      // Fallback: send text without output capture
      this.amplifierTerminal.sendText(command, true);
      
      return {
        exitCode: undefined,
        output: '[Shell integration not available - output not captured]',
      };
    }
  }

  dispose(): void {
    this.amplifierTerminal?.dispose();
  }
}
```

#### Output Channel for Logs

```typescript
// extension/src/extension.ts
// Create output channel for debugging
const outputChannel = vscode.window.createOutputChannel('Amplifier', { log: true });

// Log server output
serverManager.process.stdout?.on('data', (data) => {
  outputChannel.appendLine(`[Server] ${data.toString().trim()}`);
});

serverManager.process.stderr?.on('data', (data) => {
  outputChannel.appendLine(`[Server Error] ${data.toString().trim()}`);
});

// Log events (low priority)
eventStream.subscribe(sessionId, {
  onToolStart: (data) => {
    outputChannel.debug(`Tool started: ${data.tool_name}.${data.operation}`);
  },
  onToolEnd: (data) => {
    outputChannel.debug(
      `Tool completed: ${data.tool_name}.${data.operation} (${data.duration_ms}ms)`
    );
  },
});
```

#### Integration with Event Handlers

```typescript
// In ChatViewProvider event handlers
onToolStart: async (data) => {
  if (data.tool_name === 'bash') {
    // Execute in visible terminal
    const result = await this.terminalManager.executeCommand(
      data.input.command,
      data.input.cwd || workspaceRoot
    );
    
    // Log to output channel for debugging
    outputChannel.appendLine(
      `[Bash] ${data.input.command} → exit ${result.exitCode || 'unknown'}`
    );
    
    // Display in chat panel
    this._postMessage({
      type: 'toolExecution',
      tool: 'bash',
      command: data.input.command,
      status: 'running',
    });
  } else {
    // Other tools - just log
    outputChannel.appendLine(`[Tool] ${data.tool_name}: ${data.operation}`);
  }
},

onToolEnd: async (data) => {
  if (data.tool_name === 'bash') {
    // Update chat panel with result
    this._postMessage({
      type: 'toolComplete',
      tool: 'bash',
      exitCode: data.result?.exit_code,
      output: data.result?.output,
    });
  }
}
```

#### Benefits

- **Terminal**: Users see commands executing in real-time, can interact if needed
- **Output Channel**: Debug logs don't clutter UI, available when troubleshooting
- **Chat Panel**: Context-aware display of tool execution inline with conversation

---

## Next Steps

See [DEVELOPMENT.md](DEVELOPMENT.md) for implementation phases and detailed task breakdown.
