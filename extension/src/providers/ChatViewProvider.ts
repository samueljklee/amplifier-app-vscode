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
     * Show keyboard shortcuts panel
     */
    public showKeyboardShortcuts(): void {
        console.log('[ChatViewProvider] Showing keyboard shortcuts');
        if (!this._view) {
            vscode.window.showWarningMessage('Please open the Amplifier chat panel first.');
            return;
        }
        
        // Focus the chat view and send message to show shortcuts
        vscode.commands.executeCommand('amplifier.chatView.focus');
        this._postMessage({ type: 'showKeyboardShortcuts' });
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
            
            case 'openFile':
                await this._openFile(message.path, message.workspaceRoot);
                break;
            
            // Note: exportConversation feature is part of P5.6.9 (not implemented yet)
            // case 'exportConversation':
            //     await this._exportConversation(message.data);
            //     break;
            
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
     * Export conversation to file
     */
    private async _exportConversation(data: any): Promise<void> {
        try {
            const format = await vscode.window.showQuickPick(
                [
                    { label: 'JSON', description: 'Machine-readable format with full metadata', value: 'json' },
                    { label: 'Markdown', description: 'Human-readable format', value: 'md' }
                ],
                { placeHolder: 'Select export format', title: 'Export Conversation' }
            );
            if (!format) return;

            const now = new Date();
            const timestamp = now.toISOString().replace(/:/g, '-').replace(/\..+/, '').replace('T', '-');
            const defaultFilename = `amplifier-conversation-${timestamp}.${format.value}`;

            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(defaultFilename),
                filters: format.value === 'json' ? { 'JSON': ['json'] } : { 'Markdown': ['md', 'markdown'] }
            });
            if (!uri) return;

            const content = format.value === 'json' ? this._formatAsJSON(data) : this._formatAsMarkdown(data);
            await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
            vscode.window.showInformationMessage(`Conversation exported to ${uri.fsPath}`);
        } catch (error: any) {
            console.error('[ChatViewProvider] Export failed:', error);
            vscode.window.showErrorMessage(`Failed to export conversation: ${error.message}`);
        }
    }

    private _formatAsJSON(data: any): string {
        return JSON.stringify({
            session_id: data.sessionId || 'unknown',
            exported_at: new Date().toISOString(),
            profile: data.profile || 'unknown',
            workspace_root: data.workspaceRoot || null,
            messages: data.messages || [],
            metadata: { total_tokens: data.totalTokens || { input: 0, output: 0 } }
        }, null, 2);
    }

    private _formatAsMarkdown(data: any): string {
        const lines: string[] = [];
        lines.push('# Amplifier Conversation Export\n');
        const exportDate = new Date();
        lines.push(`**Exported:** ${exportDate.toLocaleString()}`);
        lines.push(`**Profile:** ${data.profile || 'unknown'}`);
        if (data.workspaceRoot) lines.push(`**Workspace:** ${data.workspaceRoot}`);
        if (data.sessionId) lines.push(`**Session ID:** ${data.sessionId}`);
        lines.push('\n---\n');

        const messages = data.messages || [];
        messages.forEach((msg: any) => {
            const timestamp = msg.timestamp ? new Date(parseInt(msg.timestamp)) : new Date();
            lines.push(`## ${msg.role === 'user' ? 'User' : 'Assistant'} (${timestamp.toLocaleTimeString()})\n`);
            lines.push(msg.content || '');
            lines.push('');
            if (msg.thinking && msg.thinking.trim()) {
                lines.push('### Thinking\n');
                lines.push(msg.thinking);
                lines.push('');
            }
            if (msg.tools && msg.tools.length > 0) {
                lines.push('### Tools Used\n');
                msg.tools.forEach((tool: any) => {
                    lines.push(`- **${tool.name}**`);
                    if (tool.input) lines.push(`  - Input: \`${tool.input}\``);
                    if (tool.output) {
                        const preview = tool.output.substring(0, 100);
                        lines.push(`  - Output: ${preview}${tool.output.length > 100 ? '...' : ''}`);
                    }
                });
                lines.push('');
            }
            lines.push('---\n');
        });

        const tokens = data.totalTokens || { input: 0, output: 0 };
        lines.push('## Metadata\n');
        lines.push(`- **Total Messages:** ${messages.length}`);
        lines.push(`- **Total Tokens:** ${(tokens.input + tokens.output).toLocaleString()} (${tokens.input.toLocaleString()} input, ${tokens.output.toLocaleString()} output)`);
        lines.push('\n---\n');
        lines.push('*Exported from [Amplifier VS Code Extension](https://github.com/microsoft/amplifier)*');
        return lines.join('\n');
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
                <button id="welcome-shortcuts-btn" class="secondary-link shortcuts-link" aria-label="View keyboard shortcuts">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                        <path d="M13 3H3a1 1 0 00-1 1v8a1 1 0 001 1h10a1 1 0 001-1V4a1 1 0 00-1-1zM3 2a2 2 0 00-2 2v8a2 2 0 002 2h10a2 2 0 002-2V4a2 2 0 00-2-2H3z"/>
                        <path d="M4.5 6.5h1v1h-1v-1zm2 0h1v1h-1v-1zm2 0h1v1h-1v-1zm2 0h1v1h-1v-1zm-6 2h1v1h-1v-1zm2 0h5v1h-5v-1z"/>
                    </svg>
                    Keyboard Shortcuts
                </button>
            </div>
        </div>
    </div>

    <!-- Keyboard Shortcuts Panel (overlay) -->
    <div id="shortcuts-panel" class="shortcuts-panel hidden" role="dialog" aria-labelledby="shortcuts-title" aria-modal="true">
        <div class="shortcuts-content">
            <div class="shortcuts-header">
                <h2 id="shortcuts-title">Keyboard Shortcuts</h2>
                <button id="shortcuts-close" class="icon-button" aria-label="Close shortcuts panel">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                        <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                    </svg>
                </button>
            </div>
            
            <div class="shortcuts-body">
                <section class="shortcuts-section">
                    <h3>General</h3>
                    <div class="shortcut-list">
                        <div class="shortcut-item">
                            <span class="shortcut-description">Open Amplifier chat</span>
                            <span class="shortcut-keys">
                                <kbd class="mac-only">Cmd</kbd><kbd class="win-linux-only">Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd>
                            </span>
                        </div>
                        <div class="shortcut-item">
                            <span class="shortcut-description">Show keyboard shortcuts</span>
                            <span class="shortcut-keys">
                                <kbd class="mac-only">Cmd</kbd><kbd class="win-linux-only">Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> → "Amplifier: Show Keyboard Shortcuts"
                            </span>
                        </div>
                        <div class="shortcut-item">
                            <span class="shortcut-description">Set API key</span>
                            <span class="shortcut-keys">
                                <kbd class="mac-only">Cmd</kbd><kbd class="win-linux-only">Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> → "Amplifier: Set API Key"
                            </span>
                        </div>
                    </div>
                </section>

                <section class="shortcuts-section">
                    <h3>Chat Interface</h3>
                    <div class="shortcut-list">
                        <div class="shortcut-item">
                            <span class="shortcut-description">Send message</span>
                            <span class="shortcut-keys">
                                <kbd class="mac-only">Cmd</kbd><kbd class="win-linux-only">Ctrl</kbd>+<kbd>Enter</kbd>
                            </span>
                        </div>
                        <div class="shortcut-item">
                            <span class="shortcut-description">New line in message</span>
                            <span class="shortcut-keys">
                                <kbd>Shift</kbd>+<kbd>Enter</kbd>
                            </span>
                        </div>
                        <div class="shortcut-item">
                            <span class="shortcut-description">Clear input</span>
                            <span class="shortcut-keys">
                                <kbd>Esc</kbd>
                            </span>
                        </div>
                        <div class="shortcut-item">
                            <span class="shortcut-description">Focus message input</span>
                            <span class="shortcut-keys">
                                <kbd>Tab</kbd> (when in chat)
                            </span>
                        </div>
                    </div>
                </section>

                <section class="shortcuts-section">
                    <h3>Approvals</h3>
                    <div class="shortcut-list">
                        <div class="shortcut-item">
                            <span class="shortcut-description">Allow action</span>
                            <span class="shortcut-keys">
                                <kbd>Enter</kbd>
                            </span>
                        </div>
                        <div class="shortcut-item">
                            <span class="shortcut-description">Deny action</span>
                            <span class="shortcut-keys">
                                <kbd>Esc</kbd>
                            </span>
                        </div>
                    </div>
                </section>

                <section class="shortcuts-section">
                    <h3>Code Actions</h3>
                    <div class="shortcut-list">
                        <div class="shortcut-item">
                            <span class="shortcut-description">Explain selection</span>
                            <span class="shortcut-keys">
                                <kbd class="mac-only">Cmd</kbd><kbd class="win-linux-only">Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> → "Amplifier: Explain Selection"
                            </span>
                        </div>
                        <div class="shortcut-item">
                            <span class="shortcut-description">Improve selection</span>
                            <span class="shortcut-keys">
                                <kbd class="mac-only">Cmd</kbd><kbd class="win-linux-only">Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> → "Amplifier: Improve Selection"
                            </span>
                        </div>
                    </div>
                </section>

                <div class="shortcuts-footer">
                    <p class="shortcuts-hint">
                        <strong>Tip:</strong> You can customize keyboard shortcuts in VS Code settings 
                        (<kbd class="mac-only">Cmd</kbd><kbd class="win-linux-only">Ctrl</kbd>+<kbd>K</kbd> <kbd class="mac-only">Cmd</kbd><kbd class="win-linux-only">Ctrl</kbd>+<kbd>S</kbd>)
                    </p>
                </div>
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
     * Load a previous conversation by session ID
     */
    public async loadConversation(sessionId: string): Promise<void> {
        console.log('[ChatViewProvider] Loading conversation:', sessionId);

        try {
            // Check if session still exists on server
            const status = await this._client.getSessionStatus(sessionId);
            
            // Stop current session if active
            if (this._sessionId && this._sessionId !== sessionId) {
                console.log('[ChatViewProvider] Stopping current session before loading:', this._sessionId);
                await this._stopSession();
            }

            // Set new session ID
            this._sessionId = sessionId;
            this._firstMessageInSession = null; // Clear first message tracker

            // Subscribe to events for this session
            this._subscribeToEvents();

            // Update conversation history
            if (this.conversationHistoryProvider) {
                this.conversationHistoryProvider.setCurrentSession(sessionId);
                this.conversationHistoryProvider.updateConversation(sessionId, {
                    status: status.status,
                    last_activity: status.last_activity
                });
            }

            // Notify webview
            this._postMessage({
                type: 'sessionLoaded',
                sessionId: sessionId,
                profile: status.profile,
                messageCount: status.message_count,
                tokenUsage: status.token_usage
            });

            // Focus chat view
            if (this._view) {
                this._view.show?.(true);
            }

            vscode.window.showInformationMessage(`Loaded conversation: ${sessionId.substring(0, 8)}...`);

        } catch (error: any) {
            console.error('[ChatViewProvider] Failed to load conversation:', error);
            
            // Session no longer exists on server
            if (error.message?.includes('404') || error.message?.includes('SESSION_NOT_FOUND')) {
                vscode.window.showWarningMessage(
                    'This conversation no longer exists on the server (it may have been cleaned up). Starting a new session instead.',
                    'Start New Session'
                ).then(selection => {
                    if (selection === 'Start New Session') {
                        this._sessionId = null;
                        this._checkApiKeyAndInitialize();
                    }
                });

                // Remove from history
                if (this.conversationHistoryProvider) {
                    this.conversationHistoryProvider.removeConversation(sessionId);
                }
            } else {
                vscode.window.showErrorMessage(`Failed to load conversation: ${error.message}`);
            }
        }
    }

    /**
     * Open a file in VS Code editor
     */
    private async _openFile(filePath: string, workspaceRoot?: string): Promise<void> {
        try {
            console.log('[ChatViewProvider] Opening file:', filePath, 'from workspace:', workspaceRoot);
            
            let fileUri: vscode.Uri;
            
            // If path is absolute, use it directly
            if (path.isAbsolute(filePath)) {
                fileUri = vscode.Uri.file(filePath);
            } 
            // If workspace root is available, resolve relative to workspace
            else if (workspaceRoot) {
                const absolutePath = path.join(workspaceRoot, filePath);
                fileUri = vscode.Uri.file(absolutePath);
            }
            // Fall back to resolving against first workspace folder
            else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                const workspaceFolder = vscode.workspace.workspaceFolders[0];
                fileUri = vscode.Uri.joinPath(workspaceFolder.uri, filePath);
            }
            // No workspace, try to resolve as absolute
            else {
                fileUri = vscode.Uri.file(filePath);
            }
            
            // Check if file exists
            try {
                await vscode.workspace.fs.stat(fileUri);
            } catch (error) {
                // File doesn't exist, show error
                vscode.window.showWarningMessage(
                    `File not found: ${filePath}`,
                    'Copy Path'
                ).then(selection => {
                    if (selection === 'Copy Path') {
                        vscode.env.clipboard.writeText(filePath);
                    }
                });
                return;
            }
            
            // Open the file
            const document = await vscode.workspace.openTextDocument(fileUri);
            await vscode.window.showTextDocument(document, {
                preview: false, // Open in non-preview mode so it stays open
                preserveFocus: false // Focus the editor
            });
            
            console.log('[ChatViewProvider] Successfully opened file:', fileUri.fsPath);
            
        } catch (error: any) {
            console.error('[ChatViewProvider] Failed to open file:', error);
            vscode.window.showErrorMessage(`Failed to open file: ${error.message}`);
        }
    }

    /**
     * Generate a cryptographically secure nonce for CSP
     */
    private _getNonce(): string {
        return crypto.randomBytes(16).toString('base64');
    }
}
