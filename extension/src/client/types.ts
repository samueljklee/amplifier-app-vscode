/**
 * TypeScript types for Amplifier VS Code Server API
 * Based on docs/API_REFERENCE.md
 */

// ============================================================================
// Session API Types
// ============================================================================

export interface CreateSessionRequest {
    profile: string;
    model?: string;
    credentials: Credentials;
    context?: WorkspaceContext;
}

export interface Credentials {
    anthropic_api_key?: string;
    // Future: openai_api_key, azure_api_key, etc.
}

export interface CreateSessionResponse {
    session_id: string;
    status: string;
    profile: string;
    created_at: string;
}

export interface PromptRequest {
    prompt: string;
    context_update?: Partial<WorkspaceContext>;
}

export interface PromptResponse {
    request_id: string;
    status: string;
    message: string;
}

export interface ApprovalRequest {
    decision: string;
}

export interface ApprovalResponse {
    status: string;
    message: string;
}

export interface SessionStatusResponse {
    session_id: string;
    status: SessionStatus;
    profile: string;
    created_at: string;
    last_activity: string;
    message_count: number;
    token_usage: TokenUsage;
    pending_approval: string | null;
}

export type SessionStatus = 'idle' | 'processing' | 'awaiting_approval' | 'error' | 'stopped';

export interface TokenUsage {
    input_tokens: number;
    output_tokens: number;
}

export interface ListSessionsResponse {
    sessions: SessionInfo[];
    total: number;
}

export interface SessionInfo {
    session_id: string;
    status: SessionStatus;
    profile: string;
    created_at: string;
}

// ============================================================================
// Workspace Context Types
// ============================================================================

export interface WorkspaceContext {
    workspace_root: string;
    open_files?: OpenFile[];
    git_state?: GitState;
    diagnostics?: Diagnostic[];
    selection?: Selection;
}

export interface OpenFile {
    path: string;
    language: string;
    content: string;
    cursor_position?: Position;
}

export interface GitState {
    branch: string;
    staged_files: string[];
    modified_files: string[];
    untracked_files: string[];
}

export interface Position {
    line: number;
    character: number;
}

export interface Range {
    start: Position;
    end: Position;
}

export interface Diagnostic {
    path: string;
    severity: 'error' | 'warning' | 'info' | 'hint';
    message: string;
    range: Range;
}

export interface Selection {
    path: string;
    text: string;
    range: Range;
}

// ============================================================================
// SSE Event Types
// ============================================================================

export interface AmplifierEvent<T = unknown> {
    event: string;
    data: T & { session_id: string };
}

export interface SessionStartEvent {
    session_id: string;
    profile: string;
    timestamp: string;
}

export interface SessionEndEvent {
    session_id: string;
    reason: string;
    token_usage: TokenUsage;
}

export interface PromptSubmitEvent {
    session_id: string;
    request_id: string;
    prompt: string;
}

export interface PromptCompleteEvent {
    session_id: string;
    request_id: string;
    response: string;
    token_usage: TokenUsage;
}

export interface ContentBlockStartEvent {
    session_id: string;
    block_type: string;
    block_index: number;
}

export interface ContentBlockDeltaEvent {
    session_id: string;
    block_index: number;
    delta: string;
}

export interface ContentBlockEndEvent {
    session_id: string;
    block_index: number;
}

export interface ThinkingDeltaEvent {
    session_id: string;
    delta: string;
}

export interface ThinkingFinalEvent {
    session_id: string;
    thinking: string;
}

export interface ToolPreEvent {
    session_id: string;
    tool_name: string;
    operation: string;
    input: Record<string, unknown>;
}

export interface ToolPostEvent {
    session_id: string;
    tool_name: string;
    operation: string;
    result: {
        success: boolean;
        output: unknown;
    };
    duration_ms: number;
}

export interface ToolErrorEvent {
    session_id: string;
    tool_name: string;
    operation: string;
    error: string;
}

export interface ApprovalRequiredEvent {
    session_id: string;
    approval_id: string;
    prompt: string;
    options: string[];
    timeout: number;
    default: 'allow' | 'deny';
    context?: Record<string, unknown>;
}

export interface ApprovalGrantedEvent {
    session_id: string;
    approval_id: string;
    decision: string;
}

export interface ApprovalDeniedEvent {
    session_id: string;
    approval_id: string;
    decision: string;
    reason: string;
}

export interface DiagnosticAddEvent {
    session_id: string;
    path: string;
    diagnostics: DiagnosticEntry[];
}

export interface DiagnosticEntry {
    range: Range;
    severity: 'error' | 'warning' | 'info' | 'hint';
    message: string;
    source: string;
}

export interface DiagnosticClearEvent {
    session_id: string;
    path: string;
}

export interface StatusUpdateEvent {
    session_id: string;
    status: string;
    message: string;
    progress?: number;
}

// Event handlers interface
export interface EventHandlers {
    onConnected?: () => void;
    onReconnecting?: (attempt: number, delay: number) => void;
    onContentDelta?: (data: ContentBlockDeltaEvent) => void;
    onThinkingDelta?: (data: ThinkingDeltaEvent) => void;
    onThinkingStart?: (data: any) => void;
    onThinkingEnd?: (data: any) => void;
    onToolStart?: (data: ToolPreEvent) => void;
    onToolEnd?: (data: ToolPostEvent) => void;
    onApprovalRequired?: (data: ApprovalRequiredEvent) => void;
    onPromptComplete?: (data: PromptCompleteEvent) => void;
    onError?: (error: Error) => void;
}

// ============================================================================
// Profile API Types
// ============================================================================

export interface ListProfilesResponse {
    profiles: ProfileInfo[];
}

export interface ProfileInfo {
    name: string;
    collection: string | null;
    description: string;
    extends: string | null;
}

export interface ProfileDetails extends ProfileInfo {
    providers?: ModuleConfig[];
    tools?: ModuleConfig[];
    hooks?: ModuleConfig[];
    agents?: string[];
}

export interface ModuleConfig {
    module: string;
    source?: string;
    config?: Record<string, unknown>;
}

// ============================================================================
// Error Types
// ============================================================================

export interface ApiError {
    error: {
        code: string;
        message: string;
        details?: Record<string, unknown>;
    };
}

export type ErrorCode =
    | 'INVALID_REQUEST'
    | 'MISSING_CREDENTIALS'
    | 'INVALID_API_KEY'
    | 'API_KEY_UNAUTHORIZED'
    | 'RATE_LIMITED'
    | 'SESSION_NOT_FOUND'
    | 'PROFILE_NOT_FOUND'
    | 'SESSION_BUSY'
    | 'APPROVAL_TIMEOUT'
    | 'APPROVAL_INVALID'
    | 'SERVER_ERROR'
    | 'MODULE_LOAD_FAILED'
    | 'PROVIDER_ERROR'
    | 'PROVIDER_UNAVAILABLE';

// ============================================================================
// Server Info Types
// ============================================================================

export interface HealthResponse {
    status: string;
    version: string;
    uptime_seconds: number;
    active_sessions: number;
}

export interface ServerInfoResponse {
    version: string;
    amplifier_core_version: string;
    capabilities: {
        streaming: boolean;
        extended_thinking: boolean;
        tool_use: boolean;
    };
    config: {
        host: string;
        port: number;
        profiles_path: string;
        collections_path: string;
    };
}
