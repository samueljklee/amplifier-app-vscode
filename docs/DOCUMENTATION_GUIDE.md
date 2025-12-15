# Documentation Guide

> Clear purpose for each document in this project

---

## For Contributors: Where to Look

### Starting Out?
1. **README.md** - Project overview, quick start
2. **AGENTS.md** - Task coordination (if you're an agent/contributor)
3. **docs/DEVELOPMENT.md** - Setup and implementation guide

### Need Architecture/Design Info?
- **docs/ARCHITECTURE.md** - System architecture, VS Code APIs, design decisions
- **docs/API_REFERENCE.md** - Complete REST API and SSE event specifications

### Working on Implementation?
- **AGENTS.md** - Task lists, dependencies, what to work on next
- **docs/DEVELOPMENT.md** - Code examples, patterns, setup instructions
- **docs/ROADMAP.md** - High-level phases and milestones

### Strategic Decisions?
- **docs/PROFILE_ITERATION_PLAN.md** - Why we're using foundation profiles initially
- **docs/archive/** - Historical context of design decisions

---

## Document Purposes

### Root Level

#### README.md
- **Purpose**: User-facing project overview
- **Audience**: End users, potential users, GitHub visitors
- **Content**: Features, installation, quick start, configuration
- **Maintained by**: Humans (user documentation)

#### AGENTS.md
- **Purpose**: Agent task coordination and progress tracking
- **Audience**: AI agents (zen-architect, modular-builder, bug-hunter, etc.)
- **Content**: Task lists, dependencies, parallel work, active/completed tasks
- **Maintained by**: Agents (updated as work progresses)
- **Authority**: THIS is the authoritative task list

### docs/ Directory

#### ARCHITECTURE.md (79KB)
- **Purpose**: System architecture and design specifications
- **Audience**: Developers understanding the system
- **Content**: 
  - VS Code API integration patterns
  - Amplifier core integration
  - Two-tier architecture (TypeScript + Python)
  - Event streaming (SSE)
  - Security considerations
  - Advanced features design (inline diff, mentions, modes)
- **Maintained by**: zen-architect agent (design decisions)
- **Authority**: Authoritative for design and architecture
- **Does NOT contain**: Task lists, implementation steps

#### API_REFERENCE.md (18KB)
- **Purpose**: Complete REST API and SSE event specification
- **Audience**: Developers implementing client or server
- **Content**:
  - All REST endpoints
  - Request/response formats
  - SSE event types
  - Error codes
  - TypeScript type definitions
- **Maintained by**: zen-architect agent (API design)
- **Authority**: Authoritative API contract

#### DEVELOPMENT.md (57KB)
- **Purpose**: Implementation guide with code examples
- **Audience**: Developers implementing features
- **Content**:
  - Setup instructions (Node, Python, uv)
  - Complete code examples for all major components
  - SessionRunner implementation
  - Event streaming implementation
  - Webview provider examples
  - Testing structure
- **Maintained by**: modular-builder agent (implementation patterns)
- **Authority**: Authoritative for "how to implement"
- **Does NOT contain**: Task breakdowns (that's AGENTS.md)

#### ROADMAP.md (12KB)
- **Purpose**: High-level phases and milestones
- **Audience**: Project stakeholders, planning
- **Content**:
  - Phase 1: Foundation (MVP)
  - Phase 2: Advanced Features
  - Phase 3: Future Features
  - Implementation priorities
  - Success criteria
- **Maintained by**: Humans (strategic planning)
- **Relationship to AGENTS.md**: ROADMAP is high-level phases, AGENTS.md is detailed tasks

#### PROFILE_ITERATION_PLAN.md (5KB)
- **Purpose**: Strategy for profile development
- **Audience**: Developers working on profiles
- **Content**:
  - Why we're using foundation profiles initially
  - When and how to iterate on vscode-specific profiles
  - Profile design considerations
- **Maintained by**: Humans (strategic decisions)

#### DOCUMENTATION_VALIDATION.md (13KB)
- **Purpose**: Validation report and cleanup recommendations
- **Audience**: Project maintainers
- **Content**:
  - Accuracy validation results
  - Redundancy analysis
  - Cleanup recommendations applied
- **Maintained by**: Validation agents
- **Status**: Reference document (completed validation)

### docs/archive/ Directory

Historical documents from design validation phase (Dec 2025). **Not actively maintained.**

- **GAP_ANALYSIS.md** - Initial gap identification
- **IMPLEMENTATION_PLAN.md** - Solutions for gaps
- **DOCUMENTATION_FIXES.md** - Record of fixes applied

**Purpose**: Show design evolution, useful for understanding "why" behind decisions.

---

## Document Separation of Concerns

### Clear Boundaries

**ARCHITECTURE.md** = System Design
- What components exist
- How they interact
- What patterns we follow
- Why we made design choices

**DEVELOPMENT.md** = Implementation Guide
- How to set up dev environment
- Code examples for each component
- Patterns to follow when implementing
- Testing structure

**AGENTS.md** = Task Coordination
- What tasks need to be done
- What order to do them in
- What can be done in parallel
- What's blocked, what's complete

**ROADMAP.md** = Strategic Planning
- What phases exist
- What's in each phase
- What's prioritized
- Success metrics

### Intentional Overlap

Small amounts of overlap are OK when needed for context:
- ARCHITECTURE.md may reference implementation phases for context
- DEVELOPMENT.md may reference architecture concepts to explain code
- AGENTS.md may reference architecture for task context

The key: **Each doc has ONE clear authority area.**

---

## Maintenance Rules

### When to Update Which Doc

**Situation** → **Update This Doc**

- Completed a task → `AGENTS.md` (mark task complete)
- Made a design decision → `ARCHITECTURE.md` (document the decision)
- Changed API contract → `API_REFERENCE.md` (update spec)
- Added implementation pattern → `DEVELOPMENT.md` (add example)
- Changed project phases → `ROADMAP.md` (update milestones)
- User-facing feature change → `README.md` (update features list)

### What NOT to Update

- **docs/archive/** - Never update (frozen historical record)
- **DOCUMENTATION_VALIDATION.md** - Reference only (validation is complete)

---

## For AI Agents

### Your Primary Document: AGENTS.md

This is where you coordinate work with other agents:
1. Check task lists for what needs to be done
2. Claim tasks by moving them to "Active Tasks" with your agent name
3. Complete tasks and mark them done
4. Update Open Questions if you encounter blockers

### When You Need Context

- **Architecture question?** → Read `ARCHITECTURE.md`
- **How to implement something?** → Read `DEVELOPMENT.md`
- **What's the API contract?** → Read `API_REFERENCE.md`
- **What phase are we in?** → Check `ROADMAP.md`

### When You Update Docs

- **Made a design change?** → Update `ARCHITECTURE.md`
- **Created new implementation pattern?** → Update `DEVELOPMENT.md`
- **Changed the API?** → Update `API_REFERENCE.md`
- **Completed task?** → Update `AGENTS.md`

---

## Summary

| Document | Authority For | Size | Active? |
|----------|---------------|------|---------|
| README.md | User documentation | 8KB | ✅ Yes |
| AGENTS.md | **Task coordination** | 23KB | ✅ Yes |
| docs/ARCHITECTURE.md | System design | 79KB | ✅ Yes |
| docs/API_REFERENCE.md | API contracts | 18KB | ✅ Yes |
| docs/DEVELOPMENT.md | Implementation | 57KB | ✅ Yes |
| docs/ROADMAP.md | Phases/milestones | 12KB | ✅ Yes |
| docs/PROFILE_ITERATION_PLAN.md | Profile strategy | 5KB | ✅ Yes |
| docs/DOCUMENTATION_VALIDATION.md | Validation report | 13KB | 📚 Reference |
| docs/archive/* | Historical design | 54KB | 📁 Archived |

**Total Active Documentation**: 212KB across 7 active docs + 1 reference + 1 archive

**Clear separation of concerns** ✅  
**No task overlap** ✅  
**Ready for implementation** ✅
