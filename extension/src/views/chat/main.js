/**
 * Chat Webview Script
 * Runs inside the VS Code webview to handle UI interactions
 */

// VS Code API (injected by VS Code)
const vscode = acquireVsCodeApi();

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

    const timestampDiv = document.createElement('span');
    timestampDiv.className = 'message-timestamp';
    timestampDiv.textContent = timestamp || formatTime(new Date());

    headerDiv.appendChild(roleDiv);
    headerDiv.appendChild(timestampDiv);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = content;

    messageDiv.appendChild(headerDiv);
    messageDiv.appendChild(contentDiv);
    elements.messages.appendChild(messageDiv);

    // Scroll to bottom
    elements.messages.scrollTop = elements.messages.scrollHeight;

    return contentDiv;
}

function formatTime(date) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
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
        currentMessageElement.textContent += data.delta;
        elements.messages.scrollTop = elements.messages.scrollHeight;
    }
}

function handleThinkingStart() {
    console.log('[Webview] Thinking start');
    
    // Create thinking message block
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant thinking-message';
    messageDiv.id = 'current-thinking-block';
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'message-header';
    
    const roleDiv = document.createElement('div');
    roleDiv.className = 'message-role';
    
    // Add SVG icon
    const icon = createIcon('M8 1a7 7 0 110 14A7 7 0 018 1zm0 2a5 5 0 100 10A5 5 0 008 3z');
    roleDiv.appendChild(icon);
    roleDiv.appendChild(document.createTextNode('Thinking'));
    
    const timestampDiv = document.createElement('span');
    timestampDiv.className = 'message-timestamp';
    timestampDiv.textContent = formatTime(new Date());
    
    headerDiv.appendChild(roleDiv);
    headerDiv.appendChild(timestampDiv);
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content thinking-content';
    contentDiv.id = 'thinking-content-text';
    
    messageDiv.appendChild(headerDiv);
    messageDiv.appendChild(contentDiv);
    elements.messages.appendChild(messageDiv);
    
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
    
    const roleDiv = document.createElement('div');
    roleDiv.className = 'message-role';
    roleDiv.textContent = '💭 Thinking';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content thinking-content';
    contentDiv.textContent = message.data.delta;
    
    messageDiv.appendChild(roleDiv);
    messageDiv.appendChild(contentDiv);
    elements.messages.appendChild(messageDiv);
    
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
    
    // Create tool execution message block
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message tool-message';
    messageDiv.id = `tool-${Date.now()}`;
    messageDiv.dataset.toolName = data.tool_name || data.operation;
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'message-header';
    
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
    
    const timestampDiv = document.createElement('span');
    timestampDiv.className = 'message-timestamp';
    timestampDiv.textContent = formatTime(new Date());
    
    headerDiv.appendChild(roleDiv);
    headerDiv.appendChild(timestampDiv);
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content tool-content';
    
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
            statusSpan.textContent = success ? '✓' : '✗';
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
            code.textContent = typeof data.result.output === 'string' 
                ? data.result.output 
                : JSON.stringify(data.result, null, 2);
            pre.appendChild(code);
            resultDetails.appendChild(pre);
            
            contentDiv.appendChild(resultDetails);
        }
    }
    
    elements.messages.scrollTop = elements.messages.scrollHeight;
}

function handlePromptComplete(data) {
    console.log('[Webview] Prompt complete:', data);
    
    // Remove streaming cursor
    if (currentMessageElement) {
        currentMessageElement.classList.remove('streaming');
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
    
    console.log('[Amplifier Webview] Initialization complete');
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

// Run initialization
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}
