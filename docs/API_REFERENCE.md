# Amplifier VS Code Server API Reference

> **Status**: Design Document
> **Last Updated**: 2025-12-09

## Overview

The Amplifier VS Code extension communicates with a local Python backend server via REST API endpoints and Server-Sent Events (SSE). This document provides the complete API reference.

## Base URL

```
http://127.0.0.1:8765
```

The port is configurable via VS Code settings (`amplifier.server.port`).

**Note**: There is no `/api/v1` prefix for v1. Keeping the API surface simple.

---

## Sessions API

### Create Session

Creates a new Amplifier session with the specified profile.

**Endpoint**: `POST /sessions`

**Request Body**:
```json
{
  "profile": "dev",
  "model": "claude-sonnet-4-5",
  "credentials": {
    "anthropic_api_key": "sk-ant-..."
  },
  "context": {
    "workspace_root": "/path/to/workspace",
    "open_files": [
      {
        "path": "/path/to/file.py",
        "language": "python",
        "content": "...",
        "cursor_position": {"line": 10, "character": 5}
      }
    ],
    "git_state": {
      "branch": "main",
      "staged_files": ["file.py"],
      "modified_files": ["other.py"],
      "untracked_files": []
    },
    "diagnostics": [
      {
        "path": "/path/to/file.py",
        "severity": "error",
        "message": "Undefined variable 'foo'",
        "range": {"start": {"line": 5, "character": 0}, "end": {"line": 5, "character": 3}}
      }
    ],
    "selection": {
      "path": "/path/to/file.py",
      "text": "selected text",
      "range": {"start": {"line": 10, "character": 0}, "end": {"line": 15, "character": 0}}
    }
  }
}
```

**Response** (201 Created):
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "created",
  "profile": "dev",
  "created_at": "2025-12-09T10:30:00Z"
}
```

**Error Responses**:
- `400 Bad Request`: Invalid profile name or context format
- `500 Internal Server Error`: Failed to initialize session

---

### Submit Prompt

Submits a prompt to an existing session.

**Endpoint**: `POST /sessions/{session_id}/prompt`

**Path Parameters**:
- `session_id` (string, required): The session UUID

**Request Body**:
```json
{
  "prompt": "Explain this code and suggest improvements",
  "context_update": {
    "selection": {
      "path": "/path/to/file.py",
      "text": "def foo():\n    pass",
      "range": {"start": {"line": 10, "character": 0}, "end": {"line": 11, "character": 8}}
    }
  }
}
```

**Response** (202 Accepted):
```json
{
  "request_id": "req-123",
  "status": "processing",
  "message": "Prompt submitted, subscribe to events for response"
}
```

The actual response is streamed via SSE (see [Event Streaming](#event-streaming)).

**Error Responses**:
- `404 Not Found`: Session not found
- `409 Conflict`: Session is busy processing another prompt
- `500 Internal Server Error`: Failed to process prompt

---

### Get Session Status

Gets the current status of a session.

**Endpoint**: `GET /sessions/{session_id}`

**Path Parameters**:
- `session_id` (string, required): The session UUID

**Response** (200 OK):
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "idle",
  "profile": "dev",
  "created_at": "2025-12-09T10:30:00Z",
  "last_activity": "2025-12-09T10:35:00Z",
  "message_count": 5,
  "token_usage": {
    "input_tokens": 15000,
    "output_tokens": 3500
  },
  "pending_approval": null
}
```

**Status Values**:
- `idle`: Session is ready for prompts
- `processing`: Session is processing a prompt
- `awaiting_approval`: Session is waiting for user approval
- `error`: Session encountered an error
- `stopped`: Session has been stopped

**Error Responses**:
- `404 Not Found`: Session not found

---

### Submit Approval Decision

Submits a user's approval decision for a pending approval request.

**Endpoint**: `POST /sessions/{session_id}/approval`

**Path Parameters**:
- `session_id` (string, required): The session UUID

**Request Body**:
```json
{
  "decision": "Allow"
}
```

The `decision` value must be one of the options provided in the `approval:required` event.

**Response** (200 OK):
```json
{
  "status": "approved",
  "message": "Approval decision recorded"
}
```

**Error Responses**:
- `404 Not Found`: Session not found
- `400 Bad Request`: No pending approval or invalid decision
- `409 Conflict`: Approval already resolved or timed out

---

### Stop Session

Stops and cleans up a session.

**Endpoint**: `DELETE /sessions/{session_id}`

**Path Parameters**:
- `session_id` (string, required): The session UUID

**Response** (200 OK):
```json
{
  "status": "stopped",
  "message": "Session stopped and cleaned up"
}
```

**Error Responses**:
- `404 Not Found`: Session not found

---

### List Sessions

Lists all active sessions.

**Endpoint**: `GET /sessions`

**Query Parameters**:
- `status` (string, optional): Filter by status
- `limit` (integer, optional): Maximum sessions to return (default: 50)

**Response** (200 OK):
```json
{
  "sessions": [
    {
      "session_id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "idle",
      "profile": "dev",
      "created_at": "2025-12-09T10:30:00Z"
    }
  ],
  "total": 1
}
```

---

## Event Streaming

### Subscribe to Session Events

Opens an SSE connection to receive real-time events from a session.

**Endpoint**: `GET /sessions/{session_id}/events`

**Path Parameters**:
- `session_id` (string, required): The session UUID

**Headers**:
```
Accept: text/event-stream
Cache-Control: no-cache
```

**Response**: Server-Sent Events stream

### Event Format

Each SSE message follows this format:
```
data: {"event": "event_name", "data": {...}}

```

The `data` field is a JSON object with:
- `event` (string): The canonical event name
- `data` (object): Event-specific payload

### Canonical Events

#### Session Lifecycle

**`session:start`**
```json
{
  "event": "session:start",
  "data": {
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "profile": "dev",
    "timestamp": "2025-12-09T10:30:00Z"
  }
}
```

**`session:end`**
```json
{
  "event": "session:end",
  "data": {
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "reason": "user_stopped",
    "token_usage": {
      "input_tokens": 15000,
      "output_tokens": 3500
    }
  }
}
```

#### Prompt Lifecycle

**`prompt:submit`**
```json
{
  "event": "prompt:submit",
  "data": {
    "session_id": "...",
    "request_id": "req-123",
    "prompt": "Explain this code"
  }
}
```

**`prompt:complete`**
```json
{
  "event": "prompt:complete",
  "data": {
    "session_id": "...",
    "request_id": "req-123",
    "response": "The final response text...",
    "token_usage": {
      "input_tokens": 1500,
      "output_tokens": 350
    }
  }
}
```

#### Content Streaming

**`content_block:start`**
```json
{
  "event": "content_block:start",
  "data": {
    "session_id": "...",
    "block_type": "text",
    "block_index": 0
  }
}
```

**`content_block:delta`**
```json
{
  "event": "content_block:delta",
  "data": {
    "session_id": "...",
    "block_index": 0,
    "delta": "Here is the next piece of text..."
  }
}
```

**`content_block:end`**
```json
{
  "event": "content_block:end",
  "data": {
    "session_id": "...",
    "block_index": 0
  }
}
```

#### Thinking/Reasoning

**`thinking:delta`**
```json
{
  "event": "thinking:delta",
  "data": {
    "session_id": "...",
    "delta": "Let me think about this..."
  }
}
```

**`thinking:final`**
```json
{
  "event": "thinking:final",
  "data": {
    "session_id": "...",
    "thinking": "Complete thinking content..."
  }
}
```

#### Tool Execution

**`tool:pre`**
```json
{
  "event": "tool:pre",
  "data": {
    "session_id": "...",
    "tool_name": "filesystem",
    "operation": "read_file",
    "input": {
      "path": "/path/to/file.py"
    }
  }
}
```

**`tool:post`**
```json
{
  "event": "tool:post",
  "data": {
    "session_id": "...",
    "tool_name": "filesystem",
    "operation": "read_file",
    "result": {
      "success": true,
      "output": "file content..."
    },
    "duration_ms": 15
  }
}
```

**`tool:error`**
```json
{
  "event": "tool:error",
  "data": {
    "session_id": "...",
    "tool_name": "filesystem",
    "operation": "read_file",
    "error": "File not found: /path/to/file.py"
  }
}
```

#### Approval Flow

**`approval:required`**
```json
{
  "event": "approval:required",
  "data": {
    "session_id": "...",
    "approval_id": "appr-456",
    "prompt": "Allow writing to /path/to/file.py?",
    "options": ["Allow", "Deny", "Allow All"],
    "timeout": 300,
    "default": "deny",
    "context": {
      "tool": "filesystem",
      "operation": "write_file",
      "path": "/path/to/file.py"
    }
  }
}
```

**`approval:granted`**
```json
{
  "event": "approval:granted",
  "data": {
    "session_id": "...",
    "approval_id": "appr-456",
    "decision": "Allow"
  }
}
```

**`approval:denied`**
```json
{
  "event": "approval:denied",
  "data": {
    "session_id": "...",
    "approval_id": "appr-456",
    "decision": "Deny",
    "reason": "user_denied"
  }
}
```

#### Diagnostics/Problems

**`diagnostic:add`** (Custom VS Code event)
```json
{
  "event": "diagnostic:add",
  "data": {
    "session_id": "...",
    "path": "/path/to/file.py",
    "diagnostics": [
      {
        "range": {"start": {"line": 10, "character": 0}, "end": {"line": 10, "character": 20}},
        "severity": "warning",
        "message": "[Amplifier] Consider using list comprehension here",
        "source": "amplifier"
      }
    ]
  }
}
```

**`diagnostic:clear`** (Custom VS Code event)
```json
{
  "event": "diagnostic:clear",
  "data": {
    "session_id": "...",
    "path": "/path/to/file.py"
  }
}
```

#### Status Updates

**`status:update`** (Custom VS Code event)
```json
{
  "event": "status:update",
  "data": {
    "session_id": "...",
    "status": "processing",
    "message": "Analyzing code...",
    "progress": 45
  }
}
```

---

## Profiles API

### List Profiles

Lists all available profiles.

**Endpoint**: `GET /profiles`

**Query Parameters**:
- `collection` (string, optional): Filter by collection name

**Response** (200 OK):
```json
{
  "profiles": [
    {
      "name": "foundation",
      "collection": null,
      "description": "Foundation profile with essential tools",
      "extends": null
    },
    {
      "name": "dev",
      "collection": null,
      "description": "Development profile with full capabilities",
      "extends": "foundation"
    },
    {
      "name": "design-intelligence:architect",
      "collection": "design-intelligence",
      "description": "Zen-like architect assistant",
      "extends": "foundation:dev"
    }
  ]
}
```

---

### Get Profile Details

Gets detailed information about a specific profile.

**Endpoint**: `GET /profiles/{profile_name}`

**Path Parameters**:
- `profile_name` (string, required): Profile name (e.g., "dev" or "collection:profile")

**Response** (200 OK):
```json
{
  "name": "dev",
  "collection": null,
  "description": "Development profile with full capabilities",
  "extends": "foundation",
  "providers": [
    {
      "module": "provider-anthropic",
      "config": {
        "default_model": "claude-sonnet-4-5"
      }
    }
  ],
  "tools": [
    {"module": "tool-filesystem"},
    {"module": "tool-bash"},
    {"module": "tool-web"},
    {"module": "tool-search"},
    {"module": "tool-task"}
  ],
  "hooks": [
    {"module": "hooks-logging"},
    {"module": "hooks-streaming-ui"},
    {"module": "hooks-approval"}
  ],
  "agents": ["zen-architect", "bug-hunter", "code-reviewer"]
}
```

**Error Responses**:
- `404 Not Found`: Profile not found

---

## Collections API

### List Collections

Lists all available collections.

**Endpoint**: `GET /collections`

**Response** (200 OK):
```json
{
  "collections": [
    {
      "name": "design-intelligence",
      "description": "Design intelligence collection for architects",
      "version": "1.0.0",
      "profiles": ["architect", "reviewer"],
      "agents": ["zen-architect", "code-critic"]
    }
  ]
}
```

---

## Agents API

### List Agents

Lists all available agents.

**Endpoint**: `GET /agents`

**Query Parameters**:
- `collection` (string, optional): Filter by collection name

**Response** (200 OK):
```json
{
  "agents": [
    {
      "name": "zen-architect",
      "collection": "design-intelligence",
      "description": "Zen-like architect with minimal, elegant solutions",
      "providers": [{"module": "provider-anthropic"}]
    },
    {
      "name": "bug-hunter",
      "collection": null,
      "description": "Specialized in finding and fixing bugs"
    }
  ]
}
```

---

## Server Management API

### Health Check

Checks server health and readiness.

**Endpoint**: `GET /health`

**Response** (200 OK):
```json
{
  "status": "healthy",
  "version": "0.1.0",
  "uptime_seconds": 3600,
  "active_sessions": 2
}
```

---

### Server Info

Gets server configuration and capabilities.

**Endpoint**: `GET /info`

**Response** (200 OK):
```json
{
  "version": "0.1.0",
  "amplifier_core_version": "0.5.0",
  "capabilities": {
    "streaming": true,
    "extended_thinking": true,
    "tool_use": true
  },
  "config": {
    "host": "127.0.0.1",
    "port": 8765,
    "profiles_path": "~/.amplifier/profiles",
    "collections_path": "~/.amplifier/collections"
  }
}
```

---

## Error Response Format

All error responses follow this format:

```json
{
  "error": {
    "code": "SESSION_NOT_FOUND",
    "message": "Session with ID '...' not found",
    "details": {
      "session_id": "..."
    }
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_REQUEST` | 400 | Request body validation failed |
| `MISSING_CREDENTIALS` | 401 | No API key provided in credentials |
| `INVALID_API_KEY` | 401 | API key is invalid or malformed |
| `API_KEY_UNAUTHORIZED` | 403 | API key lacks required permissions |
| `RATE_LIMITED` | 429 | Provider rate limit exceeded |
| `SESSION_NOT_FOUND` | 404 | Session does not exist |
| `PROFILE_NOT_FOUND` | 404 | Profile does not exist |
| `SESSION_BUSY` | 409 | Session is processing another request |
| `APPROVAL_TIMEOUT` | 408 | Approval request timed out |
| `APPROVAL_INVALID` | 400 | Invalid approval decision |
| `SERVER_ERROR` | 500 | Internal server error |
| `MODULE_LOAD_FAILED` | 500 | Failed to load required module |
| `PROVIDER_ERROR` | 502 | LLM provider returned an error |
| `PROVIDER_UNAVAILABLE` | 503 | LLM provider is unavailable |

---

## TypeScript Client Types

For use in the VS Code extension:

```typescript
// Session types
interface CreateSessionRequest {
  profile: string;
  model?: string;
  credentials: Credentials;
  context?: WorkspaceContext;
}

interface Credentials {
  anthropic_api_key?: string;
  // Future: openai_api_key, azure_api_key, etc.
}

interface CreateSessionResponse {
  session_id: string;
  status: string;
  profile: string;
  created_at: string;
}

interface PromptRequest {
  prompt: string;
  context_update?: Partial<WorkspaceContext>;
}

interface ApprovalRequest {
  decision: string;
}

// Context types
interface WorkspaceContext {
  workspace_root: string;
  open_files?: OpenFile[];
  git_state?: GitState;
  diagnostics?: Diagnostic[];
  selection?: Selection;
}

interface OpenFile {
  path: string;
  language: string;
  content: string;
  cursor_position?: Position;
}

interface GitState {
  branch: string;
  staged_files: string[];
  modified_files: string[];
  untracked_files: string[];
}

interface Position {
  line: number;
  character: number;
}

interface Range {
  start: Position;
  end: Position;
}

interface Diagnostic {
  path: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  range: Range;
}

interface Selection {
  path: string;
  text: string;
  range: Range;
}

// Event handlers interface (for EventStreamManager)
interface EventHandlers {
  onConnected?: () => void;
  onReconnecting?: (attempt: number, delay: number) => void;
  onContentDelta?: (data: ContentDeltaEvent) => void;
  onThinkingDelta?: (data: ThinkingDeltaEvent) => void;
  onThinkingStart?: (data: any) => void;
  onThinkingEnd?: (data: any) => void;
  onToolStart?: (data: ToolPreEvent) => void;
  onToolEnd?: (data: ToolPostEvent) => void;
  onApprovalRequired?: (data: ApprovalRequiredEvent) => void;
  onPromptComplete?: (data: PromptCompleteEvent) => void;
  onError?: (error: Error) => void;
}

// Event types
interface AmplifierEvent<T = unknown> {
  event: string;
  data: T & { session_id: string };
}

interface ContentDeltaEvent {
  session_id: string;
  block_index: number;
  delta: string;
}

interface ToolPreEvent {
  session_id: string;
  tool_name: string;
  operation: string;
  input: Record<string, unknown>;
}

interface ApprovalRequiredEvent {
  session_id: string;
  approval_id: string;
  prompt: string;
  options: string[];
  timeout: number;
  default: 'allow' | 'deny';
  context?: Record<string, unknown>;
}

// Profile types
interface Profile {
  name: string;
  collection: string | null;
  description: string;
  extends: string | null;
  providers?: ModuleConfig[];
  tools?: ModuleConfig[];
  hooks?: ModuleConfig[];
  agents?: string[];
}

interface ModuleConfig {
  module: string;
  source?: string;
  config?: Record<string, unknown>;
}
```

---

## Future Considerations

The following features are intentionally deferred from v1 to maintain simplicity:

### Rate Limiting (Deferred)

For public or shared deployments, rate limiting may be added:

- Session creation limits per client
- Prompt submission limits per session
- Concurrent connection limits

For v1, the local-only server model makes rate limiting unnecessary.

### Authentication (Deferred)

For local-only deployment on `127.0.0.1`, authentication adds complexity without significant security benefit. Consider adding for:

- Multi-user shared machines
- Enterprise compliance requirements
- Persistent server deployments

### Input Validation (Deferred)

Basic prompt length limits may be added if users encounter issues with large inputs. The LLM providers handle content filtering.

---

## WebSocket Alternative

For environments where SSE is problematic, a WebSocket endpoint is available:

**Endpoint**: `WS /sessions/{session_id}/ws`

Messages follow the same JSON format as SSE events:

```json
{"event": "content_block:delta", "data": {"session_id": "...", "delta": "..."}}
```

Client-to-server messages for control:
```json
{"action": "submit_prompt", "prompt": "..."}
{"action": "submit_approval", "decision": "Allow"}
{"action": "stop"}
```
