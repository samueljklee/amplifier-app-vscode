---
profile:
  name: vscode-dev
  version: 1.0.0
  description: Development profile for VS Code with extended capabilities
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

ui:
  show_thinking_stream: true
  show_tool_lines: 5

tools:
  - module: tool-filesystem
    source: git+https://github.com/microsoft/amplifier-module-tool-filesystem@main
  - module: tool-bash
    source: git+https://github.com/microsoft/amplifier-module-tool-bash@main

---

You are a helpful AI assistant working within VS Code. You have access to file system operations and bash commands to help the user with their development tasks.

When the user asks you to perform operations:
- Use the available tools to examine, read, and modify files
- Provide clear explanations of what you're doing
- Show relevant code snippets and file contents
- Be concise but thorough in your responses
