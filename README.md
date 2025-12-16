# Amplifier VS Code Extension

Native AI assistance within Visual Studio Code, powered by the [Amplifier](https://github.com/microsoft/amplifier) modular AI agent framework.

## Overview

The Amplifier VS Code extension brings the full power of Amplifier's modular architecture directly into your IDE. Configure AI behaviors through profiles and collections, leverage powerful tools for code analysis and generation, and maintain full control with approval gates for sensitive operations.

## Features

- **Chat Panel**: Interactive AI chat in the sidebar with streaming responses
- **Code Actions**: Lightbulb actions to explain, improve, or fix code
- **Completions**: AI-powered code completions (experimental)
- **Diagnostics**: AI-detected issues in the Problems panel
- **Profile Support**: Switch between different AI configurations
- **Approval Gates**: Confirm sensitive operations before execution
- **Real-time Streaming**: See AI thinking and tool execution in real-time

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│           VS Code Extension (TypeScript)                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │ Chat     │ │ Code     │ │ Complete │ │ Diagnos  │      │
│  │ Panel    │ │ Actions  │ │ Provider │ │ Provider │      │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘      │
│       └────────────┴────────────┴────────────┘             │
│                        │ HTTP + SSE                        │
└────────────────────────┼───────────────────────────────────┘
                         ▼
┌────────────────────────────────────────────────────────────┐
│           Python Backend Server (FastAPI)                   │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Session Management │ SSE Events │ Profile Loading   │  │
│  └─────────────────────────────────────────────────────┘  │
│                         │                                  │
│  ┌─────────────────────────────────────────────────────┐  │
│  │               amplifier-core (kernel)                │  │
│  │  Providers │ Tools │ Hooks │ Orchestrators │ Context │  │
│  └─────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

## Requirements

- VS Code 1.85.0 or higher
- Python 3.11 or higher
- Node.js 18.x or higher (for development)

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X)
3. Search for "Amplifier"
4. Click Install

### From VSIX

```bash
code --install-extension amplifier-vscode-0.1.0.vsix
```

## Quick Start

1. **Install the extension**
2. **Configure your API key** (for cloud providers):
   ```bash
   export ANTHROPIC_API_KEY="your-key"
   # or
   export OPENAI_API_KEY="your-key"
   ```
3. **Open the Amplifier panel** (click the icon in the Activity Bar)
4. **Start chatting!**

## Configuration

### VS Code Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `amplifier.enabled` | `true` | Enable Amplifier |
| `amplifier.server.autoStart` | `true` | Auto-start backend server |
| `amplifier.server.port` | `8765` | Backend server port |
| `amplifier.profile` | `"dev"` | Default profile |
| `amplifier.features.inlineChat` | `true` | Enable chat panel |
| `amplifier.features.codeActions` | `true` | Enable code actions |
| `amplifier.features.completions` | `false` | Enable AI completions |
| `amplifier.features.diagnostics` | `true` | Enable AI diagnostics |

### Profiles

Amplifier supports profiles for different AI configurations:

- **Foundation**: Minimal tools, basic capabilities
- **dev**: Full development tools (filesystem, bash, web, search)
- **full**: All tools and extended capabilities

Select a profile via settings or the status bar.

## Usage

### Chat Panel

1. Click the Amplifier icon in the Activity Bar
2. Type your question or request
3. Press Enter or click Send
4. Watch the AI think and respond in real-time

### Code Actions

1. Select code in the editor
2. Click the lightbulb or press Ctrl+. (Cmd+.)
3. Choose an Amplifier action:
   - **Explain with Amplifier**: Get an explanation of the code
   - **Improve with Amplifier**: Suggest improvements
   - **Fix with Amplifier**: Fix detected issues

### Commands

| Command | Description |
|---------|-------------|
| `Amplifier: Show Chat` | Open the chat panel |
| `Amplifier: Start Server` | Start the backend server |
| `Amplifier: Stop Server` | Stop the backend server |
| `Amplifier: Explain Selection` | Explain selected code |
| `Amplifier: Improve Selection` | Improve selected code |

## Development

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for complete development setup and implementation details.

### Quick Setup

```bash
# Clone
git clone https://github.com/microsoft/amplifier-app-vscode.git
cd amplifier-app-vscode

# Extension
cd extension
npm install
npm run watch

# Server
cd ../server
uv sync --dev

# Run
# Press F5 in VS Code to launch Extension Development Host
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md) - System architecture and design
- [API Reference](docs/API_REFERENCE.md) - REST API documentation
- [Development Guide](docs/DEVELOPMENT.md) - Development setup and phases

## Security

- **Local-only server**: Backend runs on `127.0.0.1` by default
- **No credential storage**: Uses environment variables or VS Code secrets
- **Approval gates**: Sensitive operations require user confirmation
- **Content Security Policy**: Webviews use strict CSP
- **Path restrictions**: File access limited to workspace

For security reporting information and policies, see [SECURITY.md](SECURITY.md).

## Support

This is currently an experimental exploration project with no support provided. For details, see [SUPPORT.md](SUPPORT.md).

## Contributing

> [!NOTE]
> This project is not currently accepting external contributions, but we're actively working toward opening this up. We value community input and look forward to collaborating in the future. For now, feel free to fork and experiment!

Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit [Contributor License Agreements](https://cla.opensource.microsoft.com).

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

For the full Code of Conduct, see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft trademarks or logos is subject to and must follow [Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general). Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship. Any use of third-party trademarks or logos are subject to those third-party's policies.

## License

MIT License - see [LICENSE](LICENSE) for details.
