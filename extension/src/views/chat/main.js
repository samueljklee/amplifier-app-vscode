/**
 * Chat Webview Script
 * Runs inside the VS Code webview to handle UI interactions
 */

// VS Code API (injected by VS Code)
const vscode = acquireVsCodeApi();

// Configure marked.js for secure Markdown rendering
if (typeof marked !== 'undefined') {
    marked.setOptions({
        breaks: true,          // GitHub-style line breaks
        gfm: true,             // GitHub Flavored Markdown
        sanitize: false,       // We'll use DOMPurify-like approach
        highlight: function(code, lang) {
            // Use highlight.js if available
            if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
                try {
                    return hljs.highlight(code, { language: lang }).value;
                } catch (err) {
                    console.warn('Highlight.js error:', err);
                }
            }
            return code;
        }
    });
}

/**
 * Render Markdown to HTML safely
 * @param {string} markdown - Markdown text to render
 * @returns {string} - Safe HTML string
 */
function renderMarkdown(markdown) {
    if (typeof marked === 'undefined') {
        // Fallback if marked.js didn't load
        return escapeHtml(markdown);
    }
    
    try {
        // Parse markdown to HTML
        let html = marked.parse(markdown);
        
        // Basic XSS protection: remove script tags and event handlers
        html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        html = html.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
        html = html.replace(/javascript:/gi, '');
        
        return html;
    } catch (err) {
        console.error('Markdown parsing error:', err);
        return escapeHtml(markdown);
    }
}

/**
 * Escape HTML for safe display
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Markdown rendering with syntax highlighting
// Note: marked and hljs are loaded via CDN in the HTML
const marked = window.marked;
const hljs = window.hljs;

// Configure marked to use highlight.js
if (marked && hljs) {
    marked.setOptions({
        highlight: function(code, lang) {
            if (lang && hljs.getLanguage(lang)) {
                try {
                    return hljs.highlight(code, { language: lang }).value;
                } catch (err) {
                    console.warn('Highlight.js error:', err);
                }
            }
            // Auto-detect if no language specified
            try {
                return hljs.highlightAuto(code, ['python', 'typescript', 'javascript', 'bash', 'json', 'yaml', 'markdown']).value;
            } catch (err) {
                console.warn('Highlight.js auto-detect error:', err);
                return code; // Fallback to plain text
            }
        },
        breaks: true, // Convert \n to <br>
        gfm: true, // GitHub Flavored Markdown
    });
}

// ===== SEARCH MANAGER CLASS =====
class SearchManager {
    constructor() {
        this.searchBar = document.getElementById('search-bar');
        this.searchInput = document.getElementById('search-input');
        this.searchClear = document.getElementById('search-clear');
        this.searchPrev = document.getElementById('search-prev');
        this.searchNext = document.getElementById('search-next');
        this.searchClose = document.getElementById('search-close');
        this.searchCount = document.getElementById('search-count-text');
        this.caseToggle = document.getElementById('search-case-toggle');
        
        this.matches = [];
        this.currentMatchIndex = -1;
        this.caseSensitive = false;
        this.debounceTimer = null;
        
        this.init();
    }

    init() {
        // Input handling with debounce
        this.searchInput.addEventListener('input', () => {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => this.performSearch(), 300);
        });
        
        // Clear button
        this.searchClear.addEventListener('click', () => {
            this.searchInput.value = '';
            this.clearSearch();
            this.searchInput.focus();
        });
        
        // Navigation buttons
        this.searchPrev.addEventListener('click', () => this.navigateToPrevious());
        this.searchNext.addEventListener('click', () => this.navigateToNext());
        
        // Close button
        this.searchClose.addEventListener('click', () => this.hide());
        
        // Case sensitivity toggle
        this.caseToggle.addEventListener('click', () => {
            this.caseSensitive = !this.caseSensitive;
            this.caseToggle.setAttribute('aria-pressed', this.caseSensitive.toString());
            this.performSearch();
        });
        
        // Keyboard shortcuts within search bar
        this.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) {
                    this.navigateToPrevious();
                } else {
                    this.navigateToNext();
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.hide();
            }
        });
    }

    show() {
        this.searchBar.classList.remove('hidden');
        this.searchInput.focus();
        this.searchInput.select();
    }

    hide() {
        this.searchBar.classList.add('hidden');
        this.clearSearch();
        
        // Return focus to chat input
        const promptInput = document.getElementById('prompt-input');
        if (promptInput) {
            promptInput.focus();
        }
    }

    isVisible() {
        return !this.searchBar.classList.contains('hidden');
    }

    performSearch() {
        const query = this.searchInput.value.trim();
        
        // Clear previous search
        this.clearHighlights();
        this.matches = [];
        this.currentMatchIndex = -1;
        
        if (!query) {
            this.updateUI();
            return;
        }
        
        // Get all message content elements
        const messages = document.querySelectorAll('.message-content');
        
        messages.forEach((messageEl, messageIndex) => {
            // Skip if this is a thinking or tool message (optional - could include them)
            if (messageEl.closest('.thinking-message, .tool-message')) {
                return;
            }
            
            const originalText = this.getTextContent(messageEl);
            if (!originalText) return;
            
            // Find matches
            const regex = new RegExp(
                this.escapeRegex(query),
                this.caseSensitive ? 'g' : 'gi'
            );
            
            let match;
            const matches = [];
            while ((match = regex.exec(originalText)) !== null) {
                matches.push({
                    start: match.index,
                    end: match.index + match[0].length,
                    text: match[0]
                });
            }
            
            if (matches.length > 0) {
                // Store matches for navigation
                matches.forEach(m => {
                    this.matches.push({
                        element: messageEl,
                        match: m
                    });
                });
                
                // Highlight matches in this message
                this.highlightMatches(messageEl, originalText, matches);
            }
        });
        
        // Navigate to first match if any
        if (this.matches.length > 0) {
            this.currentMatchIndex = 0;
            this.highlightCurrentMatch();
        }
        
        this.updateUI();
    }

    getTextContent(element) {
        // Get text content, preserving structure but removing highlight spans
        const clone = element.cloneNode(true);
        const highlights = clone.querySelectorAll('.search-match, .search-match-current');
        highlights.forEach(h => {
            const text = document.createTextNode(h.textContent);
            h.parentNode.replaceChild(text, h);
        });
        return clone.textContent || '';
    }

    highlightMatches(element, originalText, matches) {
        // Build new HTML with highlighted matches
        let lastIndex = 0;
        const fragments = [];
        
        matches.forEach(match => {
            // Add text before match
            if (match.start > lastIndex) {
                fragments.push(document.createTextNode(
                    originalText.substring(lastIndex, match.start)
                ));
            }
            
            // Add highlighted match
            const span = document.createElement('span');
            span.className = 'search-match';
            span.textContent = originalText.substring(match.start, match.end);
            fragments.push(span);
            
            lastIndex = match.end;
        });
        
        // Add remaining text
        if (lastIndex < originalText.length) {
            fragments.push(document.createTextNode(
                originalText.substring(lastIndex)
            ));
        }
        
        // Replace element content
        element.textContent = '';
        fragments.forEach(f => element.appendChild(f));
    }

    highlightCurrentMatch() {
        if (this.currentMatchIndex < 0 || this.currentMatchIndex >= this.matches.length) {
            return;
        }
        
        // Remove previous current highlight
        document.querySelectorAll('.search-match-current').forEach(el => {
            el.classList.remove('search-match-current');
            el.classList.add('search-match');
        });
        
        // Highlight current match
        const currentMatch = this.matches[this.currentMatchIndex];
        const highlightSpans = currentMatch.element.querySelectorAll('.search-match');
        
        // Find the correct span for this match
        // Count spans until we find the right one for our match index
        let spanIndex = 0;
        for (let i = 0; i < this.currentMatchIndex; i++) {
            if (this.matches[i].element === currentMatch.element) {
                spanIndex++;
            }
        }
        
        if (highlightSpans[spanIndex]) {
            highlightSpans[spanIndex].classList.remove('search-match');
            highlightSpans[spanIndex].classList.add('search-match-current');
            
            // Scroll into view
            highlightSpans[spanIndex].scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'nearest'
            });
        }
    }

    navigateToNext() {
        if (this.matches.length === 0) return;
        
        this.currentMatchIndex = (this.currentMatchIndex + 1) % this.matches.length;
        this.highlightCurrentMatch();
        this.updateUI();
    }

    navigateToPrevious() {
        if (this.matches.length === 0) return;
        
        this.currentMatchIndex = this.currentMatchIndex <= 0 
            ? this.matches.length - 1 
            : this.currentMatchIndex - 1;
        this.highlightCurrentMatch();
        this.updateUI();
    }

    clearHighlights() {
        document.querySelectorAll('.search-match, .search-match-current').forEach(span => {
            const text = document.createTextNode(span.textContent);
            span.parentNode.replaceChild(text, span);
        });
    }

    clearSearch() {
        this.clearHighlights();
        this.matches = [];
        this.currentMatchIndex = -1;
        this.updateUI();
    }

    updateUI() {
        const hasMatches = this.matches.length > 0;
        
        // Update count
        if (hasMatches) {
            this.searchCount.textContent = `${this.currentMatchIndex + 1} of ${this.matches.length}`;
        } else if (this.searchInput.value.trim()) {
            this.searchCount.textContent = 'No results';
        } else {
            this.searchCount.textContent = '';
        }
        
        // Update navigation button states
        this.searchPrev.disabled = !hasMatches;
        this.searchNext.disabled = !hasMatches;
        
        // Announce to screen readers
        if (hasMatches) {
            this.searchCount.setAttribute('aria-live', 'polite');
        }
    }

    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Called when new messages are added - re-run search if active
    onMessagesChanged() {
        if (this.searchInput.value.trim() && this.isVisible()) {
            // Store current query and re-search
            const currentQuery = this.searchInput.value;
            const currentIndex = this.currentMatchIndex;
            this.performSearch();
            
            // Try to maintain position
            if (currentIndex >= 0 && currentIndex < this.matches.length) {
                this.currentMatchIndex = currentIndex;
                this.highlightCurrentMatch();
            }
        }
    }
}

// ===== APPROVAL BAR CLASS =====
class ApprovalBar {
    constructor() {
        this.element = document.getElementById('approval-bar');
        this.promptEl = document.getElementById('approval-prompt');
        this.contextEl = document.getElementById('approval-context');
        this.timeoutEl = this.element.querySelector('.approval-timeout');
        this.alwaysAllowBtn = document.getElementById('approval-always-allow');
        this.allowBtn = document.getElementById('approval-allow');
        this.denyBtn = document.getElementById('approval-deny');
        this.currentRequest = null;
        this.timeoutId = null;
        this.countdownId = null;

        this.init();
    }

    init() {
        // Button handlers
        this.alwaysAllowBtn.addEventListener('click', () => this.handleAlwaysAllow());
        this.allowBtn.addEventListener('click', () => this.handleAllow());
        this.denyBtn.addEventListener('click', () => this.handleDeny());

        // Keyboard shortcuts: Enter = Allow, Escape = Deny
        // (Shift+Enter removed to avoid conflict with textarea newlines)
        this.element.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleAllow();
            } else if (e.key === 'Escape') {
                this.handleDeny();
            }
        });
    }

    show(data) {
        this.currentRequest = data;

        // Update content
        this.promptEl.textContent = data.prompt;
        this.contextEl.textContent = data.context || '';

        // Show bar with animation
        this.element.removeAttribute('hidden');
        this.element.dataset.state = 'showing';

        // Focus allow button after animation
        setTimeout(() => this.allowBtn.focus(), 300);

        // Start timeout countdown
        if (data.timeout > 0) {
            this.startTimeout(data.timeout * 1000); // Convert to ms
        }
    }

    hide() {
        this.element.dataset.state = 'hiding';
        
        setTimeout(() => {
            this.element.setAttribute('hidden', '');
            this.element.dataset.state = '';
            this.currentRequest = null;
            this.clearTimeout();
        }, 250);
    }

    handleAlwaysAllow() {
        if (!this.currentRequest) return;
        
        vscode.postMessage({
            type: 'approvalDecision',
            approvalId: this.currentRequest.approvalId,
            decision: 'AlwaysAllow'
        });
        
        this.hide();
    }

    handleAllow() {
        if (!this.currentRequest) return;
        
        vscode.postMessage({
            type: 'approvalDecision',
            approvalId: this.currentRequest.approvalId,
            decision: 'Allow'
        });
        
        this.hide();
    }

    handleDeny() {
        if (!this.currentRequest) return;
        
        vscode.postMessage({
            type: 'approvalDecision',
            approvalId: this.currentRequest.approvalId,
            decision: 'Deny'
        });
        
        this.hide();
    }

    startTimeout(duration) {
        const endTime = Date.now() + duration;

        const updateCountdown = () => {
            const remaining = Math.max(0, endTime - Date.now());
            const seconds = Math.ceil(remaining / 1000);
            this.timeoutEl.textContent = `${seconds}s`;

            if (remaining > 0) {
                this.countdownId = requestAnimationFrame(updateCountdown);
            }
        };
        updateCountdown();

        this.timeoutId = setTimeout(() => {
            this.handleDeny(); // Auto-deny on timeout
        }, duration);
    }

    clearTimeout() {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
        if (this.countdownId) {
            cancelAnimationFrame(this.countdownId);
            this.countdownId = null;
        }
        this.timeoutEl.textContent = '';
    }
}

// UI Elements
const elements = {
    welcomeScreen: document.getElementById('welcome-screen'),
    chatInterface: document.getElementById('chat-interface'),
    messages: document.getElementById('messages'),
    promptInput: document.getElementById('prompt-input'),
    sendBtn: document.getElementById('send-btn'),
    setApiKeyBtn: document.getElementById('set-api-key-btn'),
    errorDisplay: document.getElementById('error-display'),
    errorMessage: document.getElementById('error-message'),
    errorAction: document.getElementById('error-action'),
    errorDismiss: document.getElementById('error-dismiss'),
    statusText: document.getElementById('status-text'),
    statusIndicator: document.getElementById('status-indicator'),
    statusInfo: document.getElementById('status-info'), // Updated to match new HTML
    tokenEstimate: document.getElementById('token-estimate'),
    tokenEstimateCount: document.getElementById('token-estimate-count'),
};

// State
let currentSessionId = null;
let isStreaming = false;
let currentMessageElement = null;
let totalTokens = { input: 0, output: 0 };
let errorDismissTimer = null;
let timestampRefreshInterval = null;

// Event Listeners
elements.sendBtn.addEventListener('click', sendMessage);
elements.promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        sendMessage();
    }
});
elements.promptInput.addEventListener('input', () => {
    // Enable/disable send button
    const hasText = elements.promptInput.value.trim().length > 0;
    elements.sendBtn.disabled = !hasText;
    
    // Estimate tokens (rough: ~4 chars per token)
    const text = elements.promptInput.value;
    const estimatedTokens = Math.ceil(text.length / 4);
    if (estimatedTokens > 0) {
        elements.tokenEstimate.classList.remove('hidden');
        elements.tokenEstimateCount.textContent = estimatedTokens.toLocaleString();
    } else {
        elements.tokenEstimate.classList.add('hidden');
    }
    
    // Auto-resize textarea
    elements.promptInput.style.height = 'auto';
    elements.promptInput.style.height = elements.promptInput.scrollHeight + 'px';
});

elements.setApiKeyBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'setApiKey' });
});

elements.errorDismiss.addEventListener('click', hideError);

// Send ready message when script loads
console.log('[Webview] Script loaded, sending ready message');
vscode.postMessage({ type: 'ready' });

// Initialize approval bar
const approvalBar = new ApprovalBar();

// Initialize search manager
const searchManager = new SearchManager();

// Global keyboard shortcut for search (Cmd/Ctrl+F)
document.addEventListener('keydown', (e) => {
    // Cmd+F (Mac) or Ctrl+F (Windows/Linux)
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        if (searchManager.isVisible()) {
            searchManager.searchInput.focus();
        } else {
            searchManager.show();
        }
    }
});

// Message handling from extension
window.addEventListener('message', (event) => {
    const message = event.data;
    console.log('[Amplifier Webview] Received message:', message.type, message);

    switch (message.type) {
        case 'needsApiKey':
            console.log('[Amplifier Webview] Showing welcome screen - no API key');
            showWelcomeScreen();
            break;
        case 'ready':
            console.log('[Amplifier Webview] Extension says ready');
            hideWelcomeScreen();
            break;
        case 'showWelcome':
            console.log('[Amplifier Webview] Showing welcome screen');
            showWelcomeScreen();
            break;
        case 'hideWelcome':
            console.log('[Amplifier Webview] Hiding welcome screen');
            hideWelcomeScreen();
            break;
        case 'sessionStarted':
            handleSessionStarted(message);
            break;
        case 'sessionStopped':
            handleSessionStopped();
            break;
        case 'contentDelta':
            handleContentDelta(message);
            break;
        case 'thinkingDelta':
            handleThinkingDelta(message);
            break;
        case 'thinkingStart':
            handleThinkingStart();
            break;
        case 'thinkingEnd':
            handleThinkingEnd();
            break;
        case 'toolStart':
            handleToolStart(message);
            break;
        case 'toolEnd':
            handleToolEnd(message);
            break;
        case 'promptComplete':
            handlePromptComplete(message);
            break;
        case 'showApproval':
            approvalBar.show({
                prompt: message.prompt,
                context: message.context,
                timeout: message.timeout,
                approvalId: message.approvalId
            });
            break;
        case 'error':
            showError(message.message || message.error, message.action, 'error');
            break;
        case 'connected':
            updateStatus('Connected', 'ready');
            break;
        case 'reconnecting':
            updateStatus(`Reconnecting (attempt ${message.attempt})...`, 'warning');
            break;
        default:
            console.warn('[Amplifier Webview] Unknown message type:', message.type);
    }
});

// Functions
function sendMessage() {
    const text = elements.promptInput.value.trim();
    if (!text) return;

    // Add user message to UI
    addMessage('user', text);

    // Send to extension
    vscode.postMessage({
        type: 'sendMessage',
        text,
    });

    // Clear input
    elements.promptInput.value = '';
    elements.promptInput.style.height = 'auto';
    elements.sendBtn.disabled = true;
    elements.tokenEstimate.classList.add('hidden');
}

function addMessage(role, content, timestamp = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;

    const headerDiv = document.createElement('div');
    headerDiv.className = 'message-header';

    const roleDiv = document.createElement('div');
    roleDiv.className = 'message-role';
    roleDiv.textContent = role === 'user' ? 'You' : 'Amplifier';

    // Create timestamp with relative time and hover tooltip
    const now = new Date();
    const timestampDiv = document.createElement('span');
    timestampDiv.className = 'message-timestamp';
    timestampDiv.textContent = formatRelativeTime(now);
    timestampDiv.title = formatFullTimestamp(now); // Hover tooltip
    timestampDiv.dataset.timestamp = now.getTime().toString(); // Store for refresh

    headerDiv.appendChild(roleDiv);
    headerDiv.appendChild(timestampDiv);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    // Render markdown for assistant messages, plain text for user messages
    if (role === 'assistant' && marked) {
        try {
            contentDiv.innerHTML = marked.parse(content);
            // Apply syntax highlighting to any code blocks
            highlightCodeBlocks(contentDiv);
        } catch (err) {
            console.warn('Markdown parsing error:', err);
            contentDiv.textContent = content; // Fallback to plain text
        }
    } else {
        contentDiv.textContent = content;
    }

    messageDiv.appendChild(headerDiv);
    messageDiv.appendChild(contentDiv);
    elements.messages.appendChild(messageDiv);

    // Scroll to bottom
    elements.messages.scrollTop = elements.messages.scrollHeight;

    return contentDiv;
}

/**
 * Format timestamp for display (HH:MM) - DEPRECATED, use formatRelativeTime
 */
function formatTime(date) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

/**
 * Format date as full timestamp for hover tooltip
 * Example: "Dec 17, 2025 06:15:32"
 */
function formatFullTimestamp(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    
    return `${month} ${day}, ${year} ${hours}:${minutes}:${seconds}`;
}

/**
 * Format date as relative time (e.g., "2 mins ago", "3 hours ago")
 * Returns human-readable relative time string
 */
function formatRelativeTime(date) {
    const now = Date.now();
    const timestamp = date.getTime();
    const diffMs = now - timestamp;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    // Future dates (clock skew) - show "just now"
    if (diffSeconds < 0) {
        return 'just now';
    }
    
    // Less than 1 minute
    if (diffSeconds < 60) {
        return 'just now';
    }
    
    // Less than 1 hour
    if (diffMinutes < 60) {
        return diffMinutes === 1 ? '1 min ago' : `${diffMinutes} mins ago`;
    }
    
    // Less than 24 hours
    if (diffHours < 24) {
        return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
    }
    
    // Less than 2 days - show "yesterday"
    if (diffDays === 1) {
        return 'yesterday';
    }
    
    // Less than 7 days
    if (diffDays < 7) {
        return `${diffDays} days ago`;
    }
    
    // More than 7 days - show date
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = date.getDate();
    
    // Same year - omit year
    if (date.getFullYear() === new Date().getFullYear()) {
        return `${month} ${day}`;
    }
    
    // Different year - include year
    return `${month} ${day}, ${date.getFullYear()}`;
}

/**
 * Update all timestamps to show relative time
 * Called periodically to refresh timestamps
 */
function updateAllTimestamps() {
    const timestamps = document.querySelectorAll('.message-timestamp[data-timestamp]');
    timestamps.forEach(timestampEl => {
        const timestamp = parseInt(timestampEl.dataset.timestamp, 10);
        if (!isNaN(timestamp)) {
            const date = new Date(timestamp);
            timestampEl.textContent = formatRelativeTime(date);
        }
    });
}

function handleSessionStarted(message) {
    currentSessionId = message.sessionId;
    
    // Update collapsed state info
    if (message.workspaceRoot) {
        const folderName = message.workspaceRoot.split('/').pop() || message.workspaceRoot;
        document.getElementById('workspace-name').textContent = folderName;
    }
    
    document.getElementById('session-id-short').textContent = message.sessionId.substring(0, 8);
    
    // Update expanded details
    document.getElementById('workspace-path-full').textContent = message.workspaceRoot || 'No workspace';
    document.getElementById('workspace-path-full').title = message.workspaceRoot || 'No workspace';
    document.getElementById('session-id-full').textContent = message.sessionId;
    document.getElementById('session-id-full').title = message.sessionId;
    
    // Show the info section
    const statusInfo = document.getElementById('status-info');
    if (statusInfo) {
        statusInfo.classList.remove('hidden');
    }
    
    updateStatus('Ready', 'ready');
}

function handleSessionStopped() {
    currentSessionId = null;
    const statusInfo = document.getElementById('status-info');
    if (statusInfo) {
        statusInfo.classList.add('hidden');
    }
    updateStatus('Disconnected', 'error');
}

function handleContentDelta(message) {
    console.log('[Webview] Content delta:', message.data);
    const data = message.data;
    
    if (!isStreaming) {
        // Start new assistant message
        isStreaming = true;
        currentMessageElement = addMessage('assistant', '');
        currentMessageElement.classList.add('streaming');
    }

    // Append delta
    if (currentMessageElement && data.delta) {
        // For streaming, append as plain text first
        // We'll render markdown when complete
        if (!currentMessageElement.dataset.rawContent) {
            currentMessageElement.dataset.rawContent = '';
        }
        currentMessageElement.dataset.rawContent += data.delta;
        currentMessageElement.textContent += data.delta;
        elements.messages.scrollTop = elements.messages.scrollHeight;
    }
}

function handleThinkingStart() {
    console.log('[Webview] Thinking start');
    
    // Create thinking message block with collapsible structure
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant thinking-message';
    messageDiv.id = 'current-thinking-block';
    messageDiv.dataset.collapsed = 'true';
    
    // Collapsible header (clickable)
    const headerDiv = document.createElement('div');
    headerDiv.className = 'message-header thinking-header';
    headerDiv.setAttribute('role', 'button');
    headerDiv.setAttribute('aria-expanded', 'false');
    headerDiv.setAttribute('tabindex', '0');
    headerDiv.setAttribute('aria-label', 'Expand thinking process');
    
    // Chevron icon
    const chevronSpan = document.createElement('span');
    chevronSpan.className = 'collapse-icon';
    chevronSpan.setAttribute('aria-hidden', 'true');
    chevronSpan.innerHTML = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M6 4l4 4-4 4"/></svg>`;
    headerDiv.appendChild(chevronSpan);
    
    const roleDiv = document.createElement('div');
    roleDiv.className = 'message-role';
    
    // Add SVG icon
    const icon = createIcon('M8 1a7 7 0 110 14A7 7 0 018 1zm0 2a5 5 0 100 10A5 5 0 008 3z');
    roleDiv.appendChild(icon);
    roleDiv.appendChild(document.createTextNode('Thinking'));
    
    const now = new Date();
    const timestampDiv = document.createElement('span');
    timestampDiv.className = 'message-timestamp';
    timestampDiv.textContent = formatRelativeTime(now);
    timestampDiv.title = formatFullTimestamp(now); // Hover tooltip
    timestampDiv.dataset.timestamp = now.getTime().toString(); // Store for refresh
    
    headerDiv.appendChild(roleDiv);
    headerDiv.appendChild(timestampDiv);
    
    // Collapsible content (hidden by default)
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content thinking-content';
    contentDiv.id = 'thinking-content-text';
    contentDiv.hidden = true;
    
    messageDiv.appendChild(headerDiv);
    messageDiv.appendChild(contentDiv);
    elements.messages.appendChild(messageDiv);
    
    // Make collapsible
    makeCollapsible(messageDiv, headerDiv, contentDiv);
    
    elements.messages.scrollTop = elements.messages.scrollHeight;
}

function handleThinkingDelta(message) {
    console.log('[Webview] Thinking delta:', message.data);
    console.log('[Webview] Thinking delta length:', message.data.delta?.length);
    
    // Always create a NEW thinking block for each thinking event
    // (Multiple thinking blocks can occur during one execution)
    console.log('[Webview] Creating new thinking block...');
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant thinking-message';
    messageDiv.dataset.collapsed = 'true';
    
    // Collapsible header (clickable)
    const headerDiv = document.createElement('div');
    headerDiv.className = 'message-header thinking-header';
    headerDiv.setAttribute('role', 'button');
    headerDiv.setAttribute('aria-expanded', 'false');
    headerDiv.setAttribute('tabindex', '0');
    headerDiv.setAttribute('aria-label', 'Expand thinking process');
    
    // Chevron icon
    const chevronSpan = document.createElement('span');
    chevronSpan.className = 'collapse-icon';
    chevronSpan.setAttribute('aria-hidden', 'true');
    chevronSpan.innerHTML = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M6 4l4 4-4 4"/></svg>`;
    headerDiv.appendChild(chevronSpan);
    
    const roleDiv = document.createElement('div');
    roleDiv.className = 'message-role';
    
    // Add SVG icon
    const icon = createIcon('M8 1a7 7 0 110 14A7 7 0 018 1zm0 2a5 5 0 100 10A5 5 0 008 3z');
    roleDiv.appendChild(icon);
    roleDiv.appendChild(document.createTextNode('Thinking'));
    
    const now = new Date();
    const timestampDiv = document.createElement('span');
    timestampDiv.className = 'message-timestamp';
    timestampDiv.textContent = formatRelativeTime(now);
    timestampDiv.title = formatFullTimestamp(now);
    timestampDiv.dataset.timestamp = now.getTime().toString();
    
    headerDiv.appendChild(roleDiv);
    headerDiv.appendChild(timestampDiv);
    
    // Collapsible content (hidden by default)
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content thinking-content';
    contentDiv.textContent = message.data.delta;
    contentDiv.hidden = true;
    
    messageDiv.appendChild(headerDiv);
    messageDiv.appendChild(contentDiv);
    elements.messages.appendChild(messageDiv);
    
    // Make collapsible
    makeCollapsible(messageDiv, headerDiv, contentDiv);
    
    console.log('[Webview] Thinking block created and appended');
    console.log('[Webview] Messages children count:', elements.messages.children.length);
    
    // Scroll to show thinking
    elements.messages.scrollTop = elements.messages.scrollHeight;
}

function handleThinkingEnd() {
    console.log('[Webview] Thinking end');
    // Keep the thinking block (it's part of the conversation)
}

function handleToolStart(message) {
    console.log('[Webview] Tool start:', message.data);
    const data = message.data;
    
    // Create tool execution message block with collapsible structure
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message tool-message';
    messageDiv.id = `tool-${Date.now()}`;
    messageDiv.dataset.toolName = data.tool_name || data.operation;
    messageDiv.dataset.collapsed = 'true';
    
    // Collapsible header (clickable)
    const headerDiv = document.createElement('div');
    headerDiv.className = 'message-header tool-header';
    headerDiv.setAttribute('role', 'button');
    headerDiv.setAttribute('aria-expanded', 'false');
    headerDiv.setAttribute('tabindex', '0');
    headerDiv.setAttribute('aria-label', `Expand tool: ${data.tool_name || data.operation}`);
    
    // Chevron icon
    const chevronSpan = document.createElement('span');
    chevronSpan.className = 'collapse-icon';
    chevronSpan.setAttribute('aria-hidden', 'true');
    chevronSpan.innerHTML = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M6 4l4 4-4 4"/></svg>`;
    headerDiv.appendChild(chevronSpan);
    
    const roleDiv = document.createElement('div');
    roleDiv.className = 'message-role tool-role';
    
    // Add SVG icon
    const icon = createIcon('M13.5 1l-1 1 1.5 1.5L13 4l-2-2L9 4l1.5 1.5L9 7l2 2 1.5-1.5L14 9l-2-2 1.5-1.5L15 6.5l-1.5-1.5z');
    roleDiv.appendChild(icon);
    
    const toolLabel = document.createElement('strong');
    toolLabel.textContent = data.tool_name || data.operation;
    roleDiv.appendChild(toolLabel);
    
    const statusSpan = document.createElement('span');
    statusSpan.className = 'tool-status';
    statusSpan.textContent = 'Running...';
    roleDiv.appendChild(statusSpan);
    
    const now = new Date();
    const timestampDiv = document.createElement('span');
    timestampDiv.className = 'message-timestamp';
    timestampDiv.textContent = formatRelativeTime(now);
    timestampDiv.title = formatFullTimestamp(now); // Hover tooltip
    timestampDiv.dataset.timestamp = now.getTime().toString(); // Store for refresh
    
    headerDiv.appendChild(roleDiv);
    headerDiv.appendChild(timestampDiv);
    
    // Collapsible content (hidden by default)
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content tool-content';
    contentDiv.hidden = true;
    
    // Add collapsible input
    if (data.input) {
        const inputDetails = document.createElement('details');
        inputDetails.className = 'tool-details';
        
        const summary = document.createElement('summary');
        summary.textContent = 'Input';
        inputDetails.appendChild(summary);
        
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = JSON.stringify(data.input, null, 2);
        pre.appendChild(code);
        inputDetails.appendChild(pre);
        
        contentDiv.appendChild(inputDetails);
    }
    
    messageDiv.appendChild(headerDiv);
    messageDiv.appendChild(contentDiv);
    elements.messages.appendChild(messageDiv);
    
    // Make collapsible
    makeCollapsible(messageDiv, headerDiv, contentDiv);
    
    elements.messages.scrollTop = elements.messages.scrollHeight;
}

function handleToolEnd(message) {
    console.log('[Webview] Tool end:', message.data);
    const data = message.data;
    
    // Find the most recent tool message with this tool name
    const toolMessages = Array.from(document.querySelectorAll('.tool-message')).reverse();
    const toolMessage = toolMessages.find(msg => 
        msg.dataset.toolName === (data.tool_name || data.operation)
    );
    
    if (toolMessage) {
        // Update status
        const statusSpan = toolMessage.querySelector('.tool-status');
        if (statusSpan) {
            const success = data.result?.success !== false;
            statusSpan.textContent = success ? ' ✓ Success' : ' ✗ Error';
            statusSpan.className = `tool-status ${success ? 'success' : 'error'}`;
            
            // Add duration
            if (data.duration_ms) {
                const durationSpan = document.createElement('span');
                durationSpan.className = 'tool-duration';
                durationSpan.textContent = `${data.duration_ms}ms`;
                statusSpan.parentElement.appendChild(durationSpan);
            }
        }
        
        // Add result
        const contentDiv = toolMessage.querySelector('.tool-content');
        if (contentDiv && data.result) {
            const resultDetails = document.createElement('details');
            resultDetails.className = 'tool-details';
            resultDetails.open = true;
            
            const summary = document.createElement('summary');
            summary.textContent = 'Result';
            resultDetails.appendChild(summary);
            
            const pre = document.createElement('pre');
            const code = document.createElement('code');
            
            // Get result text
            let resultText = typeof data.result.output === 'string' 
                ? data.result.output 
                : JSON.stringify(data.result, null, 2);
            
            // Truncate long results (>500 chars) and add note
            if (resultText.length > 500) {
                toolMessage.dataset.fullResult = resultText;
                const truncatedText = resultText.substring(0, 500);
                code.textContent = truncatedText;
                
                const truncateNote = document.createElement('div');
                truncateNote.className = 'tool-truncate-note';
                truncateNote.textContent = `... (${resultText.length - 500} more characters, expand to see full output)`;
                pre.appendChild(truncateNote);
            } else {
                code.textContent = resultText;
            }
            
            pre.appendChild(code);
            resultDetails.appendChild(pre);
            
            contentDiv.appendChild(resultDetails);
        }
    }
    
    elements.messages.scrollTop = elements.messages.scrollHeight;
}

function handlePromptComplete(data) {
    console.log('[Webview] Prompt complete:', data);
    
    // Remove streaming cursor and render markdown
    if (currentMessageElement) {
        currentMessageElement.classList.remove('streaming');
        
        // Render the complete message as markdown
        if (marked && currentMessageElement.dataset.rawContent) {
            try {
                const rawContent = currentMessageElement.dataset.rawContent;
                currentMessageElement.innerHTML = marked.parse(rawContent);
                highlightCodeBlocks(currentMessageElement);
                delete currentMessageElement.dataset.rawContent;
            } catch (err) {
                console.warn('Markdown rendering error:', err);
                // Keep the plain text version
            }
        }
    }
    
    isStreaming = false;
    
    // Remove the thinking block (captured in final response)
    const thinkingBlock = document.getElementById('current-thinking-block');
    if (thinkingBlock) {
        thinkingBlock.remove();
    }

    // If response text exists and no message element, create one
    if (data.data && data.data.response && !currentMessageElement) {
        console.log('[Webview] Displaying complete response:', data.data.response);
        currentMessageElement = addMessage('assistant', data.data.response);
    }

    // Add token usage footer
    const tokenUsage = data.data?.token_usage || data.token_usage;
    console.log('[Webview] Token usage:', tokenUsage);
    
    if (tokenUsage && currentMessageElement) {
        const inputTokens = tokenUsage.input_tokens || 0;
        const outputTokens = tokenUsage.output_tokens || 0;
        
        const footer = document.createElement('div');
        footer.className = 'message-footer';
        
        const tokenUsageDiv = document.createElement('div');
        tokenUsageDiv.className = 'token-usage';
        tokenUsageDiv.innerHTML = `
            <span class="token-usage-detail">↑ ${inputTokens.toLocaleString()}</span>
            <span class="token-usage-detail">↓ ${outputTokens.toLocaleString()}</span>
        `;
        footer.appendChild(tokenUsageDiv);
        
        if (currentMessageElement.parentElement) {
            currentMessageElement.parentElement.appendChild(footer);
        }

        // Update total
        totalTokens.input += inputTokens;
        totalTokens.output += outputTokens;
    }

    currentMessageElement = null;
}

function showWelcomeScreen() {
    elements.welcomeScreen.classList.remove('hidden');
    elements.chatInterface.classList.add('hidden');
}

function hideWelcomeScreen() {
    elements.welcomeScreen.classList.add('hidden');
    elements.chatInterface.classList.remove('hidden');
}

function showError(message, action, severity = 'error') {
    // Clear any existing dismiss timer
    if (errorDismissTimer) {
        clearTimeout(errorDismissTimer);
        errorDismissTimer = null;
    }
    
    elements.errorDisplay.classList.remove('hidden', 'warning', 'info');
    if (severity !== 'error') {
        elements.errorDisplay.classList.add(severity);
    }
    
    elements.errorMessage.textContent = message;

    if (action) {
        elements.errorAction.classList.remove('hidden');
        const actionBtn = document.createElement('button');
        actionBtn.textContent = action.text;
        actionBtn.onclick = () => {
            vscode.postMessage({ type: action.command });
            hideError();
        };
        elements.errorAction.innerHTML = '';
        elements.errorAction.appendChild(actionBtn);
    } else {
        elements.errorAction.classList.add('hidden');
    }
    
    // Auto-dismiss after 5 seconds for transient errors (no action)
    if (!action && severity !== 'error') {
        errorDismissTimer = setTimeout(hideError, 5000);
    }
}

function hideError() {
    if (errorDismissTimer) {
        clearTimeout(errorDismissTimer);
        errorDismissTimer = null;
    }
    
    elements.errorDisplay.style.animation = 'slideUp 200ms cubic-bezier(0.4, 0, 0.2, 1)';
    setTimeout(() => {
        elements.errorDisplay.classList.add('hidden');
        elements.errorDisplay.style.animation = '';
    }, 200);
}

function updateStatus(text, level = 'idle') {
    // Update both collapsed and expanded status indicators
    const statusText = document.getElementById('status-text');
    const statusIndicator = document.getElementById('status-indicator');
    const statusTextDetail = document.getElementById('status-text-detail');
    const statusIndicatorDetail = document.getElementById('status-indicator-detail');
    
    if (statusText) statusText.textContent = text;
    if (statusTextDetail) statusTextDetail.textContent = text;
    
    // Update status indicator classes
    if (statusIndicator) {
        statusIndicator.className = 'status-indicator';
        if (level === 'ready') statusIndicator.classList.add('status--ready');
        else if (level === 'processing') statusIndicator.classList.add('status--processing');
        else if (level === 'error') statusIndicator.classList.add('status--error');
    }
    
    if (statusIndicatorDetail) {
        statusIndicatorDetail.className = 'status-indicator';
        if (level === 'ready') statusIndicatorDetail.classList.add('status--ready');
        else if (level === 'processing') statusIndicatorDetail.classList.add('status--processing');
        else if (level === 'error') statusIndicatorDetail.classList.add('status--error');
    }
}

function createIcon(pathData) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('role-icon');
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('d', pathData);
    svg.appendChild(path);
    
    return svg;
}

// Initialize
function initialize() {
    console.log('[Amplifier Webview] Initializing...');
    
    // Initial send button state
    elements.sendBtn.disabled = true;
    
    // Initialize status bar toggle
    initStatusBar();
    
    // Initialize code copy functionality
    initCodeCopy();
    
    // Start timestamp refresh (update every 60 seconds)
    startTimestampRefresh();
    
    console.log('[Amplifier Webview] Initialization complete');
}

/**
 * Start periodic timestamp refresh
 * Updates relative timestamps every 60 seconds
 */
function startTimestampRefresh() {
    // Clear any existing interval
    if (timestampRefreshInterval) {
        clearInterval(timestampRefreshInterval);
    }
    
    // Update every 60 seconds
    timestampRefreshInterval = setInterval(() => {
        updateAllTimestamps();
    }, 60000); // 60 seconds
    
    console.log('[Amplifier Webview] Timestamp auto-refresh started (60s interval)');
}

/**
 * Stop timestamp refresh (cleanup)
 */
function stopTimestampRefresh() {
    if (timestampRefreshInterval) {
        clearInterval(timestampRefreshInterval);
        timestampRefreshInterval = null;
    }
}

// Status bar toggle and copy functionality
function initStatusBar() {
    const toggle = document.getElementById('status-toggle');
    const details = document.getElementById('status-details');
    const copyButtons = document.querySelectorAll('.copy-button');
    
    if (!toggle || !details) return;
    
    // Toggle expansion
    toggle.addEventListener('click', () => {
        const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', !isExpanded);
        details.hidden = isExpanded;
    });
    
    // Copy functionality
    copyButtons.forEach(button => {
        button.addEventListener('click', async (e) => {
            e.stopPropagation(); // Prevent toggle
            
            const targetId = button.dataset.copyTarget;
            const targetElement = document.getElementById(targetId);
            if (!targetElement) return;
            
            const text = targetElement.textContent;
            
            try {
                await navigator.clipboard.writeText(text);
                showCopySuccess(button);
            } catch (err) {
                console.error('Failed to copy:', err);
            }
        });
    });
    
    // Keyboard navigation
    toggle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle.click();
        }
    });
}

function showCopySuccess(button) {
    const originalLabel = button.getAttribute('aria-label');
    
    button.classList.add('copy-button--success');
    button.setAttribute('aria-label', 'Copied!');
    
    // Reset after 1.5s
    setTimeout(() => {
        button.classList.remove('copy-button--success');
        button.setAttribute('aria-label', originalLabel);
    }, 1500);
}

// Syntax highlighting helper
function highlightCodeBlocks(container) {
    if (!hljs) return;
    
    // Highlight all code blocks in the container
    const codeBlocks = container.querySelectorAll('pre code');
    codeBlocks.forEach(block => {
        // Check if already highlighted
        if (!block.classList.contains('hljs')) {
            hljs.highlightElement(block);
        }
    });
    
    // Also highlight inline code (subtle highlighting)
    const inlineCode = container.querySelectorAll('code:not(pre code)');
    inlineCode.forEach(code => {
        // Don't re-highlight
        if (!code.classList.contains('hljs')) {
            // Try to detect language for inline code (simple heuristics)
            const text = code.textContent;
            if (text.length < 100) { // Only for short snippets
                try {
                    const result = hljs.highlightAuto(text, ['python', 'javascript', 'typescript', 'bash']);
                    if (result.relevance > 3) { // Only apply if confident
                        code.innerHTML = result.value;
                        code.classList.add('hljs-inline');
                    }
                } catch (err) {
                    // Silently ignore inline code highlighting errors
                }
            }
        }
    });
}

// ===== CODE BLOCK COPY FUNCTIONALITY =====

/**
 * Add copy buttons to all code blocks in a container
 * @param {HTMLElement} container - Container to search for code blocks
 */
function addCopyButtonsToCodeBlocks(container = document) {
    const codeBlocks = container.querySelectorAll('pre > code');
    
    codeBlocks.forEach(codeBlock => {
        const pre = codeBlock.parentElement;
        
        // Skip if already has copy button
        if (pre.querySelector('.code-copy-btn')) return;
        
        // Wrap pre in a container div for positioning
        const wrapper = document.createElement('div');
        wrapper.className = 'code-block-wrapper';
        pre.parentNode.insertBefore(wrapper, pre);
        wrapper.appendChild(pre);
        
        // Create copy button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'code-copy-btn';
        copyBtn.setAttribute('aria-label', 'Copy code');
        copyBtn.setAttribute('type', 'button');
        
        // Add copy icon SVG (codicon-copy style)
        copyBtn.innerHTML = `
            <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M4 4l1-1h5.414L14 6.586V14l-1 1H5l-1-1V4zm9 3l-3-3H5v10h8V7z"/>
                <path fill-rule="evenodd" clip-rule="evenodd" d="M3 1L2 2v10l1 1V2h6.414l-1-1H3z"/>
            </svg>
        `;
        
        wrapper.appendChild(copyBtn);
    });
}

/**
 * Handle copy button clicks using event delegation
 * @param {MouseEvent} e - Click event
 */
async function handleCodeCopy(e) {
    const copyBtn = e.target.closest('.code-copy-btn');
    if (!copyBtn) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const wrapper = copyBtn.closest('.code-block-wrapper');
    const codeBlock = wrapper.querySelector('code');
    if (!codeBlock) return;
    
    const code = codeBlock.textContent;
    
    try {
        // Try clipboard API first
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(code);
        } else {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = code;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }
        
        // Show success feedback
        showCopyFeedback(copyBtn, true);
    } catch (err) {
        console.error('Failed to copy code:', err);
        showCopyFeedback(copyBtn, false);
    }
}

/**
 * Show visual feedback after copy attempt
 * @param {HTMLElement} button - Copy button element
 * @param {boolean} success - Whether copy succeeded
 */
function showCopyFeedback(button, success) {
    const originalLabel = button.getAttribute('aria-label');
    const originalHTML = button.innerHTML;
    
    // Update button content
    if (success) {
        button.classList.add('code-copy-btn--success');
        button.setAttribute('aria-label', 'Copied!');
        button.innerHTML = `
            <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                <path d="M14.431 3.323l-8.47 10-.79-.036-3.35-4.77.818-.574 2.978 4.24 8.051-9.506.764.646z"/>
            </svg>
        `;
    } else {
        button.classList.add('code-copy-btn--error');
        button.setAttribute('aria-label', 'Failed to copy');
        button.innerHTML = `
            <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                <path d="M8 1a7 7 0 110 14A7 7 0 018 1zm0 2a5 5 0 100 10A5 5 0 008 3zm.5 8H8V6h.5v5zm0 1H8v1h.5v-1z"/>
            </svg>
        `;
    }
    
    // Reset after 2 seconds
    setTimeout(() => {
        button.classList.remove('code-copy-btn--success', 'code-copy-btn--error');
        button.setAttribute('aria-label', originalLabel);
        button.innerHTML = originalHTML;
    }, 2000);
}

/**
 * Initialize code copy functionality with event delegation
 */
function initCodeCopy() {
    // Add copy buttons to existing code blocks
    addCopyButtonsToCodeBlocks();
    
    // Use event delegation for dynamically added code blocks
    document.addEventListener('click', handleCodeCopy);
    
    // Watch for new code blocks being added (for streaming messages)
    const messagesContainer = document.getElementById('messages');
    if (messagesContainer) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        addCopyButtonsToCodeBlocks(node);
                    }
                });
            });
        });
        
        observer.observe(messagesContainer, {
            childList: true,
            subtree: true
        });
    }
}

// Run initialization
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}
