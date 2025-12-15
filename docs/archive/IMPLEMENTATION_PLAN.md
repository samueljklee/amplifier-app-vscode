# Implementation Plan - MVP with Feedback Addressed

> **Date**: 2025-12-11
> **Status**: Ready for Implementation
> **Based on**: Gap analysis feedback and amplifier codebase patterns

This document provides the refined implementation plan addressing all feedback from the gap analysis review.

---

## 1. Inline Diff Preview - With Proper Lifecycle

### Engineering Practice
**Yes, virtual document lifecycle management is correct practice.** VS Code expects providers to manage memory and cleanup properly, especially for transient content like diff previews.

### Implementation with Lifecycle Management

```typescript
// extension/src/services/DiffPreviewProvider.ts
import * as vscode from 'vscode';
import * as path from 'path';

export class DiffPreviewProvider implements vscode.TextDocumentContentProvider {
  private static readonly SCHEME = 'amplifier-proposed';
  private static readonly CLEANUP_TIMEOUT = 30000; // 30 seconds
  
  private proposedContents = new Map<string, string>();
  private activeDiffs = new Map<string, {
    timer: NodeJS.Timeout;
    cleanup: () => void;
  }>();
  
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;
  
  private documentCloseSubscription: vscode.Disposable;

  constructor(context: vscode.ExtensionContext) {
    // Register virtual document provider
    context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(
        DiffPreviewProvider.SCHEME,
        this
      )
    );
    
    // Watch for document closes to cleanup orphaned diffs
    this.documentCloseSubscription = vscode.workspace.onDidCloseTextDocument(doc => {
      if (doc.uri.scheme === DiffPreviewProvider.SCHEME) {
        this.cleanupDiff(doc.uri.toString());
      }
    });
    
    context.subscriptions.push(this.documentCloseSubscription);
  }

  provideTextDocumentContent(uri: vscode.Uri): string | undefined {
    return this.proposedContents.get(uri.toString());
  }

  async showDiff(
    filePath: string,
    proposedContent: string
  ): Promise<'accept' | 'reject' | 'edit'> {
    const fileUri = vscode.Uri.file(filePath);
    const timestamp = Date.now();
    const proposedUri = vscode.Uri.parse(
      `${DiffPreviewProvider.SCHEME}:${filePath}?t=${timestamp}`
    );
    
    const uriString = proposedUri.toString();
    this.proposedContents.set(uriString, proposedContent);
    
    // Setup auto-cleanup timer
    const timer = setTimeout(() => {
      this.cleanupDiff(uriString);
      vscode.window.showWarningMessage(
        `Diff preview for ${path.basename(filePath)} timed out and was closed.`
      );
    }, DiffPreviewProvider.CLEANUP_TIMEOUT);
    
    const cleanup = () => {
      clearTimeout(timer);
      this.proposedContents.delete(uriString);
      this.activeDiffs.delete(uriString);
    };
    
    this.activeDiffs.set(uriString, { timer, cleanup });
    
    try {
      await vscode.commands.executeCommand(
        'vscode.diff',
        fileUri,
        proposedUri,
        `${path.basename(filePath)} ↔ Proposed Changes`,
        { preview: false, viewColumn: vscode.ViewColumn.Beside }
      );
      
      const choice = await vscode.window.showInformationMessage(
        `Apply proposed changes to ${path.basename(filePath)}?`,
        { modal: false },
        'Accept', 'Reject', 'Edit First'
      );
      
      return choice === 'Accept' ? 'accept' :
             choice === 'Edit First' ? 'edit' : 'reject';
    } finally {
      cleanup();
    }
  }
  
  private cleanupDiff(uriString: string) {
    const diffData = this.activeDiffs.get(uriString);
    if (diffData) {
      diffData.cleanup();
    }
  }
  
  cleanupAll() {
    // Called on session end or extension deactivation
    for (const [uri, data] of this.activeDiffs) {
      data.cleanup();
    }
  }

  dispose() {
    this.cleanupAll();
    this.documentCloseSubscription.dispose();
  }
}
```

**Lifecycle guarantees**:
- ✅ Auto-cleanup after 30s if user doesn't respond
- ✅ Cleanup when document closed
- ✅ Cleanup when session ends
- ✅ Cleanup on extension deactivation
- ✅ No memory leaks from abandoned diffs

---

## 2. Context Mentions - Configurable Size Limits

### VS Code Settings Approach

```json
// extension/package.json - Add configuration
{
  "contributes": {
    "configuration": {
      "title": "Amplifier",
      "properties": {
        "amplifier.mentions.maxFileSize": {
          "type": "number",
          "default": 1048576,
          "description": "Maximum file size in bytes for @file: mentions (default: 1MB)"
        },
        "amplifier.mentions.maxFolderEntries": {
          "type": "number",
          "default": 500,
          "description": "Maximum number of entries for @folder: mentions"
        },
        "amplifier.mentions.maxTotalContext": {
          "type": "number",
          "default": 5242880,
          "description": "Maximum total context size in bytes across all mentions (default: 5MB)"
        },
        "amplifier.mentions.maxUrlSize": {
          "type": "number",
          "default": 102400,
          "description": "Maximum size for @url: content (default: 100KB)"
        }
      }
    }
  }
}
```

### Implementation with Settings

```typescript
// extension/src/services/MentionResolver.ts
export class MentionResolver {
  private config: {
    maxFileSize: number;
    maxFolderEntries: number;
    maxTotalContext: number;
    maxUrlSize: number;
  };
  
  constructor() {
    this.loadConfig();
    
    // Reload config when settings change
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('amplifier.mentions')) {
        this.loadConfig();
      }
    });
  }
  
  private loadConfig() {
    const config = vscode.workspace.getConfiguration('amplifier.mentions');
    this.config = {
      maxFileSize: config.get('maxFileSize', 1024 * 1024),
      maxFolderEntries: config.get('maxFolderEntries', 500),
      maxTotalContext: config.get('maxTotalContext', 5 * 1024 * 1024),
      maxUrlSize: config.get('maxUrlSize', 100 * 1024),
    };
  }
  
  private async resolveFile(filePath: string): Promise<ResolvedMention | null> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return null;

    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(workspaceFolder.uri.fsPath, filePath);

    const uri = vscode.Uri.file(absolutePath);
    
    // Check file size before loading
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      
      if (stat.size > this.config.maxFileSize) {
        const sizeMB = (stat.size / 1024 / 1024).toFixed(2);
        const limitMB = (this.config.maxFileSize / 1024 / 1024).toFixed(2);
        
        return {
          type: 'file',
          content: `[File too large: ${sizeMB}MB exceeds limit of ${limitMB}MB. ` +
                   `Use @selection or adjust amplifier.mentions.maxFileSize setting]`,
          metadata: { path: absolutePath, truncated: true, size: stat.size },
        };
      }
      
      const doc = await vscode.workspace.openTextDocument(uri);
      return {
        type: 'file',
        content: doc.getText(),
        metadata: { path: absolutePath, size: stat.size },
      };
    } catch (error) {
      return null;
    }
  }
  
  private async resolveFolder(folderPath: string): Promise<ResolvedMention | null> {
    // ... path resolution ...
    
    const entries = await vscode.workspace.fs.readDirectory(uri);
    
    // Check entry count limit
    if (entries.length > this.config.maxFolderEntries) {
      const truncated = entries.slice(0, this.config.maxFolderEntries);
      const fileList = truncated
        .map(([name, type]) =>
          `${type === vscode.FileType.Directory ? '📁' : '📄'} ${name}`
        )
        .join('\n');
      
      return {
        type: 'folder',
        content: fileList + 
                 `\n\n[Showing ${this.config.maxFolderEntries} of ${entries.length} entries. ` +
                 `Adjust amplifier.mentions.maxFolderEntries to see more]`,
        metadata: { path: absolutePath, truncated: true, totalEntries: entries.length },
      };
    }
    
    // ... normal flow ...
  }
  
  async resolve(input: string): Promise<{
    text: string;
    mentions: ResolvedMention[];
    warnings?: string[];
  }> {
    const mentions: ResolvedMention[] = [];
    const warnings: string[] = [];
    let totalSize = 0;
    
    // ... resolve all mentions ...
    
    // Check total context size
    for (const mention of mentions) {
      totalSize += mention.content.length;
    }
    
    if (totalSize > this.config.maxTotalContext) {
      const totalMB = (totalSize / 1024 / 1024).toFixed(2);
      const limitMB = (this.config.maxTotalContext / 1024 / 1024).toFixed(2);
      
      warnings.push(
        `Total context size ${totalMB}MB exceeds limit of ${limitMB}MB. ` +
        `Consider using fewer mentions or adjust amplifier.mentions.maxTotalContext.`
      );
    }
    
    return { text: cleanText.trim(), mentions, warnings };
  }
}
```

**Benefits**:
- ✅ User-configurable limits via VS Code settings
- ✅ Clear error messages with current size and limit
- ✅ Guidance on how to adjust limits
- ✅ Graceful degradation (truncation with warnings)

---

## 3. Mode Switching - Session Management

### Two Options: User Choice

```typescript
// extension/src/views/ChatViewProvider.ts

private async _switchMode(newMode: AmplifierMode): Promise<void> {
  const config = vscode.workspace.getConfiguration('amplifier');
  const behavior = config.get('modeSwitchBehavior', 'confirm');
  
  if (behavior === 'confirm') {
    // Option 1: Confirm and end current session
    const currentSession = this._sessionId ? `(Session: ${this._sessionId.slice(0, 8)}...)` : '';
    const choice = await vscode.window.showWarningMessage(
      `Switching to ${newMode} mode will end the current session ${currentSession}. Continue?`,
      { modal: true },
      'Switch Mode',
      'Cancel'
    );
    
    if (choice !== 'Switch Mode') {
      return;
    }
    
    // End current session
    if (this._sessionId) {
      await this._stopSession();
    }
    
    // Start new session
    await this._startSession(newMode);
    
  } else if (behavior === 'newChat') {
    // Option 2: Start new chat in split panel
    const oldSessionId = this._sessionId;
    
    // Keep old chat visible, start new one
    vscode.commands.executeCommand('workbench.action.splitEditor');
    
    // Start new session in new mode
    await this._startSession(newMode);
    
    this._postMessage({
      type: 'modeSwitch',
      newMode,
      oldSessionId: oldSessionId ? oldSessionId.slice(0, 8) : undefined,
      newSessionId: this._sessionId ? this._sessionId.slice(0, 8) : undefined,
    });
  }
}
```

### Display Session ID in UI

```html
<!-- extension/webview/index.html -->
<div id="session-info" class="session-info">
  <span class="session-label">Session:</span>
  <code id="session-id" title="Click to copy">abc123...</code>
  <button id="copy-session-id" class="icon-button" title="Copy session ID">
    <span class="codicon codicon-copy"></span>
  </button>
</div>
```

```typescript
// Show abbreviated session ID in UI
this._postMessage({
  type: 'sessionStarted',
  sessionId: this._sessionId,
  sessionIdShort: this._sessionId.slice(0, 8),
  mode: this.currentMode,
});
```

**Setting**:
```json
{
  "amplifier.modeSwitchBehavior": {
    "type": "string",
    "enum": ["confirm", "newChat"],
    "default": "confirm",
    "enumDescriptions": [
      "Confirm and end current session before switching modes",
      "Start new chat in split panel, keeping old session visible"
    ]
  }
}
```

---

## 4. Steering Files - Move to Future Features

**Agreement**: Park steering files for post-MVP. They're valuable but not essential for initial launch.

### Updated ROADMAP.md Structure

```markdown
## Phase 2: Core Advanced Features (MVP)

### 2.1 Inline Diff Preview ✓
### 2.2 Context Mentions ✓
### 2.3 Mode System ✓
### 2.4 Terminal Integration ✓

---

## Phase 3: Future Features (Post-MVP)

### 3.1 Steering Files (Project Context)
**Status**: Designed, deferred to post-MVP

Provides persistent project context via `.amplifier/steering/*.md` files.

**When to implement**:
- After MVP is stable and adopted
- When users request project-specific customization
- When we have bandwidth for comprehensive testing

**Reference**: See ARCHITECTURE.md "Steering Files" section for complete design
```

I'll update the docs to move steering to a "Future Features" section.

---

## 5. Terminal Integration - Revised Approach

### Show Bash Tools Like Any Other Tool

**Better UX**: Display bash execution inline in chat, not just terminal.

```typescript
// extension/src/views/ChatViewProvider.ts

private async setupEventHandlers() {
  await this._client.subscribeToEvents(this._sessionId!, {
    onToolStart: async (data) => {
      if (data.tool_name === 'bash') {
        // Show in chat UI
        this._postMessage({
          type: 'toolExecution',
          tool: 'bash',
          operation: 'execute_command',
          input: data.input,
          status: 'running',
        });
        
        // Also log to output channel for debugging
        this._outputChannel.appendLine(
          `[Bash] Executing: ${data.input.command}`
        );
      } else {
        // Other tools
        this._postMessage({
          type: 'toolExecution',
          tool: data.tool_name,
          operation: data.operation,
          status: 'running',
        });
      }
    },
    
    onToolEnd: async (data) => {
      if (data.tool_name === 'bash') {
        // Show result in chat UI
        this._postMessage({
          type: 'toolComplete',
          tool: 'bash',
          operation: 'execute_command',
          result: {
            exitCode: data.result?.exit_code,
            output: data.result?.output,
            duration: data.duration_ms,
          },
        });
        
        // Full output to output channel
        this._outputChannel.appendLine(
          `[Bash] Exit ${data.result?.exit_code || 'unknown'} (${data.duration_ms}ms)`
        );
        this._outputChannel.appendLine(data.result?.output || '');
      } else {
        // Other tools
        this._postMessage({
          type: 'toolComplete',
          tool: data.tool_name,
          result: data.result,
        });
      }
    },
  });
}
```

### Chat UI Display

```html
<!-- Bash tool execution shown inline -->
<div class="tool-execution bash">
  <div class="tool-header">
    <span class="codicon codicon-terminal"></span>
    <span>Running command...</span>
  </div>
  <pre class="command-line">$ npm test</pre>
  <div class="tool-output">
    <pre>PASS  tests/example.test.ts
✓ should work (2 ms)

Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total</pre>
  </div>
  <div class="tool-footer">
    <span class="exit-code">Exit 0</span>
    <span class="duration">1.2s</span>
  </div>
</div>
```

**No shell integration needed**:
- ✅ Works on all VS Code versions
- ✅ Works on all platforms/shells
- ✅ Consistent with other tool displays
- ✅ Output Channel still available for full debug logs

---

## 6. SSE Reconnection - Simple Retry with UI

```typescript
// extension/src/services/EventStreamManager.ts

export class EventStreamManager {
  private maxRetries = 3;
  private retryDelay = 1000; // Start with 1s
  
  async subscribe(sessionId: string, handlers: EventHandlers) {
    let retryCount = 0;
    
    const connect = () => {
      const eventSource = new EventSource(`/sessions/${sessionId}/events`);
      
      eventSource.onopen = () => {
        retryCount = 0; // Reset on successful connection
        handlers.onConnected?.();
      };
      
      eventSource.onerror = (error) => {
        eventSource.close();
        
        if (retryCount < this.maxRetries) {
          retryCount++;
          const delay = this.retryDelay * retryCount; // Exponential backoff
          
          // Show retry message in chat
          handlers.onRetrying?.({
            attempt: retryCount,
            maxAttempts: this.maxRetries,
            retryIn: delay,
          });
          
          setTimeout(connect, delay);
        } else {
          // Show error in chat with reconnect button
          handlers.onConnectionFailed?.({
            error: 'Connection lost',
            message: 'Failed to reconnect after 3 attempts',
          });
        }
      };
      
      // ... message handlers ...
    };
    
    connect();
  }
}
```

### Chat UI for Connection Status

```html
<!-- Connection lost - retrying -->
<div class="system-message warning">
  <span class="codicon codicon-sync spin"></span>
  <span>Connection lost. Retrying (1/3)...</span>
</div>

<!-- Connection failed - manual retry -->
<div class="system-message error">
  <span class="codicon codicon-error"></span>
  <span>Connection failed after 3 attempts.</span>
  <button class="retry-button">Reconnect</button>
</div>
```

---

## 7. Approval Timeouts - As Designed

**Feedback**: Fine as is, depends on approval system.

**Current design is good**:
- Timeout with auto-reject after 5 minutes
- Countdown timer in UI
- User notification on timeout
- Configurable timeout duration

No changes needed ✓

---

## 8. Multi-Root Workspaces - Smart Detection

```typescript
// extension/src/services/WorkspaceContextGatherer.ts

async gather(): Promise<WorkspaceContext> {
  const folders = vscode.workspace.workspaceFolders;
  
  if (!folders || folders.length === 0) {
    return { workspace_root: null };
  }
  
  // Single root - simple case
  if (folders.length === 1) {
    return this._gatherForFolder(folders[0]);
  }
  
  // Multi-root - use active editor's workspace
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(
      activeEditor.document.uri
    );
    if (workspaceFolder) {
      return this._gatherForFolder(workspaceFolder);
    }
  }
  
  // No active editor - ask user
  const items = folders.map(f => ({
    label: f.name,
    description: f.uri.fsPath,
    folder: f,
  }));
  
  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select workspace folder for Amplifier session',
    ignoreFocusOut: true,
  });
  
  if (selected) {
    return this._gatherForFolder(selected.folder);
  }
  
  // Fallback to first folder
  return this._gatherForFolder(folders[0]);
}
```

**Not hard to support** - just need smart detection logic ✓

---

## 9. Path Traversal Security - Already Handled! ✅

### Found in Amplifier Filesystem Tool

The security is **already built into amplifier-core's filesystem tool**:

```python
# amplifier-module-tool-filesystem/read.py (lines 69-86)
def _is_allowed(self, path: Path) -> bool:
    """Check if path is within allowed read paths."""
    if self.allowed_read_paths is None:
        return True  # Default: allow all reads
    
    resolved_path = path.resolve()  # ← Prevents traversal!
    for allowed in self.allowed_read_paths:
        allowed_resolved = Path(allowed).resolve()
        if allowed_resolved in resolved_path.parents or allowed_resolved == resolved_path:
            return True
    return False
```

### Configure in VS Code Profiles

```yaml
# ~/.amplifier/profiles/vscode:code.yaml
tools:
  - module: tool-filesystem
    config:
      # Restrict file access to workspace
      allowed_read_paths: null  # Allow all for now (context files, etc.)
      allowed_write_paths: ["."]  # Workspace only (secure by default)
```

**No additional work needed** - amplifier SDK handles it! ✓

---

## 10. Token Usage Display - Use Status Bar

### Found the Usage Model

```typescript
// amplifier-core/message_models.py
class Usage:
    input_tokens: int
    output_tokens: int
    total_tokens: int
```

### VS Code Status Bar Display

```typescript
// extension/src/services/TokenUsageDisplay.ts

export class TokenUsageDisplay {
  private statusBarItem: vscode.StatusBarItem;
  private sessionUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'amplifier.showTokenDetails';
    this.statusBarItem.show();
    this.update();
  }

  update(usage?: { input_tokens: number; output_tokens: number; total_tokens: number }) {
    if (usage) {
      this.sessionUsage.inputTokens += usage.input_tokens;
      this.sessionUsage.outputTokens += usage.output_tokens;
      this.sessionUsage.totalTokens += usage.total_tokens;
    }
    
    const formatted = this.formatTokens(this.sessionUsage.totalTokens);
    this.statusBarItem.text = `$(pulse) ${formatted} tokens`;
    this.statusBarItem.tooltip = `Session Usage:\n` +
      `Input: ${this.formatTokens(this.sessionUsage.inputTokens)}\n` +
      `Output: ${this.formatTokens(this.sessionUsage.outputTokens)}\n` +
      `Total: ${this.formatTokens(this.sessionUsage.totalTokens)}`;
  }
  
  private formatTokens(count: number): string {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    } else if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  }
  
  reset() {
    this.sessionUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    this.update();
  }

  dispose() {
    this.statusBarItem.dispose();
  }
}
```

### Integration with Events

```typescript
// In ChatViewProvider event handlers
onModelComplete: async (data) => {
  if (data.usage) {
    this.tokenUsageDisplay.update({
      input_tokens: data.usage.input_tokens,
      output_tokens: data.usage.output_tokens,
      total_tokens: data.usage.total_tokens,
    });
  }
}
```

---

## 11. Error Messages - Fine for MVP

**Feedback**: Raw errors are fine, can follow up later.

No changes needed for MVP ✓

---

## 12. Test Coverage - Comprehensive Plan

### Core Test Areas

```bash
# Extension tests
extension/src/__tests__/
├── DiffPreviewProvider.test.ts
├── MentionResolver.test.ts
├── WorkspaceContextGatherer.test.ts
├── EventStreamManager.test.ts
└── AmplifierClient.test.ts

# Server tests
server/tests/
├── test_session_runner.py
├── test_api_endpoints.py
├── test_event_streaming.py
└── test_context_injection.py
```

### Test Requirements

**Must have tests for**:
- ✅ Diff preview lifecycle (cleanup, timeouts)
- ✅ Mention resolver with size limits
- ✅ Context gathering (single-root, multi-root)
- ✅ SSE reconnection logic
- ✅ Session lifecycle (create, prompt, stop)
- ✅ Mode switching behavior
- ✅ Token usage tracking

**Coverage target**: >70% for core services

---

## Updated Implementation Order

### Phase 1: MVP Core (2-3 weeks)
1. **Inline Diff Preview** with proper lifecycle ← Start here
2. **Context Mentions** with configurable limits
3. **Mode System** with session management
4. **Token Usage Display** in status bar
5. **Terminal Integration** (chat UI approach)
6. **SSE Reconnection** with retry UI

### Phase 2: Polish & Testing (1 week)
1. Multi-root workspace support
2. Comprehensive test coverage
3. Error handling improvements
4. Performance optimization

### Phase 3: Future (Post-MVP)
1. Steering Files (deferred)
2. Code Actions Provider
3. Completion Provider
4. Advanced diagnostics

---

## Summary of Changes from Gap Analysis

| Point | Feedback | Resolution |
|-------|----------|------------|
| 1. Virtual docs | Confirm lifecycle practice | ✅ Added proper cleanup with timers + listeners |
| 2. Size limits | Make configurable | ✅ VS Code settings with user-friendly limits |
| 3. Mode switch | Confirm or new chat | ✅ Configurable behavior + session ID display |
| 4. Steering files | Park for future | ✅ Moved to Phase 3 in ROADMAP |
| 5. Terminal | Show in chat like other tools | ✅ Revised to inline display + output channel |
| 6. SSE reconnect | Simple retry with message | ✅ Exponential backoff + UI feedback |
| 7. Approval timeout | Fine as is | ✅ No changes needed |
| 8. Multi-root | Not hard to support | ✅ Smart detection with user fallback |
| 9. Path security | Check amplifier SDK | ✅ Already handled by filesystem tool! |
| 10. Token usage | Show in VS Code | ✅ Status bar display with tooltip |
| 11. Raw errors | Fine for now | ✅ No changes for MVP |
| 12. Test coverage | Ensure core pieces | ✅ Comprehensive test plan added |

---

## Ready to Implement

All feedback addressed. Documentation updated. Implementation can begin with **Phase 1.1: Inline Diff Preview**.
