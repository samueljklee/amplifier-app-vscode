# 👋 Start Here - Amplifier VS Code Extension

> **Quick navigation for contributors and agents**

---

## 🎯 Ready to Implement?

**Status**: ✅ **100% Ready** - All design complete, gaps resolved, documentation validated

**Start implementing**: See [Task Coordination](#for-ai-agents-task-coordination) below

---

## 📚 Documentation Map

### For Humans (Project Understanding)

1. **README.md** ← Start here for project overview
   - What the extension does
   - Features and capabilities
   - Installation and quick start

2. **docs/ARCHITECTURE.md** ← Understand the design
   - System architecture (TypeScript + Python)
   - VS Code API integration
   - Amplifier core integration
   - Event streaming (SSE)

3. **docs/DEVELOPMENT.md** ← Set up and implement
   - Development environment setup
   - Complete code examples
   - Implementation patterns
   - Testing structure

### For AI Agents (Task Coordination)

**Primary Document**: `AGENTS.md`

This is THE authoritative task list. Everything you need to coordinate work:
- ✅ 100+ tasks broken down with dependencies
- ✅ Parallel work opportunities identified  
- ✅ Task claiming and progress tracking
- ✅ Design decisions and blockers

**How to use AGENTS.md**:
1. Check task backlog for unclaimed tasks
2. Respect dependencies (see task description)
3. Claim task by moving to "Active Tasks" with your agent name
4. Complete task and mark with [x]
5. Document any decisions made

### Additional Resources

| Document | When to Read |
|----------|--------------|
| **docs/API_REFERENCE.md** | Implementing client or server API |
| **docs/ROADMAP.md** | Understanding phases and priorities |
| **docs/PROFILE_ITERATION_PLAN.md** | Working on profiles |
| **docs/DOCUMENTATION_GUIDE.md** | Understanding doc structure |
| **docs/archive/** | Historical context (optional) |

---

## 🚀 Quick Start for Implementation

### Step 1: Understand the Goal
Read: `README.md` (5 min)

### Step 2: Understand the Architecture  
Read: `docs/ARCHITECTURE.md` sections 1-3 (15 min)

### Step 3: Set Up Environment
Follow: `docs/DEVELOPMENT.md` "Prerequisites" and "Project Setup" (30 min)

### Step 4: Claim Your First Task
Open: `AGENTS.md` → Find task in Phase 1.1 → Claim it → Start building

---

## 🤖 For AI Agents: Task Coordination

### Your Primary Workflow

```
1. Open AGENTS.md
2. Find unclaimed task in backlog
3. Check dependencies (listed in task description)
4. Move task to "Active Tasks" with @agent-type
5. Implement (use DEVELOPMENT.md for patterns)
6. Mark complete [x] and update timestamp
7. Document decisions in "Design Decisions" section
```

### When You Need Context

| Question | Document to Check |
|----------|------------------|
| "How does this component work?" | `docs/ARCHITECTURE.md` |
| "How do I implement this?" | `docs/DEVELOPMENT.md` |
| "What's the API contract?" | `docs/API_REFERENCE.md` |
| "What phase are we in?" | `docs/ROADMAP.md` |

### Parallel Work Opportunities

See `AGENTS.md` lines 419-438 for complete parallel work breakdown:

**Phase 1**:
- 2 agents can work simultaneously (extension vs server)

**Phase 2**:  
- 2 agents can work simultaneously (client vs server)

**Phase 4**:
- 2 agents can work simultaneously (features vs testing)

---

## 🗂️ Document Authority

Each document has ONE clear authority area:

| Document | Authoritative For |
|----------|-------------------|
| **AGENTS.md** | Tasks, progress, coordination |
| **docs/ARCHITECTURE.md** | System design, patterns |
| **docs/API_REFERENCE.md** | API contracts |
| **docs/DEVELOPMENT.md** | Implementation guide |
| **docs/ROADMAP.md** | Phases, milestones |

**Rule**: When in doubt about tasks → Check AGENTS.md  
**Rule**: When in doubt about design → Check ARCHITECTURE.md

---

## ✅ Project Status

**Design**: ✅ Complete  
**Validation**: ✅ Complete (98% accuracy)  
**Gaps**: ✅ All resolved  
**Documentation**: ✅ Organized and clear  
**Code**: ⏳ Ready to start (no code yet)  
**Readiness**: ✅ **100% Ready**

---

## 📋 What's Been Done

- ✅ Complete architecture designed
- ✅ VS Code APIs validated
- ✅ Amplifier integration validated
- ✅ 100+ tasks broken down
- ✅ All critical gaps identified and resolved
- ✅ Profile strategy established
- ✅ Documentation organized
- ✅ Historical docs archived

---

## 🎯 Next Action

**For Humans**: Review AGENTS.md to understand task breakdown, then start Phase 1

**For AI Agents**: 
```bash
# Open AGENTS.md
# Claim first available task from Phase 1.1
# Start implementing
```

**First parallel tasks available**:
- P1.1.1-4 (Extension scaffold) - Can assign to modular-builder #1
- P1.1.5-6 (Server scaffold) - Can assign to modular-builder #2

Let's build this! 🚀
