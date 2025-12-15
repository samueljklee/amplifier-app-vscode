"""Pydantic models for Amplifier VS Code Server API."""

from typing import Any, Literal
from pydantic import BaseModel, Field
from datetime import datetime


# Request models
class Position(BaseModel):
    """Cursor or range position."""
    line: int
    character: int


class Range(BaseModel):
    """Text range in a document."""
    start: Position
    end: Position


class OpenFile(BaseModel):
    """Open file context."""
    path: str
    language: str
    content: str
    cursor_position: Position | None = None


class GitState(BaseModel):
    """Git repository state."""
    branch: str
    staged_files: list[str] = Field(default_factory=list)
    modified_files: list[str] = Field(default_factory=list)
    untracked_files: list[str] = Field(default_factory=list)


class Diagnostic(BaseModel):
    """VS Code diagnostic/problem."""
    path: str
    severity: Literal["error", "warning", "info", "hint"]
    message: str
    range: Range


class Selection(BaseModel):
    """Text selection context."""
    path: str
    text: str
    range: Range


class WorkspaceContext(BaseModel):
    """Workspace context for session."""
    workspace_root: str
    open_files: list[OpenFile] = Field(default_factory=list)
    git_state: GitState | None = None
    diagnostics: list[Diagnostic] = Field(default_factory=list)
    selection: Selection | None = None


class Credentials(BaseModel):
    """API credentials for providers."""
    anthropic_api_key: str | None = None
    # Future: openai_api_key, azure_api_key, etc.


class CreateSessionRequest(BaseModel):
    """Request to create a new session."""
    profile: str = "dev"
    model: str | None = None
    credentials: Credentials | None = None
    context: WorkspaceContext | None = None


class PromptRequest(BaseModel):
    """Request to submit a prompt to a session."""
    prompt: str
    context_update: dict[str, Any] | None = None


class ApprovalRequest(BaseModel):
    """Request to submit approval decision."""
    decision: str


# Response models
class CreateSessionResponse(BaseModel):
    """Response from session creation."""
    session_id: str
    status: str
    profile: str
    created_at: datetime


class PromptResponse(BaseModel):
    """Response from prompt submission."""
    request_id: str
    status: str = "processing"
    message: str = "Prompt submitted, subscribe to events for response"


class TokenUsage(BaseModel):
    """Token usage statistics."""
    input_tokens: int
    output_tokens: int


class SessionStatus(BaseModel):
    """Session status information."""
    session_id: str
    status: Literal["idle", "processing", "awaiting_approval", "error", "stopped"]
    profile: str
    created_at: datetime
    last_activity: datetime
    message_count: int = 0
    token_usage: TokenUsage | None = None
    pending_approval: dict[str, Any] | None = None


class SessionListItem(BaseModel):
    """Session summary for list endpoint."""
    session_id: str
    status: str
    profile: str
    created_at: datetime


class SessionListResponse(BaseModel):
    """Response from list sessions."""
    sessions: list[SessionListItem]
    total: int


class DeleteSessionResponse(BaseModel):
    """Response from session deletion."""
    status: str = "stopped"
    message: str = "Session stopped and cleaned up"


class ApprovalResponse(BaseModel):
    """Response from approval submission."""
    status: str = "approved"
    message: str = "Approval decision recorded"


# Profile models
class ModuleConfig(BaseModel):
    """Module configuration."""
    module: str
    source: str | None = None
    config: dict[str, Any] = Field(default_factory=dict)


class ProfileSummary(BaseModel):
    """Profile summary for list endpoint."""
    name: str
    collection: str | None = None
    description: str = ""
    extends: str | None = None


class ProfileDetail(BaseModel):
    """Detailed profile information."""
    name: str
    collection: str | None = None
    description: str = ""
    extends: str | None = None
    providers: list[ModuleConfig] = Field(default_factory=list)
    tools: list[ModuleConfig] = Field(default_factory=list)
    hooks: list[ModuleConfig] = Field(default_factory=list)
    agents: list[str] = Field(default_factory=list)


class ProfileListResponse(BaseModel):
    """Response from list profiles."""
    profiles: list[ProfileSummary]


# Server info models
class HealthResponse(BaseModel):
    """Health check response."""
    status: str = "healthy"
    version: str = "0.1.0"
    uptime_seconds: int | None = None
    active_sessions: int = 0


class ServerCapabilities(BaseModel):
    """Server capabilities."""
    streaming: bool = True
    extended_thinking: bool = True
    tool_use: bool = True


class ServerConfig(BaseModel):
    """Server configuration."""
    host: str = "127.0.0.1"
    port: int = 8765
    profiles_path: str
    collections_path: str


class InfoResponse(BaseModel):
    """Server info response."""
    version: str = "0.1.0"
    amplifier_core_version: str
    capabilities: ServerCapabilities
    config: ServerConfig


# Error models
class ErrorDetail(BaseModel):
    """Error detail information."""
    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


class ErrorResponse(BaseModel):
    """Standard error response."""
    error: ErrorDetail
