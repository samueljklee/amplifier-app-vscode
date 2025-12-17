/**
 * ChatViewProvider - Manages the chat panel webview
 * 
 * Implements WebviewViewProvider to create a sidebar chat interface
 * that communicates with the Amplifier backend server.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import { AmplifierClient } from '../client/AmplifierClient';
import { EventStreamManager } from '../client/EventStream';
import { CredentialsManager } from '../services/CredentialsManager';
import { ContextGatherer } from '../services/ContextGatherer';
import { ApprovalHandler } from '../services/ApprovalHandler';
import {
    CreateSessionRequest,
    WorkspaceContext,
    ContentBlockDeltaEvent,
    ThinkingDeltaEvent,
    ToolPreEvent,
    ToolPostEvent,
    ApprovalRequiredEvent,
    PromptCompleteEvent,
} from '../client/types';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _sessionId: string | null = null;
    private _client: AmplifierClient;
    private _eventStream: EventStreamManager;
    private _credentialsManager: CredentialsManager;
    private _contextGatherer: ContextGatherer;
    private _approvalHandler: ApprovalHandler;
    private _firstMessageInSession: string | null = null;
    
    // Reference to conversation history provider (set by extension.ts)
    public conversationHistoryProvider?: any;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        client: AmplifierClient,
        eventStream: EventStreamManager,
        credentialsManager: CredentialsManager
    ) {
        this._client = client;
        this._eventStream = eventStream;
        this._credentialsManager = credentialsManager;
        this._contextGatherer = new ContextGatherer();
        this._approvalHandler = new ApprovalHandler(client, undefined);
    }

    /**
     * Called when the view is first created
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ): void | Thenable<void> {
        console.log('[ChatViewProvider] resolveWebviewView called');
        this._view = webviewView;

        // Update approval handler with webview reference
        (this._approvalHandler as any).webviewView = webviewView;

        // Configure webview
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'src', 'views', 'chat')
            ]
        };

        // Set HTML content
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        console.log('[Amplifier ChatViewProvider] Webview HTML set');

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            console.log('[Amplifier ChatViewProvider] Message from webview:', message);
            await this._handleWebviewMessage(message);
        });

        // Don't auto-initialize - wait for webview 'ready' message
        console.log('[Amplifier ChatViewProvider] Waiting for webview ready message');
    }

    /**
     * Check for API key and initialize UI state
     */
    private async _checkApiKeyAndInitialize(): Promise<void> {
        console.log('[Amplifier ChatViewProvider] Checking API key...');
        const hasApiKey = await this._credentialsManager.hasApiKey();
        
        if (!hasApiKey) {
            console.log('[Amplifier ChatViewProvider] No API key, showing welcome screen');
            this._postMessage({ type: 'showWelcome' });
        } else {
            console.log('[Amplifier ChatViewProvider] API key found, ready for chat');
            // Hide welcome, show chat interface (but don't start session yet)
            // Session will be created when user sends first message
            this._postMessage({ type: 'hideWelcome' });
        }
    }

    /**
     * Handle messages from the webview
     */
    private async _handleWebviewMessage(message: any): Promise<void> {
        console.log('[Amplifier ChatViewProvider] Received message:', message.type);
        
        switch (message.type) {
            case 'ready':
                // Webview is ready, send initial state
                await this._checkApiKeyAndInitialize();
                break;
            
            case 'sendMessage':
                await this._sendMessage(message.text);
                break;
            
            case 'setApiKey':
                const success = await this._credentialsManager.promptForApiKey();
                if (success) {
                    // Just hide welcome screen, don't auto-start session
                    // Session will be created when user sends first message
                    this._postMessage({ type: 'hideWelcome' });
                }
                break;
            
            case 'stopSession':
                await this._stopSession();
                break;
            
            case 'approvalDecision':
                await this._approvalHandler.handleApprovalDecision(
                    message.approvalId,
                    message.decision
                );
                break;
            
            default:
                console.warn(`Unknown message type: ${message.type}`);
        }
    }

    /**
     * Start a new session
     */
    private async _startSession(): Promise<void> {
        try {
            // Get API key
            const apiKey = await this._credentialsManager.getApiKey();
            if (!apiKey) {
                this._postMessage({ type: 'needsApiKey' });
                return;
            }

            // Gather workspace context
            const context = await this._gatherContext();

            // Get configuration
            const config = vscode.workspace.getConfiguration('amplifier');
            const profile = config.get<string>('profile', 'vscode-simple');
            const model = config.get<string>('model', 'claude-sonnet-4-5');

            // Create session request
            const request: CreateSessionRequest = {
                profile,
                model,
                credentials: {
                    anthropic_api_key: apiKey
                },
                context
            };

            // Create session
            const response = await this._client.createSession(request);
            this._sessionId = response.session_id;

            // Subscribe to events
            this._subscribeToEvents();

            // Notify webview
            console.log('[ChatViewProvider] Session started:', this._sessionId);
            this._postMessage({
                type: 'sessionStarted',
                sessionId: this._sessionId,
                profile: response.profile,
                workspaceRoot: context.workspace_root
            });

            // Add to conversation history (without first message yet - will be added when user sends message)
            if (this.conversationHistoryProvider) {
                this.conversationHistoryProvider.setCurrentSession(this._sessionId);
            }

        } catch (error: any) {
            console.error('[Amplifier ChatViewProvider] Failed to start session:', error);
            this._postMessage({
                type: 'error',
                error: error.message || 'Failed to start session',
                action: {
                    text: 'Retry',
                    command: 'setApiKey'
                }
            });
        }
    }

    /**
     * Stop the current session
     */
    private async _stopSession(): Promise<void> {
        if (!this._sessionId) {
            return;
        }

        try {
            await this._client.deleteSession(this._sessionId);
            this._eventStream.unsubscribe();
            this._sessionId = null;

            this._postMessage({ type: 'sessionStopped' });
        } catch (error: any) {
            console.error('[Amplifier ChatViewProvider] Failed to stop session:', error);
        }
    }

    /**
     * Send a message/prompt to the session
     */
    private async _sendMessage(text: string): Promise<void> {
        const isNewSession = !this._sessionId;
        
        if (!this._sessionId) {
            await this._startSession();
            if (!this._sessionId) {
                return; // Failed to start
            }
        }

        try {
            // Track first message for conversation history
            if (isNewSession && !this._firstMessageInSession) {
                this._firstMessageInSession = text;
            }

            // 🆕 Gather fresh context on every message
            console.log('[ChatViewProvider] Gathering fresh context for message...');
            const freshContext = await this._gatherContext();

            await this._client.submitPrompt(this._sessionId, {
                prompt: text,
                context_update: freshContext  // Include updated context with each message
            });

            // User message is already added by webview, no need to duplicate
            console.log('[ChatViewProvider] Prompt submitted:', text.substring(0, 50));

            // Add to conversation history after first successful message
            if (isNewSession && this.conversationHistoryProvider) {
                const config = vscode.workspace.getConfiguration('amplifier');
                const profile = config.get<string>('profile', 'vscode-simple');
                this.conversationHistoryProvider.addConversation(this._sessionId, profile, this._firstMessageInSession);
            } else if (this.conversationHistoryProvider) {
                // Update message count
                this.conversationHistoryProvider.updateConversation(this._sessionId, {
                    message_count: (this.conversationHistoryProvider.getConversation(this._sessionId)?.message_count || 0) + 1
                });
            }

        } catch (error: any) {
            console.error('[Amplifier ChatViewProvider] Failed to send message:', error);
            
            // Handle 404 - session was lost (server restart, etc.)
            if (error.message?.includes('404')) {
                console.log('[ChatViewProvider] Session not found (404), recreating session...');
                this._sessionId = null; // Clear invalid session ID
                
                // Retry with new session
                await this._startSession();
                if (this._sessionId) {
                    // Try sending the message again with the new session
                    try {
                        const freshContext = await this._gatherContext();
                        await this._client.submitPrompt(this._sessionId, {
                            prompt: text,
                            context_update: freshContext
                        });
                        console.log('[ChatViewProvider] Message sent successfully after session recreation');
                        return; // Success
                    } catch (retryError: any) {
                        console.error('[ChatViewProvider] Failed even after recreating session:', retryError);
                    }
                }
            }
            
            // Show error to user
            this._postMessage({
                type: 'error',
                message: error.message || 'Failed to send message',
                code: error.code
            });
        }
    }

    /**
     * Submit approval decision
     */
    private async _submitApproval(decision: string): Promise<void> {
        if (!this._sessionId) {
            return;
        }

        try {
            await this._client.submitApproval(this._sessionId, { decision });
        } catch (error: any) {
            console.error('[Amplifier ChatViewProvider] Failed to submit approval:', error);
            this._postMessage({
                type: 'error',
                message: error.message || 'Failed to submit approval'
            });
        }
    }

    /**
     * Subscribe to session events
     */
    private _subscribeToEvents(): void {
        if (!this._sessionId) {
            return;
        }

        this._eventStream.subscribe(this._sessionId, {
            onConnected: () => {
                this._postMessage({ type: 'connected' });
            },

            onReconnecting: (attempt, delay) => {
                this._postMessage({
                    type: 'reconnecting',
                    attempt,
                    delay
                });
            },

            onContentDelta: (data: ContentBlockDeltaEvent) => {
                this._postMessage({
                    type: 'contentDelta',
                    data: {
                        delta: data.delta,
                        blockIndex: data.block_index
                    }
                });
            },

            onThinkingDelta: (data: ThinkingDeltaEvent) => {
                this._postMessage({
                    type: 'thinkingDelta',
                    data: {
                        delta: data.delta
                    }
                });
            },

            onThinkingStart: () => {
                this._postMessage({ type: 'thinkingStart', data: {} });
            },

            onThinkingEnd: () => {
                this._postMessage({ type: 'thinkingEnd', data: {} });
            },

            onToolStart: (data: ToolPreEvent) => {
                this._postMessage({
                    type: 'toolStart',
                    data: {
                        tool_name: data.tool_name,
                        operation: data.operation,
                        input: data.input
                    }
                });
            },

            onToolEnd: (data: ToolPostEvent) => {
                this._postMessage({
                    type: 'toolEnd',
                    data: {
                        tool_name: data.tool_name,
                        result: data.result,
                        duration_ms: data.duration_ms
                    }
                });
            },

            onApprovalRequired: async (data: ApprovalRequiredEvent) => {
                console.log('[ChatViewProvider] Approval required event received:', data);
                
                // Handle approval with inline webview UI
                if (this._sessionId) {
                    await this._approvalHandler.handleApprovalRequest(this._sessionId, data);
                }
            },

            onPromptComplete: (data: PromptCompleteEvent) => {
                this._postMessage({
                    type: 'promptComplete',
                    data: {
                        response: data.response,
                        token_usage: data.token_usage
                    }
                });
            },

            onError: (error: Error) => {
                this._postMessage({
                    type: 'error',
                    message: error.message
                });
            }
        });
    }

    /**
     * Gather workspace context using ContextGatherer
     */
    private async _gatherContext(): Promise<WorkspaceContext> {
        console.log('[ChatViewProvider] Gathering workspace context...');
        
        const context = await this._contextGatherer.gatherContext({
            includeOpenFiles: true,
            includeGitState: true,
            includeDiagnostics: true,
            includeSelection: true,
            maxOpenFiles: 5,      // Limit to 5 most relevant files
            maxDiagnostics: 20    // Limit to 20 most important diagnostics
        });

        // Debug logging to show what context was gathered
        console.log('[ChatViewProvider] ✅ Context gathered:');
        console.log('  📁 Workspace Root:', context.workspace_root || '(none)');
        console.log('  📄 Open Files:', context.open_files?.length || 0);
        context.open_files?.forEach((file, i) => {
            console.log(`     [${i}] ${file.path} (${file.language}) - ${file.content.length} chars`);
            if (file.cursor_position) {
                console.log(`         Cursor: line ${file.cursor_position.line}, char ${file.cursor_position.character}`);
            }
        });
        console.log('  🌿 Git State:', context.git_state ? '✓ Available' : '✗ Not available');
        if (context.git_state) {
            console.log(`     Branch: ${context.git_state.branch}`);
            console.log(`     Staged: ${context.git_state.staged_files.length} files`);
            console.log(`     Modified: ${context.git_state.modified_files.length} files`);
            console.log(`     Untracked: ${context.git_state.untracked_files.length} files`);
        }
        console.log('  ✂️  Selection:', context.selection ? '✓ Text selected' : '✗ No selection');
        if (context.selection) {
            const preview = context.selection.text.substring(0, 50);
            console.log(`     "${preview}${context.selection.text.length > 50 ? '...' : ''}"`);
            console.log(`     Range: ${context.selection.range.start.line}:${context.selection.range.start.character} - ${context.selection.range.end.line}:${context.selection.range.end.character}`);
        }
        console.log('  🔍 Diagnostics:', context.diagnostics?.length || 0, 'issues');
        context.diagnostics?.slice(0, 5).forEach((diag, i) => {
            console.log(`     [${i}] ${diag.severity}: ${diag.path}:${diag.range.start.line} - ${diag.message.substring(0, 60)}`);
        });
        if (context.diagnostics && context.diagnostics.length > 5) {
            console.log(`     ... and ${context.diagnostics.length - 5} more`);
        }

        return context;
    }

    /**
     * Post message to webview
     */
    private _postMessage(message: any): void {
        console.log('[ChatViewProvider] Posting message to webview:', message.type);
        if (!this._view) {
            console.warn('[ChatViewProvider] No view available to post message to');
            return;
        }
        this._view.webview.postMessage(message);
    }

    /**
     * Get HTML content for the webview
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Get paths to resources
        const stylesPath = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'src', 'views', 'chat', 'styles.css')
        );
        const scriptPath = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'src', 'views', 'chat', 'main.js')
        );

        // Generate nonce for CSP
        const nonce = this._getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' https://cdn.jsdelivr.net; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net; img-src ${webview.cspSource} https:; font-src ${webview.cspSource}; connect-src http://127.0.0.1:8765;">
    <link href="${stylesPath}" rel="stylesheet">
    <!-- Highlight.js theme (GitHub Dark/Light - adapts to VS Code theme) -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github-dark.min.css" media="(prefers-color-scheme: dark)" nonce="${nonce}">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github.min.css" media="(prefers-color-scheme: light)" nonce="${nonce}">
    <title>Amplifier Chat</title>
</head>
<body>
    <!-- Welcome screen (shown when no API key) -->
    <div id="welcome-screen" class="hidden">
        <div class="welcome-content">
            <div class="welcome-header">
                <h2>Welcome to Amplifier</h2>
                <p class="welcome-tagline">AI-powered development assistance, right in your editor</p>
            </div>

            <div class="welcome-section">
                <h3>Get Started</h3>
                <p>To use Amplifier, you need an Anthropic API key. Your key is stored securely in VS Code's credential storage and never leaves your machine.</p>

                <button id="set-api-key-btn" class="primary-button" aria-label="Set Anthropic API Key">
                    Set API Key
                </button>

                <p class="keyboard-hint">
                    Or press <kbd>Cmd+Shift+P</kbd> (or <kbd>Ctrl+Shift+P</kbd> on Windows/Linux) and type "Amplifier: Set API Key"
                </p>
            </div>

            <div class="welcome-section help-section">
                <h4>Don't have an API key yet?</h4>
                <ol class="setup-steps">
                    <li>Visit <a href="https://console.anthropic.com/settings/keys" aria-label="Get Anthropic API key">Anthropic Console</a></li>
                    <li>Create a new API key</li>
                    <li>Copy and paste it when prompted</li>
                </ol>
            </div>

            <div class="welcome-footer">
                <a href="https://github.com/microsoft/amplifier" class="secondary-link">Learn more about Amplifier</a>
            </div>
        </div>
    </div>

    <!-- Main chat interface -->
    <div id="chat-interface" class="hidden">
        <!-- Messages container -->
        <div id="messages" role="log" aria-live="polite" aria-label="Chat messages"></div>

        <!-- Approval bar (inline, above input) -->
        <div id="approval-bar" class="approval-bar" role="dialog" aria-labelledby="approval-prompt" aria-describedby="approval-context" hidden>
            <div class="approval-content">
                <!-- Row 1: Icon + Text Content -->
                <div class="approval-row approval-text-row">
                    <div class="approval-icon" aria-hidden="true">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 1a7 7 0 110 14A7 7 0 018 1zm0 10a1 1 0 100 2 1 1 0 000-2zm0-8a1 1 0 00-1 1v5a1 1 0 002 0V4a1 1 0 00-1-1z"/>
                        </svg>
                    </div>
                    <div class="approval-text">
                        <div id="approval-prompt" class="approval-prompt"></div>
                        <div id="approval-context" class="approval-context"></div>
                    </div>
                </div>
                
                <!-- Row 2: Actions + Countdown -->
                <div class="approval-row approval-actions-row">
                    <div class="approval-actions">
                        <button id="approval-always-allow" class="approval-button approval-button-always" type="button">
                            <span>Always</span>
                        </button>
                        <button id="approval-allow" class="approval-button approval-button-primary" type="button">
                            <span>Allow</span>
                        </button>
                        <button id="approval-deny" class="approval-button approval-button-secondary" type="button">
                            <span>Deny</span>
                        </button>
                    </div>
                    <div class="approval-timeout" aria-live="polite"></div>
                </div>
            </div>
        </div>

        <!-- Input area -->
        <div id="input-area">
            <div class="input-wrapper">
                <textarea 
                    id="prompt-input" 
                    placeholder="Ask Amplifier... (Cmd+Enter to send)"
                    rows="3"
                    aria-label="Message input"
                    maxlength="10000"
                ></textarea>
                <button 
                    id="send-btn" 
                    class="send-button" 
                    disabled
                    aria-label="Send message"
                >
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                        <path fill="currentColor" d="M1 3l14 5-14 5V9l10-1L1 7V3z"/>
                    </svg>
                    <span class="button-text">Send</span>
                </button>
            </div>
            <div class="input-footer">
                <div id="token-estimate" class="token-estimate hidden">
                    <span id="token-estimate-count">0</span> tokens (estimated)
                </div>
                <div class="input-hint">
                    <kbd>Cmd+Enter</kbd> to send • <kbd>Shift+Enter</kbd> for new line
                </div>
            </div>
        </div>

        <!-- Error display -->
        <div id="error-display" class="error-banner hidden" role="alert" aria-live="assertive">
            <svg class="error-icon" viewBox="0 0 16 16" aria-hidden="true">
                <path fill="currentColor" d="M8 1a7 7 0 110 14A7 7 0 018 1zM7 5v5h2V5H7zm0 6v2h2v-2H7z"/>
            </svg>
            <div class="error-content">
                <div id="error-message" class="error-message"></div>
                <div id="error-action" class="error-action hidden"></div>
            </div>
            <button id="error-dismiss" class="error-dismiss" aria-label="Dismiss error">
                <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path fill="currentColor" d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                </svg>
            </button>
        </div>

        <!-- Status bar - moved inside chat-interface -->
        <div class="status-bar" role="complementary" aria-label="Session status">
        <!-- Collapsed State (Default) -->
        <button
            class="status-bar__toggle"
            id="status-toggle"
            aria-expanded="false"
            aria-controls="status-details"
            title="Click to view session details">
            
            <!-- Status Indicator -->
            <span class="status-indicator" id="status-indicator" role="status" aria-live="polite">
                <svg class="status-icon" viewBox="0 0 12 12" aria-hidden="true">
                    <circle cx="6" cy="6" r="5" />
                </svg>
                <span class="status-text" id="status-text">Initializing...</span>
            </span>
            
            <!-- Truncated Info -->
            <span class="status-bar__info" id="status-info">
                <span class="workspace-name" id="workspace-name"></span>
                <span class="session-id-short" id="session-id-short"></span>
            </span>
            
            <!-- Expand Indicator -->
            <svg class="expand-icon" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 6 L8 10 L12 6" stroke="currentColor" stroke-width="2" fill="none" />
            </svg>
        </button>

        <!-- Expanded Details (Hidden by default) -->
        <div
            id="status-details"
            class="status-details"
            hidden>
            
            <!-- Workspace Section -->
            <div class="status-detail-item">
                <label class="status-detail-label" id="workspace-label">
                    Workspace
                </label>
                <div class="status-detail-value-group">
                    <code
                        class="status-detail-value"
                        id="workspace-path-full"
                        aria-labelledby="workspace-label">
                    </code>
                    <button
                        class="copy-button"
                        id="copy-workspace"
                        data-copy-target="workspace-path-full"
                        aria-label="Copy workspace path">
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                            <rect x="4" y="4" width="8" height="8" stroke="currentColor" stroke-width="1.5" fill="none"/>
                            <rect x="6" y="2" width="8" height="8" stroke="currentColor" stroke-width="1.5" fill="none"/>
                        </svg>
                    </button>
                </div>
            </div>

            <!-- Session ID Section -->
            <div class="status-detail-item">
                <label class="status-detail-label" id="session-label">
                    Session ID
                </label>
                <div class="status-detail-value-group">
                    <code
                        class="status-detail-value status-detail-value--monospace"
                        id="session-id-full"
                        aria-labelledby="session-label">
                    </code>
                    <button
                        class="copy-button"
                        id="copy-session"
                        data-copy-target="session-id-full"
                        aria-label="Copy session ID">
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                            <rect x="4" y="4" width="8" height="8" stroke="currentColor" stroke-width="1.5" fill="none"/>
                            <rect x="6" y="2" width="8" height="8" stroke="currentColor" stroke-width="1.5" fill="none"/>
                        </svg>
                    </button>
                </div>
            </div>

            <!-- Connection Status Section -->
            <div class="status-detail-item">
                <label class="status-detail-label" id="status-label">
                    Connection
                </label>
                <div class="status-detail-value-group">
                    <span
                        class="status-detail-value"
                        aria-labelledby="status-label">
                        <span class="status-indicator" id="status-indicator-detail">
                            <svg class="status-icon" viewBox="0 0 12 12" aria-hidden="true">
                                <circle cx="6" cy="6" r="5" />
                            </svg>
                            <span id="status-text-detail">Initializing...</span>
                        </span>
                    </span>
                </div>
            </div>
        </div>
    </div> <!-- End status bar -->
</div> <!-- End chat-interface -->

    <!-- Load marked.js for Markdown rendering -->
    <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/marked@11.0.0/marked.min.js"></script>
    <!-- Load highlight.js for syntax highlighting -->
    <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/highlight.min.js"></script>
    <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/languages/python.min.js"></script>
    <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/languages/typescript.min.js"></script>
    <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/languages/javascript.min.js"></script>
    <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/languages/bash.min.js"></script>
    <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/languages/json.min.js"></script>
    <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/languages/yaml.min.js"></script>
    <!-- Load main.js after libraries are loaded -->
    <script nonce="${nonce}" src="${scriptPath}"></script>
</body>
</html>`;
    }

    /**
     * Generate a cryptographically secure nonce for CSP
     */
    private _getNonce(): string {
        return crypto.randomBytes(16).toString('base64');
    }
}
