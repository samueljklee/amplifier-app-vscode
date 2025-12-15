---
profile:
  name: vscode-test
  version: 1.0.0
  description: Test profile for VS Code with minimal config for quick validation

session:
  orchestrator:
    module: loop-streaming
    source: git+https://github.com/microsoft/amplifier-module-loop-streaming@main
  
  context:
    module: context-simple
    source: git+https://github.com/microsoft/amplifier-module-context-simple@main

providers:
  - module: provider-anthropic
    source: git+https://github.com/microsoft/amplifier-module-provider-anthropic@main
    config:
      model: claude-3-5-sonnet-20241022

tools:
  - module: tool-bash
    source: git+https://github.com/microsoft/amplifier-module-tool-bash@main

ui:
  show_thinking_stream: false
---

Test profile - minimal configuration.
