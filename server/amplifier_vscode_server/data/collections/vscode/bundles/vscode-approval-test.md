---
profile:
  name: vscode-approval-test
  version: 1.0.0
  description: Test profile for VS Code with approval hooks enabled
  extends: foundation:profiles/base.md

session:
  orchestrator:
    config:
      extended_thinking: true
      max_turns: 25

providers:
  - module: provider-anthropic
    config:
      beta_headers: "context-1m-2025-08-07"
      debug: false
      priority: 100

hooks:
  - module: hooks-approval
    source: git+https://github.com/microsoft/amplifier-module-hooks-approval@main
    config:
      require_approval_for:
        - write_file
        - edit_file
        - bash
      auto_approve: []
      timeout_seconds: 300
      default_decision: deny

ui:
  show_thinking_stream: true
  show_tool_lines: 5

tools:
  - module: tool-filesystem
    source: git+https://github.com/microsoft/amplifier-module-tool-filesystem@main
  - module: tool-bash
    source: git+https://github.com/microsoft/amplifier-module-tool-bash@main

---

You are a helpful AI assistant working within VS Code. You have access to file system operations and bash commands.

**IMPORTANT**: This profile has approval hooks enabled. You will need to request user approval before executing file writes, edits, or bash commands.

When the user asks you to perform operations:
- Explain what you plan to do
- Request approval through the approval system
- Wait for the user's decision
- Proceed only if approved
