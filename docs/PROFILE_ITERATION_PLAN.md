# VS Code Profile Iteration Plan

> **Philosophy**: Validate core functionality first, then iterate on profiles

---

## Current Approach (Phase 1: Validation)

### Use Proven Profiles

**For initial development**, use existing battle-tested profiles:

1. **sam-collection** (recommended if available):
   - `sam-collection:dev`
   - `sam-collection:general`
   - `sam-collection:foundation`

2. **foundation** (fallback):
   - `foundation:dev` - Full development capabilities
   - `foundation:general` - General-purpose, more conservative
   - `foundation:foundation` - Minimal foundation

### Mode Mapping (Phase 1)

```typescript
export const MODE_TO_PROFILE: Record<AmplifierMode, string> = {
  code: 'foundation:dev',        // or 'sam-collection:dev'
  architect: 'foundation:general',
  ask: 'foundation:foundation',
};
```

### Why This Approach?

1. **Don't bikeshed before validation** - Profiles are complex; get core working first
2. **Use proven patterns** - These profiles are battle-tested in amplifier-playground
3. **Learn from usage** - Understand actual patterns before optimizing
4. **Focus on core value** - Extension architecture, SSE streaming, VS Code integration

---

## Future Approach (Phase 2: Iteration)

### After Core Functionality Validated

Once the extension works end-to-end:
1. Chat panel with streaming ✅
2. Session management ✅
3. Mode switching ✅
4. Tool execution visible ✅

### Then Create vscode-specific Profiles

**Location**: `server/amplifier_vscode_server/data/collections/vscode/profiles/`

### Profile Design Considerations

#### vscode:code
**Goals**:
- Optimize for VS Code workspace context
- Include VS Code-specific tools if created
- Tune token limits for typical editing sessions
- Configure approval gates for file operations

**Example considerations**:
```yaml
session:
  context:
    config:
      max_tokens: 150000  # Tune based on actual usage
      compact_threshold: 0.9  # Be aggressive to stay within limits

tools:
  - module: tool-filesystem
    config:
      allowed_write_paths: ["."]  # Workspace only
      # Should we pre-approve read operations?
      # Should we batch approval requests?
  
hooks:
  - module: hooks-approval
    config:
      # What operations should auto-approve?
      # What should always require approval?
```

#### vscode:architect
**Goals**:
- Read-only safety for planning phase
- Maybe allow search/web but block filesystem writes
- Optimize for code analysis vs code generation

#### vscode:ask
**Goals**:
- Fastest responses (no tool overhead)
- Maybe use faster model (haiku vs sonnet)?
- Optimize for quick Q&A

### Iteration Process

1. **Collect usage data**:
   - What tools are used most?
   - What context sizes are typical?
   - What approval patterns emerge?
   - What errors are common?

2. **Create initial vscode profiles**:
   - Start with foundation profiles as base
   - Add vscode-specific tweaks
   - Test with real usage

3. **Iterate based on feedback**:
   - Token limits too low? Increase
   - Too many approval prompts? Tune gates
   - Tools missing? Add them
   - Tools unused? Remove them

4. **Document decisions**:
   - Why these specific settings?
   - What tradeoffs were made?
   - What patterns did we observe?

---

## Implementation Steps

### Phase 1 (Now): Use Foundation Profiles

1. **Extension code**:
   ```typescript
   // src/types/modes.ts
   export const MODE_TO_PROFILE: Record<AmplifierMode, string> = {
     code: 'foundation:dev',
     architect: 'foundation:general',
     ask: 'foundation:foundation',
   };
   ```

2. **Test with these profiles**:
   - Validate session creation works
   - Validate profile loading works
   - Validate mode switching works
   - Validate tools execute properly

3. **Document learnings**:
   - What worked well?
   - What was missing?
   - What was confusing?
   - What should change?

### Phase 2 (Later): Create vscode Profiles

1. **Design session** (after validation):
   - Review usage patterns
   - Identify vscode-specific needs
   - Design profile configs
   - Write profile markdown files

2. **Implementation**:
   - Create profiles in `server/data/collections/vscode/profiles/`
   - Update `MODE_TO_PROFILE` mapping
   - Test with real usage
   - Iterate based on feedback

3. **Documentation**:
   - Document profile decisions
   - Update user guide
   - Add profile comparison

---

## Scaffolding Already in Place

The structure is ready for when you iterate:

```
server/amplifier_vscode_server/data/collections/vscode/
├── pyproject.toml
├── README.md (updated with current approach)
└── profiles/
    └── .gitkeep (placeholder for future profiles)
```

### To Switch Later

Simply:
1. Create `code.md`, `architect.md`, `ask.md` in profiles/
2. Update `MODE_TO_PROFILE` mapping in extension code
3. Test and iterate

---

## Key Takeaway

**Focus on core functionality first**. Profiles are important but secondary to:
1. Extension activation and server startup
2. Session management and SSE streaming  
3. Chat panel UI and user experience
4. Tool execution visibility
5. Approval flow

Once those work, profile optimization becomes obvious from actual usage patterns.

**Don't let profile design block implementation.** ✅
