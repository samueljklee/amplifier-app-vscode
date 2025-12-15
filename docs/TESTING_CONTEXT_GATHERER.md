# Testing Context Gatherer (P2.7)

Quick guide to manually test the ContextGatherer service.

---

## Setup: Add Debug Logging

First, let's add temporary logging to see what context is being gathered.

**In `ChatViewProvider.ts`, update `_startSession()` around line 143:**

```typescript
// Gather workspace context
const context = await this._gatherContext();

// 🔍 ADD THIS DEBUG LOGGING:
console.log('=== CONTEXT GATHERED ===');
console.log('Workspace Root:', context.workspace_root);
console.log('Open Files:', context.open_files?.length || 0, 'files');
context.open_files?.forEach((f, i) => {
    console.log(`  [${i}] ${f.path} (${f.language}) - ${f.content.length} chars`);
    if (f.cursor_position) {
        console.log(`      Cursor: line ${f.cursor_position.line}, char ${f.cursor_position.character}`);
    }
});
console.log('Git State:', context.git_state ? 'Available' : 'Not available');
if (context.git_state) {
    console.log('  Branch:', context.git_state.branch);
    console.log('  Staged:', context.git_state.staged_files.length);
    console.log('  Modified:', context.git_state.modified_files.length);
    console.log('  Untracked:', context.git_state.untracked_files.length);
}
console.log('Selection:', context.selection ? `"${context.selection.text.substring(0, 50)}..."` : 'None');
console.log('Diagnostics:', context.diagnostics?.length || 0, 'issues');
console.log('========================');
```

**Then rebuild:**
```bash
cd extension
npx webpack --mode development
```

---

## Test 1: Workspace Root Detection (P2.7.2)

**Steps:**
1. Open a workspace folder in VS Code (File → Open Folder)
2. Press F5 to launch Extension Development Host
3. Open the Amplifier chat panel (click Amplifier icon in sidebar)
4. Set API key (if not already set)
5. Type a message and send it

**Expected in Console:**
```
=== CONTEXT GATHERED ===
Workspace Root: /Users/samule/repo/your-project
...
```

**Verify:**
- ✅ Path matches the folder you opened
- ✅ Path is absolute, not relative

---

## Test 2: Open Files Collection (P2.7.3)

**Setup:**
1. Open 3-5 different files in tabs
2. Make sure at least 2 are visible (split editor)
3. Click in one file to make it active

**Steps:**
1. Send a message in Amplifier chat
2. Check the console

**Expected in Console:**
```
Open Files: 3 files
  [0] src/main.ts (typescript) - 1523 chars
      Cursor: line 42, char 15
  [1] src/utils.ts (typescript) - 892 chars
  [2] README.md (markdown) - 2341 chars
```

**Verify:**
- ✅ Visible editors appear first
- ✅ Active editor has cursor position
- ✅ Language IDs are correct (typescript, javascript, python, etc.)
- ✅ Content length is reasonable
- ✅ Limited to ~5 files (even if more are open)

---

## Test 3: Git State Collection (P2.7.4)

**Setup:**
1. Open a git repository
2. Make some changes:
   ```bash
   echo "test" >> test.txt
   git add test.txt
   echo "another" >> README.md
   ```
3. Check current state:
   ```bash
   git status
   git branch
   ```

**Steps:**
1. Send a message in Amplifier chat
2. Check the console

**Expected in Console:**
```
Git State: Available
  Branch: main
  Staged: 1
  Modified: 1
  Untracked: 0
```

**Verify:**
- ✅ Branch name matches `git branch --show-current`
- ✅ Staged count matches `git diff --cached --name-only | wc -l`
- ✅ Modified count matches `git diff --name-only | wc -l`

**Test Non-Git Folder:**
1. Open a folder that's NOT a git repo
2. Send a message

**Expected:**
```
Git State: Not available
```

---

## Test 4: Selection Context (P2.7.5)

**Setup:**
1. Open a file
2. Select some text (highlight 2-3 lines)

**Steps:**
1. **With selection active**, send a message in Amplifier chat
2. Check the console

**Expected in Console:**
```
Selection: "function test() {\n    return 42;\n}..."
```

**Verify:**
- ✅ Shows first 50 chars of selected text
- ✅ Includes the actual selected text

**Test No Selection:**
1. Click somewhere without selecting text
2. Send a message

**Expected:**
```
Selection: None
```

---

## Test 5: Diagnostics Collection (P2.7.6)

**Setup:**
1. Create a file with errors:
   ```typescript
   // test.ts
   const x: number = "not a number";  // Type error
   console.log(undefinedVariable);    // Reference error
   ```
2. Wait for TypeScript to show errors in Problems panel
3. Verify errors appear: View → Problems (should show 2 errors)

**Steps:**
1. Send a message in Amplifier chat
2. Check the console

**Expected in Console:**
```
Diagnostics: 2 issues
```

**Verify:**
- ✅ Count matches Problems panel
- ✅ Errors appear before warnings (sorted by severity)

**Check Full Payload:**
Add this to see full diagnostic details:
```typescript
context.diagnostics?.forEach((d, i) => {
    console.log(`  [${i}] ${d.severity}: ${d.path}:${d.range.start.line} - ${d.message.substring(0, 50)}`);
});
```

**Expected:**
```
  [0] error: test.ts:1 - Type 'string' is not assignable to type 'number'
  [1] error: test.ts:2 - Cannot find name 'undefinedVariable'
```

---

## Test 6: Relative Paths (Helper Function)

**Setup:**
1. Open workspace: `/Users/samule/repo/my-project`
2. Open files in subdirectories

**Expected in Console:**
```
  [0] src/components/Button.tsx (typescriptreact) - ...
  [1] tests/unit/button.test.ts (typescript) - ...
```

**Verify:**
- ✅ Paths are relative to workspace root
- ✅ No leading `/` or `./`
- ✅ Uses forward slashes even on Windows

**Test File Outside Workspace:**
1. Open a file outside the workspace folder
2. Send a message

**Expected:**
```
  [0] /Users/samule/Documents/notes.md (markdown) - ...
```

**Verify:**
- ✅ Absolute path used for files outside workspace

---

## Quick Test: All Features at Once

**Setup the perfect test scenario:**

1. **Open a git repo** with some changes
2. **Open 3-4 files** in the editor
3. **Create a syntax error** in one file
4. **Select some text** (2-3 lines)
5. **Send a message** in Amplifier chat

**Expected Console Output:**
```
=== CONTEXT GATHERED ===
Workspace Root: /Users/samule/repo/amplifier-app-vscode
Open Files: 4 files
  [0] extension/src/services/ContextGatherer.ts (typescript) - 10523 chars
      Cursor: line 105, char 22
  [1] extension/src/providers/ChatViewProvider.ts (typescript) - 18948 chars
  [2] AGENTS.md (markdown) - 40921 chars
  [3] docs/TESTING_CONTEXT_GATHERER.md (markdown) - 5123 chars
Git State: Available
  Branch: main
  Staged: 0
  Modified: 2
  Untracked: 1
Selection: "async getOpenFiles(maxFiles: number = 10): P..."
Diagnostics: 1 issues
========================
```

---

## Verification Checklist

Use this to verify ContextGatherer is working correctly:

- [ ] **P2.7.2** - Workspace root shows correct absolute path
- [ ] **P2.7.3** - Open files collected (visible editors prioritized)
- [ ] **P2.7.3** - Cursor positions included for active editors
- [ ] **P2.7.3** - Limited to ~5 files maximum
- [ ] **P2.7.4** - Git state collected when available
- [ ] **P2.7.4** - Branch, staged, modified, untracked files detected
- [ ] **P2.7.4** - Graceful when no git repo (returns undefined)
- [ ] **P2.7.5** - Selection captured when text is highlighted
- [ ] **P2.7.5** - Returns undefined when no selection
- [ ] **P2.7.6** - Diagnostics collected from Problems panel
- [ ] **P2.7.6** - Sorted by severity (errors first)
- [ ] **P2.7.6** - Limited to ~20 diagnostics
- [ ] **Helper** - Relative paths for files in workspace
- [ ] **Helper** - Absolute paths for files outside workspace

---

## Troubleshooting

### No context logged?
- Make sure you added the debug logging code
- Rebuild with `npx webpack --mode development`
- Reload the Extension Development Host (Cmd+R)

### Git state always "Not available"?
- Check if folder is a git repo: `git status` in terminal
- Make sure VS Code's Git extension is enabled
- Try reloading VS Code

### Open files shows 0?
- Open some actual files in tabs
- Make sure they're not "Untitled" documents
- Check they have `file://` scheme (not `untitled://`)

### Diagnostics shows 0?
- Create actual syntax errors in code
- Check Problems panel (View → Problems)
- Wait a few seconds for language server to analyze

---

## Clean Up

**When done testing**, remove the debug logging:

```typescript
// Remove the console.log lines from ChatViewProvider.ts
// Just keep:
const context = await this._gatherContext();
```

**Rebuild:**
```bash
cd extension
npx webpack --mode development
```

---

## Next Steps

Once you've verified ContextGatherer works:
1. Test with different workspace types (mono-repo, empty folder, etc.)
2. Test with different file types (Python, JavaScript, Markdown, etc.)
3. Test with large workspaces (context should still be limited)
4. Verify context is sent in session creation (check Network tab in DevTools)
