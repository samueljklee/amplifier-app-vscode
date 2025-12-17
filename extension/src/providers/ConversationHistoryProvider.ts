/**
 * ConversationHistoryProvider - Manages conversation history in a TreeView
 * 
 * Displays past conversations with metadata (title, date, status)
 * Allows loading/resuming previous sessions
 * Persists conversation metadata to workspace state
 */

import * as vscode from 'vscode';
import { AmplifierClient } from '../client/AmplifierClient';
import { SessionInfo, SessionStatus } from '../client/types';

/**
 * Conversation metadata stored in workspace state
 */
export interface ConversationMetadata {
    session_id: string;
    title: string;  // Auto-generated from first message or user-defined
    created_at: string;
    last_activity: string;
    status: SessionStatus;
    profile: string;
    message_count: number;
    first_message?: string; // Preview of first user message
}

/**
 * Tree item for conversation display
 */
class ConversationTreeItem extends vscode.TreeItem {
    constructor(
        public readonly conversation: ConversationMetadata,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(conversation.title, collapsibleState);
        
        // Set description (shows date/status)
        const date = new Date(conversation.created_at);
        const dateStr = this.formatRelativeTime(date);
        this.description = `${dateStr} • ${conversation.status}`;
        
        // Set tooltip with full details
        this.tooltip = this.buildTooltip(conversation);
        
        // Set icon based on status
        this.iconPath = this.getIconForStatus(conversation.status);
        
        // Set context value for context menu commands
        this.contextValue = 'conversation';
        
        // Make clickable
        this.command = {
            command: 'amplifier.loadConversation',
            title: 'Load Conversation',
            arguments: [conversation.session_id]
        };
    }
    
    private formatRelativeTime(date: Date): string {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) { return 'just now'; }
        if (diffMins < 60) { return `${diffMins}m ago`; }
        if (diffHours < 24) { return `${diffHours}h ago`; }
        if (diffDays < 7) { return `${diffDays}d ago`; }
        
        // Format as date for older items
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
    
    private buildTooltip(conv: ConversationMetadata): vscode.MarkdownString {
        const tooltip = new vscode.MarkdownString();
        tooltip.appendMarkdown(`**${conv.title}**\n\n`);
        tooltip.appendMarkdown(`- **Session ID**: \`${conv.session_id}\`\n`);
        tooltip.appendMarkdown(`- **Status**: ${conv.status}\n`);
        tooltip.appendMarkdown(`- **Profile**: ${conv.profile}\n`);
        tooltip.appendMarkdown(`- **Created**: ${new Date(conv.created_at).toLocaleString()}\n`);
        tooltip.appendMarkdown(`- **Messages**: ${conv.message_count}\n`);
        
        if (conv.first_message) {
            tooltip.appendMarkdown(`\n*"${conv.first_message}"*`);
        }
        
        return tooltip;
    }
    
    private getIconForStatus(status: SessionStatus): vscode.ThemeIcon {
        switch (status) {
            case 'idle': return new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('charts.blue'));
            case 'processing': return new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.yellow'));
            case 'awaiting_approval': return new vscode.ThemeIcon('question', new vscode.ThemeColor('charts.orange'));
            case 'error': return new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
            case 'stopped': return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('disabledForeground'));
            default: return new vscode.ThemeIcon('circle-outline');
        }
    }
}

/**
 * TreeDataProvider for conversation history
 */
export class ConversationHistoryProvider implements vscode.TreeDataProvider<ConversationTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ConversationTreeItem | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    
    private _conversations: ConversationMetadata[] = [];
    private _currentSessionId: string | null = null;
    
    constructor(
        private readonly _context: vscode.ExtensionContext,
        private readonly _client: AmplifierClient
    ) {
        // Load conversations from workspace state
        this.loadConversations();
    }
    
    /**
     * Get tree item for a conversation
     */
    getTreeItem(element: ConversationTreeItem): vscode.TreeItem {
        return element;
    }
    
    /**
     * Get children (top-level: all conversations, no nesting for v1)
     */
    async getChildren(element?: ConversationTreeItem): Promise<ConversationTreeItem[]> {
        if (element) {
            // No children for individual conversations in v1
            return [];
        }
        
        // Return sorted conversations (most recent first)
        const sorted = [...this._conversations].sort((a, b) => {
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        
        return sorted.map(conv => {
            const item = new ConversationTreeItem(conv, vscode.TreeItemCollapsibleState.None);
            
            // Highlight current session
            if (conv.session_id === this._currentSessionId) {
                item.description = `${item.description} • [Active]`;
            }
            
            return item;
        });
    }
    
    /**
     * Refresh the tree view
     */
    refresh(): void {
        this.loadConversations();
        this._onDidChangeTreeData.fire(undefined);
    }
    
    /**
     * Add a new conversation to history
     */
    addConversation(sessionId: string, profile: string, firstMessage?: string): void {
        // Generate title from first message or use default
        const title = this.generateTitle(firstMessage, profile);
        
        const conversation: ConversationMetadata = {
            session_id: sessionId,
            title,
            created_at: new Date().toISOString(),
            last_activity: new Date().toISOString(),
            status: 'idle',
            profile,
            message_count: firstMessage ? 1 : 0,
            first_message: firstMessage ? this.truncateMessage(firstMessage) : undefined
        };
        
        // Add to beginning of list
        this._conversations.unshift(conversation);
        
        // Persist and refresh
        this.saveConversations();
        this.refresh();
    }
    
    /**
     * Update conversation metadata
     */
    updateConversation(sessionId: string, updates: Partial<ConversationMetadata>): void {
        const conv = this._conversations.find(c => c.session_id === sessionId);
        if (conv) {
            Object.assign(conv, updates);
            conv.last_activity = new Date().toISOString();
            this.saveConversations();
            this.refresh();
        }
    }
    
    /**
     * Remove a conversation from history
     */
    removeConversation(sessionId: string): void {
        this._conversations = this._conversations.filter(c => c.session_id !== sessionId);
        this.saveConversations();
        this.refresh();
    }
    
    /**
     * Set the current active session
     */
    setCurrentSession(sessionId: string | null): void {
        this._currentSessionId = sessionId;
        this.refresh();
    }
    
    /**
     * Get conversation by session ID
     */
    getConversation(sessionId: string): ConversationMetadata | undefined {
        return this._conversations.find(c => c.session_id === sessionId);
    }
    
    /**
     * Sync with server sessions (fetch latest status)
     */
    async syncWithServer(): Promise<void> {
        try {
            // Fetch current sessions from server
            const response = await this._client.listSessions();
            const serverSessions = new Map(response.sessions.map(s => [s.session_id, s]));
            
            // Update status for existing conversations
            for (const conv of this._conversations) {
                const serverSession = serverSessions.get(conv.session_id);
                if (serverSession) {
                    conv.status = serverSession.status;
                    conv.last_activity = new Date().toISOString();
                }
            }
            
            this.saveConversations();
            this.refresh();
        } catch (error) {
            console.error('[ConversationHistoryProvider] Failed to sync with server:', error);
        }
    }
    
    /**
     * Load conversations from workspace state
     */
    private loadConversations(): void {
        const stored = this._context.workspaceState.get<ConversationMetadata[]>('amplifier.conversations', []);
        this._conversations = stored;
    }
    
    /**
     * Save conversations to workspace state
     */
    private saveConversations(): void {
        this._context.workspaceState.update('amplifier.conversations', this._conversations);
    }
    
    /**
     * Generate a conversation title from first message
     */
    private generateTitle(firstMessage: string | undefined, profile: string): string {
        if (!firstMessage) {
            return `New ${profile} conversation`;
        }
        
        // Clean and truncate message for title
        const cleaned = firstMessage.trim().replace(/\s+/g, ' ');
        const maxLength = 50;
        
        if (cleaned.length <= maxLength) {
            return cleaned;
        }
        
        // Truncate at word boundary
        const truncated = cleaned.substring(0, maxLength);
        const lastSpace = truncated.lastIndexOf(' ');
        
        if (lastSpace > maxLength * 0.6) {
            return truncated.substring(0, lastSpace) + '...';
        }
        
        return truncated + '...';
    }
    
    /**
     * Truncate message for preview (tooltip)
     */
    private truncateMessage(message: string): string {
        const maxLength = 100;
        const cleaned = message.trim().replace(/\s+/g, ' ');
        
        if (cleaned.length <= maxLength) {
            return cleaned;
        }
        
        return cleaned.substring(0, maxLength) + '...';
    }
    
    /**
     * Clear all conversations (with confirmation)
     */
    async clearAll(): Promise<void> {
        const choice = await vscode.window.showWarningMessage(
            'Clear all conversation history?',
            { modal: true },
            'Clear All'
        );
        
        if (choice === 'Clear All') {
            this._conversations = [];
            this.saveConversations();
            this.refresh();
            vscode.window.showInformationMessage('Conversation history cleared');
        }
    }
}
