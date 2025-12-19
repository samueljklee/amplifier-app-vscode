import * as vscode from 'vscode';

export type ConversationStatus = 'idle' | 'processing' | 'awaiting_approval' | 'error' | 'stopped';

export interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
}

export interface ConversationEntry {
    sessionId: string;
    title: string;
    profile: string;
    createdAt: string;
    lastActivity: string;
    status: ConversationStatus;
    messageCount: number;
    firstMessage?: string;
    messages: ConversationMessage[];
}

const STORAGE_KEY = 'amplifier.conversations';
type StoredConversation = Partial<ConversationEntry> & Record<string, any>;

export class ConversationHistoryManager {
    private conversations: ConversationEntry[] = [];
    private activeSessionId: string | null = null;
    private _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChange = this._onDidChange.event;

    constructor(private context: vscode.ExtensionContext) {
        this.load();
    }

    setActiveSession(sessionId: string | null): void {
        this.activeSessionId = sessionId;
    }

    getAll(): ConversationEntry[] {
        return [...this.conversations];
    }

    get(sessionId: string): ConversationEntry | undefined {
        return this.conversations.find(c => c.sessionId === sessionId);
    }

    ensureConversation(sessionId: string, profile: string): ConversationEntry {
        let existing = this.get(sessionId);
        if (existing) {
            return existing;
        }

        const entry: ConversationEntry = {
            sessionId,
            profile,
            title: 'New conversation',
            createdAt: new Date().toISOString(),
            lastActivity: new Date().toISOString(),
            status: 'idle',
            messageCount: 0,
            messages: []
        };
        this.conversations.unshift(entry);
        this.save();
        this._onDidChange.fire();
        return entry;
    }

    update(sessionId: string, updates: Partial<Omit<ConversationEntry, 'sessionId' | 'messages'>>): void {
        const entry = this.get(sessionId);
        if (!entry) return;

        Object.assign(entry, updates);
        entry.lastActivity = new Date().toISOString();
        this.save();
        this._onDidChange.fire();
    }

    appendMessage(sessionId: string, message: ConversationMessage): void {
        const entry = this.get(sessionId);
        if (!entry) return;
        entry.messages.push(message);
        entry.messageCount = entry.messages.length;
        if (!entry.firstMessage && message.role === 'user') {
            entry.firstMessage = message.content.slice(0, 80);
            entry.title = this.deriveTitle(entry);
        }
        entry.lastActivity = message.timestamp;
        this.save();
        this._onDidChange.fire();
    }

    addManualConversation(entry: ConversationEntry): void {
        const existing = this.get(entry.sessionId);
        if (existing) {
            Object.assign(existing, entry);
        } else {
            this.conversations.unshift(entry);
        }
        this.save();
        this._onDidChange.fire();
    }

    delete(sessionId: string): void {
        this.conversations = this.conversations.filter(c => c.sessionId !== sessionId);
        this.save();
        this._onDidChange.fire();
    }

    clear(): void {
        this.conversations = [];
        this.save();
        this._onDidChange.fire();
    }

    private deriveTitle(entry: ConversationEntry): string {
        if (entry.firstMessage) {
            const cleaned = entry.firstMessage.trim().replace(/\s+/g, ' ');
            if (cleaned.length <= 50) {
                return cleaned;
            }
            const truncated = cleaned.substring(0, 50);
            const lastSpace = truncated.lastIndexOf(' ');
            return lastSpace > 20 ? `${truncated.substring(0, lastSpace)}…` : `${truncated}…`;
        }
        return `Conversation (${new Date(entry.createdAt).toLocaleDateString()})`;
    }

    private load(): void {
        const stored = this.context.workspaceState.get<StoredConversation[]>(STORAGE_KEY, []) ?? [];
        const cleaned: ConversationEntry[] = [];
        let changed = false;

        for (const entry of stored) {
            if (!entry || typeof entry.sessionId !== 'string' || entry.sessionId.trim().length === 0) {
                changed = true;
                continue;
            }

            const fallbackTimestamp = new Date().toISOString();
            const normalizedMessages: ConversationMessage[] = Array.isArray(entry.messages)
                ? entry.messages
                    .filter(msg => !!msg && typeof msg.content === 'string')
                    .map<ConversationMessage>(msg => ({
                        role: msg.role === 'assistant' ? 'assistant' : 'user',
                        content: msg.content,
                        timestamp: msg.timestamp || entry.lastActivity || entry.createdAt || fallbackTimestamp,
                    }))
                : [];

            const normalizedEntry: ConversationEntry = {
                sessionId: entry.sessionId,
                profile: entry.profile || 'unknown',
                title: entry.title?.trim() || 'Conversation',
                createdAt: entry.createdAt || fallbackTimestamp,
                lastActivity: entry.lastActivity || entry.createdAt || normalizedMessages[normalizedMessages.length - 1]?.timestamp || fallbackTimestamp,
                status: entry.status || 'idle',
                messageCount: normalizedMessages.length,
                firstMessage: entry.firstMessage,
                messages: normalizedMessages,
            };

            if (!normalizedEntry.firstMessage && normalizedMessages.length > 0) {
                const firstUserMessage = normalizedMessages.find(m => m.role === 'user');
                normalizedEntry.firstMessage = firstUserMessage?.content?.slice(0, 80);
                normalizedEntry.title = this.deriveTitle(normalizedEntry);
            }

            cleaned.push(normalizedEntry);

            if (normalizedEntry.messageCount !== (entry.messageCount ?? 0)
                || normalizedEntry.lastActivity !== entry.lastActivity
                || normalizedEntry.createdAt !== entry.createdAt
                || normalizedEntry.title !== entry.title
            ) {
                changed = true;
            }
        }

        this.conversations = cleaned;

        if (changed || cleaned.length !== stored.length) {
            this.save();
        }
    }

    private save(): void {
        this.context.workspaceState.update(STORAGE_KEY, this.conversations);
    }
}
