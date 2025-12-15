# VS Code Collection

> **Status**: Scaffolding / Placeholder for future iteration  
> **Current Approach**: Use `sam-collection` or `foundation` profiles for initial validation

This collection will eventually provide profiles optimized for VS Code extension usage.

## Current Implementation Strategy

For initial development and validation, we'll use existing proven profiles:
- Use `sam-collection` profiles if available (recommended for validation)
- Fall back to `foundation:dev`, `foundation:general` for development
- Iterate on vscode-specific profiles after core functionality is validated

## Planned Profiles (Post-Validation)

- **code**: Full development capabilities with all tools enabled
- **architect**: Read-only mode for design and planning  
- **ask**: Conversation-only mode with no tools

## Why This Approach?

1. **Validate core functionality first** - Don't bikeshed profiles before the extension works
2. **Use proven patterns** - `sam-collection` and `foundation` profiles are battle-tested
3. **Iterate later** - Refine vscode-specific profiles once we understand actual usage patterns

## Usage

The scaffolding is in place. To use:
- **Now**: Extension will use `foundation:dev` or `sam-collection:*` profiles
- **Later**: Switch to `vscode:code`, `vscode:architect`, `vscode:ask` after iteration
