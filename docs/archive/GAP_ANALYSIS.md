# Gap Analysis - Pre-Implementation Review

> **Date**: 2025-12-11
> **Purpose**: Identify gaps, risks, and missing considerations before implementing advanced features

---

## 🚨 Critical Gaps

### 1. Diff Preview - Race Conditions & Cleanup

**Gap**: Virtual document provider cleanup not properly handled

**Issue**:
- Multiple rapid file changes could create memory leaks
- Virtual URIs stored in Map but only cleaned up after user decision
- What if user closes diff tab without accepting/rejecting?
- What if session ends while diff is open?

**Solution Needed**:
```typescript
class DiffPreviewProvider {
  private proposedContents = new Map<string, string>();
  private activeDiffs = new Map<string, { cleanup: () => void }>();
  
  // Need to add:
  // 1. Timeout cleanup (30s if no user action)
  // 2. Listen to document close events
  // 3. Session end cleanup
  
  dispose() {
    // Clean up all active diffs
    for (const [uri, data] of this.activeDiffs) {
      data.cleanup();
    }
    this.activeDiffs.clear();
    this.proposedContents.clear();
  }
}
```

**Action Items**:
- [ ] Add `vscode.workspace.onDidCloseTextDocument` listener
- [ ] Implement timeout cleanup for abandoned diffs
- [ ] Add cleanup on session end
- [ ] Add max concurrent diffs limit (prevent memory issues)

---

### 2. Context Mentions - File Size Limits

**Gap**: No size limits on resolved content

**Issue**:
- `@file:` could load multi-GB files into memory
- `@url:` currently has 10KB limit but could crash on large responses
- `@folder:` could list thousands of files
- No limits on total context size when multiple mentions combined

**Solution Needed**:
```typescript
private async resolveFile(filePath: string): Promise<ResolvedMention | null> {
  const uri = vscode.Uri.file(absolutePath);
  const stat = await vscode.workspace.fs.stat(uri);
  
  // Add size check
  const MAX_FILE_SIZE = 1024 * 1024; // 1MB
  if (stat.size > MAX_FILE_SIZE) {
    return {
      type: 'file',
      content: `[File too large: ${(stat.size / 1024 / 1024).toFixed(2)}MB. Consider using @selection instead]`,
      metadata: { path: absolutePath, truncated: true },
    };
  }
  
  const doc = await vscode.workspace.openTextDocument(uri);
  return { type: 'file', content: doc.getText(), metadata: { path: absolutePath } };
}
```

**Action Items**:
- [ ] Add file size check before loading (1MB limit)
- [ ] Add folder entry count limit (max 500 files)
- [ ] Add total context size check across all mentions (5MB total)
- [ ] Show user warnings when content truncated
- [ ] Add configuration for size limits

---

### 3. Mode System - Session State During Mode Switch

**Gap**: Unclear what happens to session state when switching modes

**Issue**:
- Current session is stopped when switching modes
- What happens to conversation history?
- What happens to pending tool approvals?
- What happens to active file operations?

**Solution Needed**:
```typescript
private async _switchMode(newMode: AmplifierMode): Promise<void> {
  // Need to add:
  // 1. Save conversation history before stopping
  // 2. Cancel pending operations gracefully
  // 3. Notify user about state loss
  // 4. Option to preserve context in new session
  
  const shouldContinue = await vscode.window.showWarningMessage(
    'Switching modes will end the current session. Continue?',
    { modal: true },
    'Switch Mode',
    'Cancel'
  );
  
  if (shouldContinue !== 'Switch Mode') {
    return;
  }
  
  // Save history for potential restore
  const history = this._chatHistory;
  
  if (this._sessionId) {
    await this._stopSession();
  }
  
  // Start new session
  await this._startSession(newMode);
  
  // Optional: Summarize previous context
  if (history.length > 0) {
    this._postMessage({
      type: 'modeSwitch',
      previousMode: this.currentMode,
      historyLength: history.length,
    });
  }
}
```

**Action Items**:
- [ ] Add user confirmation dialog before mode switch
- [ ] Implement conversation history preservation
- [ ] Handle pending approvals gracefully (auto-reject? notify?)
- [ ] Add "Continue conversation in new mode" option
- [ ] Document mode switch behavior in UI

---

### 4. Steering Files - Circular Inclusion & YAML Parsing

**Gap**: No protection against circular includes or malformed YAML

**Issue**:
- If steering file has invalid YAML, entire session fails to start
- No validation of frontmatter structure
- No protection against excessively large steering files
- Pattern matching could be slow on large file paths

**Solution Needed**:
```python
class SteeringLoader:
    MAX_STEERING_SIZE = 100 * 1024  # 100KB per file
    MAX_TOTAL_SIZE = 500 * 1024      # 500KB total
    
    def _parse_frontmatter(self, content: str, file_path: Path) -> tuple[dict, str]:
        # Add size check
        if len(content) > self.MAX_STEERING_SIZE:
            logger.warning(f"Steering file too large: {file_path}")
            return {}, content[:self.MAX_STEERING_SIZE]
        
        if not content.startswith("---\n"):
            return {}, content
        
        end_index = content.find("\n---\n", 4)
        if end_index == -1:
            return {}, content
        
        frontmatter_str = content[4:end_index]
        body = content[end_index + 5:].strip()
        
        try:
            metadata = yaml.safe_load(frontmatter_str) or {}
            
            # Validate metadata structure
            if not isinstance(metadata, dict):
                logger.warning(f"Invalid frontmatter in {file_path}: not a dict")
                return {}, content
            
            # Validate inclusion value
            inclusion = metadata.get("inclusion", "always")
            if inclusion not in ["always", "fileMatch", "manual"]:
                logger.warning(f"Invalid inclusion mode in {file_path}: {inclusion}")
                metadata["inclusion"] = "always"
            
            return metadata, body
            
        except yaml.YAMLError as e:
            logger.error(f"YAML parse error in {file_path}: {e}")
            # Treat entire file as content if YAML invalid
            return {}, content
```

**Action Items**:
- [ ] Add file size limits for steering files
- [ ] Add YAML validation with fallback
- [ ] Add validation for inclusion modes
- [ ] Add total steering content size limit
- [ ] Add unit tests for malformed steering files
- [ ] Add logging for skipped/invalid steering files

---

### 5. Terminal Integration - Platform Differences

**Gap**: Shell integration availability varies by platform

**Issue**:
- Shell integration requires VS Code 1.93+
- Not all shells support integration (cmd.exe, older bash)
- Different platforms have different default shells
- Output capture fails silently on unsupported shells

**Solution Needed**:
```typescript
class TerminalManager {
  private shellIntegrationSupported: boolean | undefined;
  
  async initialize() {
    // Check VS Code version
    const vscodeVersion = vscode.version;
    const [major, minor] = vscodeVersion.split('.').map(Number);
    
    if (major === 1 && minor < 93) {
      this.shellIntegrationSupported = false;
      vscode.window.showWarningMessage(
        'Shell integration requires VS Code 1.93+. Command output will not be captured.',
        'Learn More'
      );
    }
  }
  
  async executeCommand(command: string, cwd: string): Promise<{
    exitCode: number | undefined;
    output: string;
    captureAvailable: boolean;
  }> {
    // ... existing code ...
    
    if (this.amplifierTerminal.shellIntegration) {
      // Full output capture
      return { exitCode, output, captureAvailable: true };
    } else {
      // Fallback - no capture
      this.amplifierTerminal.sendText(command, true);
      
      // Show warning on first use
      if (this.shellIntegrationSupported === undefined) {
        this.shellIntegrationSupported = false;
        vscode.window.showInformationMessage(
          'Shell integration not available. Commands will run but output cannot be captured.',
          'OK'
        );
      }
      
      return {
        exitCode: undefined,
        output: '[Output capture not available - shell integration disabled]',
        captureAvailable: false,
      };
    }
  }
}
```

**Action Items**:
- [ ] Add VS Code version detection
- [ ] Add shell integration capability detection
- [ ] Show user-friendly warnings when capture unavailable
- [ ] Add fallback instructions for unsupported shells
- [ ] Test on Windows (PowerShell, cmd.exe), macOS (zsh, bash), Linux (bash, fish)
- [ ] Document shell integration requirements

---

## ⚠️ Important Gaps

### 6. Event Stream - Reconnection Logic

**Gap**: No reconnection handling for SSE disconnects

**Issue**:
- Network issues could drop SSE connection
- Server restart drops all connections
- No retry logic
- User gets stuck with dead session

**Solution Needed**:
```typescript
class EventStreamManager {
  private maxRetries = 3;
  private retryCount = 0;
  
  subscribe(sessionId: string, handlers: EventHandlers) {
    const eventSource = new EventSource(`/sessions/${sessionId}/events`);
    
    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        setTimeout(() => {
          this.subscribe(sessionId, handlers); // Reconnect
        }, 1000 * this.retryCount); // Exponential backoff
      } else {
        handlers.onError?.({
          error: 'Connection lost',
          message: 'Failed to reconnect to session after 3 attempts',
        });
      }
    };
  }
}
```

**Action Items**:
- [ ] Add SSE reconnection logic with exponential backoff
- [ ] Add connection state indicator in UI
- [ ] Add "Reconnect" button in case of failure
- [ ] Handle server restart gracefully
- [ ] Test network interruption scenarios

---

### 7. Approval Flow - Timeout Handling

**Gap**: No timeout for approval requests

**Issue**:
- AI waits indefinitely for approval
- User could forget about approval dialog
- Session hangs if user walks away
- No way to auto-reject after timeout

**Solution Needed**:
```typescript
private async _handleApprovalRequest(data: ApprovalRequestEvent) {
  const APPROVAL_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  
  const timeoutPromise = new Promise<'timeout'>((resolve) => {
    setTimeout(() => resolve('timeout'), APPROVAL_TIMEOUT);
  });
  
  const userChoicePromise = this._showApprovalDialog(data);
  
  const result = await Promise.race([userChoicePromise, timeoutPromise]);
  
  if (result === 'timeout') {
    // Auto-reject after timeout
    await this._client.submitApproval(this._sessionId!, 'Reject');
    
    vscode.window.showWarningMessage(
      'Approval request timed out after 5 minutes. Operation rejected.',
      'OK'
    );
  } else {
    await this._client.submitApproval(this._sessionId!, result);
  }
}
```

**Action Items**:
- [ ] Add timeout for approval requests (5 min default)
- [ ] Add countdown timer in approval UI
- [ ] Add configuration for timeout duration
- [ ] Auto-reject on timeout with notification
- [ ] Test timeout behavior

---

### 8. Workspace Context - Multi-Root Workspaces

**Gap**: Only handles single workspace folder

**Issue**:
- Users can have multi-root workspaces
- Context gatherer assumes `workspaceFolders[0]`
- File paths could be in different roots
- Git info might differ per root

**Solution Needed**:
```typescript
class WorkspaceContextGatherer {
  async gather(): Promise<WorkspaceContext> {
    const folders = vscode.workspace.workspaceFolders;
    
    if (!folders || folders.length === 0) {
      return { workspace_root: null };
    }
    
    // Handle multi-root workspaces
    if (folders.length > 1) {
      // Use active editor's workspace folder if available
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor) {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(
          activeEditor.document.uri
        );
        if (workspaceFolder) {
          return this._gatherForFolder(workspaceFolder);
        }
      }
      
      // Fallback: ask user which root to use
      const selected = await vscode.window.showQuickPick(
        folders.map(f => ({ label: f.name, folder: f })),
        { placeHolder: 'Select workspace folder for Amplifier session' }
      );
      
      if (selected) {
        return this._gatherForFolder(selected.folder);
      }
    }
    
    return this._gatherForFolder(folders[0]);
  }
}
```

**Action Items**:
- [ ] Add multi-root workspace detection
- [ ] Add workspace folder selection dialog
- [ ] Handle file paths across different roots
- [ ] Test multi-root workspace scenarios
- [ ] Document multi-root behavior

---

## 📝 Minor Gaps

### 9. Security - Path Traversal in Mentions

**Gap**: No validation that resolved paths stay within workspace

**Issue**:
- `@file:../../../etc/passwd` could access system files
- Need to validate paths are within workspace bounds
- Symbolic links could escape workspace

**Solution**:
```typescript
private async resolveFile(filePath: string): Promise<ResolvedMention | null> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) return null;

  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(workspaceFolder.uri.fsPath, filePath);

  // Validate path is within workspace
  const normalizedPath = path.normalize(absolutePath);
  const normalizedWorkspace = path.normalize(workspaceFolder.uri.fsPath);
  
  if (!normalizedPath.startsWith(normalizedWorkspace)) {
    vscode.window.showWarningMessage(
      `Cannot access file outside workspace: ${filePath}`
    );
    return null;
  }
  
  // Continue with file reading...
}
```

**Action Items**:
- [ ] Add path validation for all file operations
- [ ] Block access outside workspace boundaries
- [ ] Handle symbolic links securely
- [ ] Add security tests for path traversal

---

### 10. Performance - Context Size Explosion

**Gap**: No limits on total context sent to AI

**Issue**:
- Multiple mentions + steering files + workspace context could exceed model limits
- No token counting before sending
- Could hit API rate limits or token limits
- User has no visibility into context size

**Solution**:
```typescript
private async _sendMessage(text: string): Promise<void> {
  const { text: cleanText, mentions } = await this.mentionResolver.resolve(text);
  
  // Estimate total context size (rough estimate)
  let totalChars = cleanText.length;
  for (const mention of mentions) {
    totalChars += mention.content.length;
  }
  
  // Add workspace context size
  const context = await this._contextGatherer.gather();
  totalChars += JSON.stringify(context).length;
  
  // Rough token estimate (1 token ~= 4 chars)
  const estimatedTokens = totalChars / 4;
  
  const MAX_CONTEXT_TOKENS = 100000; // 100k tokens
  
  if (estimatedTokens > MAX_CONTEXT_TOKENS) {
    const shouldContinue = await vscode.window.showWarningMessage(
      `Context size is very large (~${Math.round(estimatedTokens)} tokens). This may be slow or fail. Continue?`,
      'Send Anyway',
      'Reduce Context'
    );
    
    if (shouldContinue !== 'Send Anyway') {
      return;
    }
  }
  
  await this._client.submitPrompt(this._sessionId, cleanText, contextUpdate);
}
```

**Action Items**:
- [ ] Add context size estimation
- [ ] Add warnings for large context
- [ ] Add configuration for max context size
- [ ] Show token usage in status bar
- [ ] Consider context compression/summarization

---

### 11. Error Messages - User-Friendly Explanations

**Gap**: Technical errors exposed to users without context

**Issue**:
- Server 500 errors shown raw
- Python stack traces in UI
- Network errors not user-friendly
- No actionable guidance

**Solution**:
```typescript
private async _handleError(error: any) {
  let userMessage = 'An error occurred';
  let details = error.message || String(error);
  let actions: string[] = [];
  
  // Categorize errors
  if (error.code === 'ECONNREFUSED') {
    userMessage = 'Cannot connect to Amplifier server';
    details = 'The server may not be running';
    actions = ['Start Server', 'Check Logs'];
  } else if (error.status === 401) {
    userMessage = 'Authentication failed';
    details = 'Your API key may be invalid or expired';
    actions = ['Update API Key', 'View Settings'];
  } else if (error.status === 429) {
    userMessage = 'Rate limit exceeded';
    details = 'Too many requests to the AI provider';
    actions = ['Wait and Retry', 'Check Usage'];
  } else if (error.status >= 500) {
    userMessage = 'Server error';
    details = 'The Amplifier server encountered an error';
    actions = ['Retry', 'View Server Logs'];
  }
  
  const choice = await vscode.window.showErrorMessage(
    `${userMessage}: ${details}`,
    ...actions
  );
  
  if (choice === 'View Server Logs') {
    this._outputChannel.show();
  }
  // Handle other actions...
}
```

**Action Items**:
- [ ] Add error categorization and friendly messages
- [ ] Add actionable suggestions for each error type
- [ ] Add "View Logs" action for debugging
- [ ] Test all error paths
- [ ] Document common errors and solutions

---

## 🔍 Testing Gaps

### 12. Missing Test Scenarios

**Gaps in test coverage**:

1. **Diff Preview**:
   - [ ] Multiple concurrent diffs
   - [ ] Very large file diffs
   - [ ] Binary file handling
   - [ ] User closes diff without choosing
   - [ ] Session ends during diff

2. **Context Mentions**:
   - [ ] Mention resolution failures
   - [ ] Invalid file paths
   - [ ] Permission denied scenarios
   - [ ] Network timeouts for URLs
   - [ ] Git extension not installed

3. **Mode System**:
   - [ ] Mode switch with active operations
   - [ ] Mode switch with pending approvals
   - [ ] Profile load failures
   - [ ] Invalid profile names

4. **Steering Files**:
   - [ ] Missing .amplifier directory
   - [ ] Malformed YAML files
   - [ ] Very large steering files
   - [ ] Pattern matching edge cases
   - [ ] Unicode in steering content

5. **Terminal Integration**:
   - [ ] Long-running commands
   - [ ] Commands that require input
   - [ ] Commands with large output (>1GB)
   - [ ] Terminal closed during execution
   - [ ] Multiple concurrent command executions

---

## 📊 Summary

### Critical Gaps (Must Fix Before Launch)
1. Diff preview cleanup and race conditions
2. File size limits for mentions and steering
3. Mode switch state management
4. YAML validation for steering files
5. Terminal platform compatibility

### Important Gaps (Fix Before Beta)
6. SSE reconnection logic
7. Approval timeout handling
8. Multi-root workspace support
9. Path traversal security
10. Context size limits

### Minor Gaps (Can Fix Post-Launch)
11. Error message improvements
12. Comprehensive test coverage

### Recommended Next Steps
1. **Phase 1**: Fix critical gaps (1-5)
2. **Phase 2**: Implement features with important gaps addressed (6-10)
3. **Phase 3**: Polish with minor gap fixes (11-12)
4. **Phase 4**: Add comprehensive tests throughout

---

## 📋 Action Plan

### Before Starting Implementation
- [ ] Review this gap analysis with team
- [ ] Prioritize which gaps to address first
- [ ] Add gap fixes to ROADMAP.md task lists
- [ ] Update DEVELOPMENT.md with security guidelines
- [ ] Create test plan for each feature

### During Implementation
- [ ] Address critical gaps in initial implementation
- [ ] Add TODOs for minor gaps to fix later
- [ ] Document known limitations in code comments
- [ ] Test edge cases as you go

### Before Beta Release
- [ ] All critical gaps fixed
- [ ] Most important gaps addressed
- [ ] Test coverage >70%
- [ ] Documentation includes known limitations
- [ ] Error handling tested end-to-end
