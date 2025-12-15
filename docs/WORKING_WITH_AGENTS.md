# Working With AI Agents - Efficiency Guide

> **How to work 3-5x faster with coding agents on this project**

---

## The Problem with "Read Everything First"

### ❌ Inefficient Pattern
```
You: "Read all the docs, understand the project, then implement X"

Agent: *Reads 8,000+ lines of documentation*
       *Rebuilds context from scratch*
       *Starts working 15-20 minutes later*

Result: Massive overhead every session
```

### ✅ Efficient Pattern
```
You: "Do P1.1.* from AGENTS.md, verify build, commit when ready"

Agent: *Checks AGENTS.md for P1.1.* tasks (30 seconds)*
       *Reads relevant section from DEVELOPMENT.md (2 minutes)*
       *Starts implementing immediately*

Result: Working in 3 minutes instead of 20
```

**Why**: AGENTS.md IS the context. No need to rebuild it.

---

## Core Workflow: Execute → Verify → Commit

### The Standard Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. YOU: "Do P1.X.*, verify [criteria], commit when verified"  │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. AGENT: Claims tasks in AGENTS.md                            │
│            Reads implementation patterns from DEVELOPMENT.md    │
│            Implements the tasks                                 │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. AGENT: Automatic Verification                               │
│            - Runs build (npm run compile / uv sync)             │
│            - Runs tests if they exist (npm test / pytest)       │
│            - Shows results                                      │
└─────────────────────────────────────────────────────────────────┘
                               ↓
                    ┌──────────┴──────────┐
                    │  Verification Pass? │
                    └──────────┬──────────┘
                          YES  │  NO
                    ┌──────────┘  └──────────┐
                    ▼                        ▼
┌─────────────────────────────┐  ┌─────────────────────────────┐
│  4a. AGENT: Shows results   │  │  4b. AGENT: Shows error     │
│      "✅ Ready to commit"   │  │      "❌ Build failed: ..."  │
└─────────────────────────────┘  └─────────────────────────────┘
                    │                        │
                    ▼                        ▼
┌─────────────────────────────┐  ┌─────────────────────────────┐
│  5a. YOU: "commit"          │  │  5b. YOU: "fix the [issue]" │
└─────────────────────────────┘  └─────────────────────────────┘
                    │                        │
                    ▼                        │
┌─────────────────────────────┐              │
│  6. AGENT: Creates commit   │              │
│            Updates AGENTS.md│              │
└─────────────────────────────┘              │
                                             │
                                             ↓
                                  [Loop back to step 3]
```

---

## Automatic Verification (Yes!)

### ✅ I Should Always Verify Automatically

**Standard verification includes**:
- ✅ Build passes (npm run compile, uv sync)
- ✅ Tests pass (if tests exist for that component)
- ✅ No obvious errors in output
- ✅ Basic smoke test where applicable

**I show you**:
```
✅ Extension scaffold complete:
   - 7 files created
   - npm install: 145 packages installed
   - TypeScript compilation: 0 errors
   - Ready to commit
```

**You don't need to ask** - I verify by default.

### When You Need Manual Validation

**Keyword**: `"bring it to [environment] so I can test"`

```
You: "Do P1.2.*, verify activation, but bring it to Extension Host so I can test manually"

Me: *Implements*
    *Verifies build*
    "✅ Build passes. To test manually:
     1. Press F5 in VS Code
     2. Check status bar shows 'Amplifier'
     3. Try Cmd+Shift+P → 'Amplifier: Show Chat'
     
     Test it and let me know if you want to commit."
```

---

## Commit Control: Your Choice

### Option 1: Manual Commit (Safer, Default)

**Pattern**:
```
Me: "✅ [Task complete, verification passed]"
You: "commit"  ← You control when to commit
Me: *Creates commit, updates AGENTS.md*
```

**Use when**:
- Learning the system
- High-risk changes
- Want to review before committing

### Option 2: Auto-Commit (Faster)

**Keyword**: `"and commit if verified"` or `"auto-commit when tests pass"`

**Pattern**:
```
You: "Do P1.1.*, verify build, and commit if verified"

Me: *Implements*
    *Verifies automatically*
    *Commits automatically if verification passes*
    "✅ Committed: feat: Phase 1.1 - project scaffolding
     Files: 7 created, build passes, tests pass"
```

**Use when**:
- Low-risk scaffolding
- Patterns are proven
- Fast iteration needed

### Option 3: Batch Commit (After Multiple Tasks)

**Keyword**: `"batch commit"` or `"commit all when verified"`

**Pattern**:
```
You: "Do P1.1.* through P1.3.*, verify each, batch commit at the end"

Me: *Implements P1.1.* → verifies ✅*
    *Implements P1.2.* → verifies ✅*
    *Implements P1.3.* → verifies ✅*
    "All tasks complete and verified. Ready to batch commit:
     - P1.1.*: Extension scaffold
     - P1.2.*: Extension entry point
     - P1.3.*: Server skeleton"

You: "commit"

Me: *Creates single commit for all changes*
```

**Use when**:
- Logically related tasks
- Want clean commit history
- All tasks form one feature

---

## Keywords for Different Flows

### Task Execution Keywords

| You Say | I Do |
|---------|------|
| `"Do P1.X.*"` | Execute all tasks in group |
| `"Do P1.X.1-4"` | Execute specific range |
| `"Run in parallel: ..."` | Spawn multiple agents |

### Verification Keywords

| You Say | I Do |
|---------|------|
| `"verify [criteria]"` | Run verification, show results, WAIT |
| `"auto-commit if verified"` | Verify AND commit if passes |
| `"bring to [env] to test"` | Verify build, provide manual test instructions |

### Commit Keywords

| You Say | I Do |
|---------|------|
| `"commit"` | Create commit, update AGENTS.md |
| `"batch commit"` | Wait to collect multiple changes, then commit all |
| `"don't commit yet"` | Skip commit, leave changes staged |
| `"commit and push"` | Commit + push to remote |

---

## Recommended Workflow for This Project

### Phase 1: Foundation (Velocity Mode + Manual Commits)

```
Session 1:
You: "Do P1.1.*, verify build works, show me the results"
Me: *implements, verifies, shows results*
You: "commit"  ← Manual control while learning

Session 2:
You: "Do P1.2.* and P1.3.* in parallel, verify both, show results"
Me: *spawns 2 agents, both verify, shows results*
You: "commit both"

Session 3:
You: "Do P1.4.*, verify server starts, auto-commit if verified"
Me: *implements, verifies, commits automatically*  ← Faster as you gain trust
```

### Phase 2: Session Management (Mix Manual + Auto)

```
# Clear patterns → auto-commit
You: "Do P2.1.* (TS types), auto-commit if compiles"

# Integration points → manual review
You: "Do P2.4.* (SessionRunner), verify session creates, show me before committing"
```

---

## Task Acceptance Criteria (In AGENTS.md)

### Should AGENTS.md Include Verification Criteria?

**✅ YES - Makes automation better**

### Current Format (Basic)
```markdown
| P1.1.1 | Create extension/ directory structure | None | modular-builder | ☐ |
```

### Enhanced Format (With Acceptance Criteria)
```markdown
| P1.1.1 | Create extension/ directory structure | None | modular-builder | ☐ |
         Acceptance: Directory exists with src/, dist/, resources/ subdirs

| P1.1.2 | Create extension/package.json | None | modular-builder | ☐ |
         Acceptance: Valid JSON, "vscode" engine >= 1.85.0, compiles

| P1.2.1 | Create extension/src/extension.ts | P1.1.* | modular-builder | ☐ |
         Acceptance: Activates in Extension Host, commands registered, no errors
```

**Benefits**:
1. I know what "verified" means for each task
2. I can auto-verify against these criteria
3. You can say "auto-commit if acceptance criteria met"
4. Clear definition of "done"

**Should we update AGENTS.md?** 
- ✅ Add acceptance criteria to critical tasks
- ⏸️ Don't need it for every task (some are obvious)
- ✅ Especially useful for integration points

---

## Profile Instructions vs AGENTS.md

### AGENTS.md (Task-Level)
```markdown
**Task**: P1.2.4 - Implement initializeExtension()

**Acceptance Criteria**:
- Prerequisite check runs on activation
- Status bar shows correct state (starting/ready/error/no-key)
- Server starts if autoStart is true
- Errors are user-friendly

**Verification**: 
- Launch Extension Host (F5)
- Should see status bar with "Starting..." then "Ready"
- Check Output panel for no errors
```

### Sam-Collection Profile (Workflow-Level)

**Could add system instruction**:
```markdown
## Working on amplifier-app-vscode

When implementing tasks from AGENTS.md:
1. Read task and acceptance criteria
2. Implement following patterns in DEVELOPMENT.md
3. Verify against acceptance criteria
4. Show verification results
5. Wait for explicit commit unless "auto-commit" requested

Always verify builds/tests before reporting completion.
```

**My recommendation**: 
- ✅ Add acceptance criteria to AGENTS.md (task-specific)
- ✅ Add workflow instructions to sam-collection profile (general behavior)
- ✅ Both work together for optimal flow

---

## Proposed Enhancement to AGENTS.md

### Add "Verification" Column

```markdown
| ID | Task | Acceptance Criteria | Agent | Status |
|----|------|---------------------|-------|--------|
| P1.1.2 | Create package.json | Valid JSON, vscode engine, compiles | modular-builder | ☐ |
| P1.2.1 | Create extension.ts | Extension activates, F5 works | modular-builder | ☐ |
| P1.3.4 | /health endpoint | curl localhost:8765/health returns 200 | modular-builder | ☐ |
```

**Then you can say**:
```
You: "Do P1.1.2, auto-commit if acceptance criteria met"
Me: *Creates package.json*
    *Verifies: Valid JSON ✅, vscode engine ✅, compiles ✅*
    *Auto-commits because all criteria met*
```

---

## Keywords Reference Card

### Execution Control

```bash
# Basic
"Do P1.X.*"                    → Execute, verify, WAIT for commit

# Auto-commit
"Do P1.X.*, auto-commit"       → Execute, verify, commit if pass
"Do P1.X.* and commit if verified" → Same

# Manual validation
"Do P1.X.*, bring to [env]"    → Execute, verify build, provide test instructions

# Batch
"Do P1.X.* through P1.Y.*"     → Execute multiple, verify each, WAIT
"Do P1.X-Y.*, batch commit"    → Execute all, verify all, commit once
```

### Verification Control

```bash
# Automatic (default)
"verify build"                 → npm compile / pytest check
"verify tests"                 → npm test / pytest
"verify [it works]"            → Run appropriate checks

# Manual
"show me the output"           → Display verification results
"let me test it first"         → Provide manual test instructions
```

### Parallel Execution

```bash
"Run in parallel:              → Spawn multiple agents
 1. modular-builder: P1.X.*
 2. modular-builder: P1.Y.*"

"Do P1.X.* and P1.Y.* in parallel" → Same, more concise
```

---

## Recommended Setup

### 1. Update AGENTS.md (Add Acceptance Criteria)

For critical tasks, add acceptance criteria:

```markdown
### Phase 1: Foundation

#### P1.1 - Project Scaffolding
| ID | Task | Acceptance | Dependencies | Agent | Status |
|----|------|-----------|--------------|-------|--------|
| P1.1.1 | Create extension/ structure | Directory with src/, dist/, resources/ | None | modular-builder | ☐ |
| P1.1.2 | Create package.json | Valid JSON, vscode engine >= 1.85.0, npm install works | None | modular-builder | ☐ |
| P1.1.3 | Create tsconfig.json | Valid JSON, compiles without errors | P1.1.2 | modular-builder | ☐ |
```

**Then you can use**:
```
You: "Do P1.1.*, auto-commit if acceptance criteria met"
```

### 2. Add Workflow to Sam-Collection Profile

**Optional**: Add to your sam-collection profile:

```markdown
## When Working on amplifier-app-vscode

Tasks are defined in AGENTS.md with acceptance criteria.

**Standard workflow**:
1. Read task from AGENTS.md
2. Implement following DEVELOPMENT.md patterns
3. **Always verify against acceptance criteria**:
   - Run builds (npm compile / uv sync)
   - Run tests (npm test / pytest)
   - Check for errors
4. Show verification results
5. **Wait for explicit commit** unless "auto-commit" requested
6. Update AGENTS.md when task complete

**Commit only when**:
- User says "commit", OR
- User said "auto-commit if verified" AND verification passed

Never commit without verification.
```

---

## My Recommendation

### For This Project

**Use a hybrid approach**:

1. **AGENTS.md**: Add acceptance criteria to integration points
   - Phase 1.2 (extension activation)
   - Phase 1.3 (server health check)
   - Phase 1.6 (integration tests)
   - Phase 2 integration points

2. **Your Commands**: Be explicit about commit control
   ```
   # When learning (Phases 1-2):
   "Do P1.X.*, verify, show results"  → Manual commit
   
   # When confident (Phases 3-4):
   "Do P3.X.*, auto-commit if verified" → Auto commit
   ```

3. **I Verify Automatically**: Always
   - Run builds
   - Run tests
   - Show results
   - BUT wait for your commit command (unless you said auto-commit)

---

## Proposed Workflow Automation

### Level 1: Manual Everything (Learning Phase)
```
You: "Do P1.1.1"
Me: *creates directory, verifies*
    "✅ Directory created"
You: "commit"
```

**Use**: First few tasks while learning

### Level 2: Auto-Verify (Recommended Default)
```
You: "Do P1.1.*"
Me: *implements all tasks*
    *verifies automatically*
    "✅ All tasks complete:
     - 7 files created
     - npm install: success
     - TypeScript: 0 errors
     Ready to commit"
You: "commit"
```

**Use**: Most of the project (90% of tasks)

### Level 3: Auto-Commit (Fast Iteration)
```
You: "Do P1.1.*, auto-commit if verified"
Me: *implements*
    *verifies*
    *commits automatically*
    "✅ Committed: feat: Phase 1.1 - scaffolding
     Next: P1.2.*"
```

**Use**: Low-risk tasks (scaffolding, config files, obvious patterns)

### Level 4: Batch Commit (Clean History)
```
You: "Do P1.1.* through P1.3.*, verify each, batch commit at end"
Me: *implements all*
    *verifies each*
    *waits for commit*
    "✅ All verified:
     - P1.1.*: ✅ Build passes
     - P1.2.*: ✅ Extension activates  
     - P1.3.*: ✅ Health endpoint works
     Ready for batch commit"
You: "commit"
Me: *Single commit for entire phase*
```

**Use**: Logically grouped work (entire phase, entire feature)

---

## Command Templates

### Copy-Paste Ready

```bash
# Scaffolding (auto-verify, manual commit)
"Do P1.1.*, verify build, show results"

# Feature implementation (auto-verify, auto-commit)
"Do P2.1.*, auto-commit if verified"

# Integration point (auto-verify, manual test, manual commit)
"Do P1.2.*, verify build, bring to Extension Host for testing"

# Parallel work (auto-verify, manual commit)
"Run in parallel:
 1. modular-builder: P1.X.*
 2. modular-builder: P1.Y.*
Verify both, show results"

# Batch commit (auto-verify, batch commit)
"Do P1.1.* through P1.3.*, verify each, batch commit when all done"

# Debugging (manual everything)
"This error happened: [paste]. Debug it, explain the fix, don't commit yet"
```

---

## Enhanced AGENTS.md Structure

### Proposed Addition

Add this section to AGENTS.md:

```markdown
## Task Verification Standards

**Default verification** (I do this automatically for every task):
- ✅ Files created/modified as expected
- ✅ Build passes (npm compile / uv sync)
- ✅ Basic tests pass (if exist)
- ✅ No obvious errors

**Task-specific acceptance criteria** (listed in task table):
- See "Acceptance" column for each task
- I verify against these before reporting complete

**Commit control**:
- **Default**: I verify, show results, wait for your "commit"
- **Auto-commit**: Say "auto-commit if verified" and I'll commit when checks pass
- **Batch commit**: Say "batch commit" and I'll wait to commit multiple tasks together
```

### Example Enhanced Task Table

```markdown
#### P1.2 - Extension Entry Point

| ID | Task | Acceptance | Dependencies | Agent | Status |
|----|------|-----------|--------------|-------|--------|
| P1.2.1 | Create extension.ts | Exports activate/deactivate, no errors | P1.1.* | modular-builder | ☐ |
| P1.2.2 | Register commands | All commands in package.json registered | P1.2.1 | modular-builder | ☐ |
| P1.2.3 | Create StatusBarItem | Shows in status bar, click opens chat | P1.2.1 | modular-builder | ☐ |
| P1.2.4 | Implement initializeExtension | Checks pass, server starts, status updates | P1.2.1, P1.4.6 | modular-builder | ☐ |

**Phase Acceptance**: Press F5 → Extension activates → Status bar appears → No errors in Output panel
```

---

## Example Session with Keywords

### Session 1: Scaffolding (Learning)
```
You: "Do P1.1.*, verify build, show results"
Me: ✅ [implements, verifies, shows output]
You: "commit"
Me: ✅ [commits, updates AGENTS.md]
```

### Session 2: Entry Point (Gaining Confidence)  
```
You: "Do P1.2.*, verify activation, bring to Extension Host so I can test"
Me: ✅ [implements, verifies build, provides test instructions]
You: [tests manually with F5]
You: "works, commit"
Me: ✅ [commits]
```

### Session 3: Server Skeleton (Confident)
```
You: "Do P1.3.*, auto-commit if health endpoint returns 200"
Me: ✅ [implements, verifies with curl, commits automatically]
    "✅ Committed: feat: Phase 1.3 - server skeleton
     curl localhost:8765/health → 200 OK"
```

### Session 4: Batch (Efficient)
```
You: "Do P1.4.* through P1.5.*, verify each, batch commit"
Me: ✅ [implements all, verifies all]
    "All complete:
     - P1.4.*: ServerManager ✅
     - P1.5.*: CredentialsManager ✅
     Ready to batch commit"
You: "commit"
Me: ✅ [single commit for both]
```

---

## Summary

### ✅ **Automatic Verification** (Always)
I should **always verify** automatically:
- Run builds
- Run tests  
- Check for errors
- Show results

**You don't need to ask** - this is default behavior.

### 🎮 **Commit Control** (Your Choice)

You control commits via keywords:
- **Default**: `"verify [criteria]"` → I wait for your "commit"
- **Auto**: `"auto-commit if verified"` → I commit when checks pass
- **Batch**: `"batch commit"` → I wait to commit multiple tasks together

### 📋 **Acceptance Criteria** (Recommended)

Add to AGENTS.md for critical tasks:
- Integration points
- Phase boundaries  
- Complex features

Makes auto-commit safe and clear.

---

## Next Steps

1. **Try velocity mode**: 
   ```
   "Do P1.1.*, auto-commit if build passes"
   ```

2. **See if you like auto-commit** for scaffolding tasks

3. **Switch to manual commit** for integration points:
   ```
   "Do P1.2.*, bring to Extension Host for testing"
   ```

4. **Optional**: Update AGENTS.md with acceptance criteria for Phase 1.2+

**Want me to create an updated AGENTS.md with acceptance criteria for Phase 1?** Or start implementing with current structure?
