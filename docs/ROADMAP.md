# Amplifier VS Code Extension - Implementation Roadmap

> **Last Updated**: 2025-12-11
> **Status**: Planning Phase

This document tracks the implementation roadmap for the Amplifier VS Code extension, including all advanced features.

---

## Phase 1: Core Foundation (MVP) ✅

### 1.1 Extension Scaffold
- [x] VS Code extension boilerplate
- [x] TypeScript configuration
- [x] Basic activation events

### 1.2 Backend Server
- [x] FastAPI server setup
- [x] Health check endpoint
- [x] Server lifecycle management
- [x] Python environment with uv

### 1.3 Chat Interface
- [x] Webview panel provider
- [x] Basic message display
- [x] User input handling
- [x] VS Code theming support

### 1.4 Amplifier Integration
- [x] Session creation API
- [x] Prompt submission
- [x] SSE event streaming
- [x] Profile-based configuration

---

## Phase 2: Advanced Features (In Progress)

### 2.1 Inline Diff Preview

**Priority**: High  
**Effort**: Medium  
**Status**: Designed, not implemented

**Tasks**:
- [ ] Implement `DiffPreviewProvider` service
  - [ ] Register virtual document provider with scheme `amplifier-proposed`
  - [ ] Store proposed content in memory map
  - [ ] Implement `provideTextDocumentContent()`
- [ ] Integrate with event stream
  - [ ] Detect `write_file` tool operations
  - [ ] Intercept before file write
  - [ ] Show diff using `vscode.diff` command
- [ ] User approval flow
  - [ ] Show information message with Accept/Reject/Edit options
  - [ ] Handle "Accept" → apply changes + continue session
  - [ ] Handle "Reject" → skip changes + notify AI
  - [ ] Handle "Edit" → open file in editor for manual changes
- [ ] Add to extension activation
  - [ ] Register provider in `extension.ts`
  - [ ] Pass to `ChatViewProvider`

**Files to Create/Modify**:
- `extension/src/services/DiffPreviewProvider.ts` (new)
- `extension/src/views/ChatViewProvider.ts` (modify event handlers)
- `extension/src/extension.ts` (register provider)

---

### 2.2 Context Mentions

**Priority**: High  
**Effort**: High  
**Status**: Designed, not implemented

**Tasks**:
- [ ] Implement `MentionResolver` service
  - [ ] Define mention patterns (`@file:`, `@folder:`, etc.)
  - [ ] Implement `resolve()` main entry point
  - [ ] Implement `resolveFile()` using `workspace.openTextDocument`
  - [ ] Implement `resolveFolder()` using `workspace.fs.readDirectory`
  - [ ] Implement `resolveSelection()` using `window.activeTextEditor`
  - [ ] Implement `resolveProblems()` using `languages.getDiagnostics`
  - [ ] Implement `resolveGit()` using Git extension API
  - [ ] Implement `resolveUrl()` using `fetch()`
- [ ] Integrate with chat input
  - [ ] Call `mentionResolver.resolve()` in `_sendMessage()`
  - [ ] Build `context_update` object from resolved mentions
  - [ ] Send clean text + context to server
- [ ] Add autocomplete UI
  - [ ] Create mention suggestions dropdown
  - [ ] Trigger on `@` character
  - [ ] Filter based on typed text
  - [ ] Insert selected mention
- [ ] Test all mention types
  - [ ] Unit tests for each resolver
  - [ ] Integration test with chat flow
  - [ ] Error handling for missing files/permissions

**Files to Create/Modify**:
- `extension/src/services/MentionResolver.ts` (new)
- `extension/src/views/ChatViewProvider.ts` (integrate in `_sendMessage()`)
- `extension/webview/main.js` (add autocomplete UI)
- `extension/webview/styles.css` (style mention dropdown)

---

### 2.3 Mode System

**Priority**: Medium  
**Effort**: Medium  
**Status**: Designed, using foundation profiles initially

**Pragmatic Approach**:
- [ ] Use existing `foundation` or `sam-collection` profiles for validation
  - `foundation:dev` for "Code" mode
  - `foundation:general` for "Architect" mode  
  - `foundation:foundation` for "Ask" mode
- [ ] Validate mode switching works with these profiles
- [ ] Iterate on vscode-specific profiles post-validation

**Tasks**:
- [ ] Implement mode switching with foundation profiles
- [ ] Implement mode types and mappings
  - [ ] Define `AmplifierMode` type in `extension/src/types/modes.ts`
  - [ ] Create `MODE_TO_PROFILE` mapping
  - [ ] Create `MODE_INFO` with labels/descriptions/icons
- [ ] Update session management
  - [ ] Modify `_startSession()` to accept mode parameter
  - [ ] Map mode to profile name before API call
  - [ ] Implement `_switchMode()` to stop/restart session
  - [ ] Track `currentMode` in `ChatViewProvider`
- [ ] Add mode selector UI
  - [ ] Add mode buttons to chat panel header
  - [ ] Style with VS Code theme colors
  - [ ] Handle click events → call `_switchMode()`
  - [ ] Show active mode with visual indicator
- [ ] Add VS Code settings
  - [ ] `amplifier.defaultMode` setting
  - [ ] Read setting on extension activation
- [ ] Update server API
  - [ ] Ensure `CreateSessionRequest` accepts `profile` parameter
  - [ ] Server should load requested profile (already implemented)

**Files to Create/Modify**:
- `Bundled with extension: vscode:*.yaml` (new - user setup)
- `extension/src/types/modes.ts` (new)
- `extension/src/views/ChatViewProvider.ts` (add mode logic)
- `extension/webview/index.html` (add mode selector)
- `extension/webview/main.js` (handle mode switching)
- `extension/package.json` (add configuration)

---

### 2.4 Token Usage Display

**Priority**: Medium  
**Effort**: Low  
**Status**: Designed, ready to implement

**Tasks**:
- [ ] Create `TokenUsageDisplay` service
  - [ ] Create status bar item
  - [ ] Implement token formatting (K, M suffixes)
  - [ ] Add tooltip with breakdown
  - [ ] Implement reset on session end
- [ ] Integrate with event stream
  - [ ] Listen for `model:complete` events
  - [ ] Extract usage from event data
  - [ ] Update status bar display
  - [ ] Accumulate session totals
- [ ] Add click handler
  - [ ] Show detailed usage breakdown
  - [ ] Option to copy usage report
- [ ] Testing
  - [ ] Unit tests for token formatting
  - [ ] Integration test with events

**Files to Create/Modify**:
- `extension/src/services/TokenUsageDisplay.ts` (new)
- `extension/src/views/ChatViewProvider.ts` (integrate with events)
- `extension/src/extension.ts` (create and register)

---

### 2.5 Bash Tool Display (Chat UI)

**Priority**: Medium  
**Effort**: Low  
**Status**: Revised approach - display in chat like other tools

**Tasks**:
- [ ] Update event handlers for bash tool
  - [ ] Show "Running command..." in chat UI
  - [ ] Display command being executed
  - [ ] Stream output as it arrives (if available)
  - [ ] Show exit code and duration
- [ ] Add bash-specific UI components
  - [ ] Terminal-style display in chat
  - [ ] Syntax highlighting for commands
  - [ ] Collapsible output section
  - [ ] Copy output button
- [ ] Output channel for debug logs
  - [ ] Log full command execution details
  - [ ] Available via "View Logs" action
- [ ] Testing
  - [ ] Test with successful commands
  - [ ] Test with failed commands (non-zero exit)
  - [ ] Test with long-running commands

**Files to Create/Modify**:
- `extension/src/views/ChatViewProvider.ts` (add bash event handling)
- `extension/webview/main.js` (add bash UI rendering)
- `extension/webview/styles.css` (terminal-style CSS)
- `extension/src/extension.ts` (create output channel)

---

## Phase 3: Future Features (Post-MVP)

### 3.1 Steering Files (Project Context)

**Priority**: Future  
**Effort**: High  
**Status**: Designed, deferred to post-MVP

**Description**: Provides persistent project context via `.amplifier/steering/*.md` files with conditional inclusion based on file patterns.

**When to implement**:
- After MVP is stable and adopted
- When users request project-specific customization
- When we have bandwidth for comprehensive testing

**Reference**: See ARCHITECTURE.md "Steering Files" section for complete design

**High-level tasks**:
- Implement `SteeringLoader` with YAML frontmatter parsing
- Add `inclusion` modes: `always`, `fileMatch`, `manual`
- Integrate with SessionRunner to inject into system prompt
- Add configuration for exclude lists
- Comprehensive testing of pattern matching

---

### 3.2 Improved Chat UI
- [ ] Syntax highlighting in code blocks
- [ ] Copy code button
- [ ] Collapsible tool execution details
- [ ] Message timestamps
- [ ] Typing indicators

### 3.3 Enhanced Status Bar Integration
- [ ] Connection status indicator
- [ ] Current mode display
- [ ] Token usage display (if available)
- [ ] Click to open chat panel

### 3.4 Context Menu Actions
- [ ] "Explain this code" on selection
- [ ] "Fix this problem" on diagnostic
- [ ] "Generate tests" on function/class
- [ ] "Refactor this" on selection

### 3.5 Settings & Configuration
- [ ] API key management UI
- [ ] Server port configuration
- [ ] Auto-start server setting
- [ ] Theme customization
- [ ] Keybindings

---

## Phase 4: Advanced Capabilities

### 4.1 Code Actions Provider
- [ ] Quick fixes powered by Amplifier
- [ ] Refactoring suggestions
- [ ] Integration with VS Code lightbulb

### 4.2 Completion Provider
- [ ] AI-powered code completions
- [ ] Context-aware suggestions
- [ ] Multi-line completions

### 4.3 Diagnostics Provider
- [ ] Custom linting rules
- [ ] Best practice suggestions
- [ ] Security vulnerability detection

### 4.4 Multi-Session Management
- [ ] Multiple concurrent chat sessions
- [ ] Session history/persistence
- [ ] Switch between sessions

---

## Phase 5: Testing & Deployment

### 5.1 Testing
- [ ] Extension unit tests
- [ ] Server unit tests
- [ ] Integration tests
- [ ] E2E tests with Extension Development Host
- [ ] CI/CD pipeline

### 5.2 Documentation
- [ ] User guide / README
- [ ] Video tutorials
- [ ] API reference
- [ ] Troubleshooting guide

### 5.3 Marketplace Preparation
- [ ] Extension icon
- [ ] Marketplace description
- [ ] Screenshots and GIFs
- [ ] Changelog
- [ ] License

### 5.4 Distribution
- [ ] Package extension (.vsix)
- [ ] Publish to VS Code Marketplace
- [ ] GitHub releases
- [ ] Update notifications

---

## Implementation Priority

**High Priority (Phase 2 - MVP)**:
1. **Inline Diff Preview** - Critical UX improvement for file changes
2. **Context Mentions** - Essential for providing explicit context
3. **Mode System** - Useful for different workflows
4. **Token Usage Display** - User visibility into API costs
5. **Bash Tool Display** - Better visibility for command execution

**Future Priority (Phase 3 - Post-MVP)**:
1. **Steering Files** - Enables project-specific customization (deferred)
2. **Chat UI Polish** - Enhanced user experience
3. **Context Menu Actions** - Quick access to common tasks

**Lower Priority (Nice to Have)**:
1. Code Actions Provider
2. Completion Provider
3. Multi-session management

---

## Dependencies & Blockers

### External Dependencies
- **amplifier-core**: Must support profile-based configuration
- **VS Code API**: Requires VS Code 1.93+ for shell integration
- **Python 3.11+**: Required for server
- **Node 18+**: Required for extension

### Known Issues
- Shell integration not available on all platforms/shells
- Git extension API may not be available in all environments
- URL fetching requires network access

---

## Success Metrics

### MVP Success Criteria
- [ ] Extension activates without errors
- [ ] Chat panel opens and displays messages
- [ ] Can create session and send prompts
- [ ] Events stream correctly from server
- [ ] File operations work (read/write)
- [ ] Bash commands execute in terminal

### Phase 2 Success Criteria
- [ ] Diff preview works for all file changes
- [ ] All mention types resolve correctly
- [ ] Mode switching works without errors
- [ ] Steering files load and inject properly
- [ ] Terminal captures command output

### Production Ready Criteria
- [ ] All tests passing
- [ ] Documentation complete
- [ ] No known critical bugs
- [ ] Performance benchmarks met
- [ ] Security audit passed

---

## Notes

- All designs validated against VS Code API documentation
- Implementation follows VS Code extension best practices
- Server architecture reuses amplifier-playground patterns
- Focus on simplicity and reliability over features
