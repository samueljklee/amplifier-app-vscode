import * as vscode from 'vscode';

// Client and services
import { AmplifierClient } from './client/AmplifierClient';
import { EventStreamManager } from './client/EventStream';
import { ServerManager } from './services/ServerManager';
import { CredentialsManager } from './services/CredentialsManager';

// Providers
import { ChatViewProvider } from './providers/ChatViewProvider';

let client: AmplifierClient;
let eventStream: EventStreamManager;
let serverManager: ServerManager;
let credentialsManager: CredentialsManager;
let chatViewProvider: ChatViewProvider;
let statusBar: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext) {
    console.log('[Amplifier Extension] Activating...');

    // Initialize credentials manager
    credentialsManager = new CredentialsManager(context.secrets);

    // Initialize server manager
    serverManager = new ServerManager(context);

    // Initialize client and event stream (will be ready when server starts)
    client = new AmplifierClient('http://127.0.0.1:8765');
    eventStream = new EventStreamManager('http://127.0.0.1:8765');

    // Register Chat View Provider
    chatViewProvider = new ChatViewProvider(
        context.extensionUri,
        client,
        eventStream,
        credentialsManager
    );
    
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'amplifier.chatView',
            chatViewProvider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    // Create status bar item
    statusBar = vscode.window.createStatusBarItem(
        'amplifier.status',
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBar.command = 'amplifier.showChat';
    context.subscriptions.push(statusBar);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('amplifier.startServer', () => serverManager.start()),
        vscode.commands.registerCommand('amplifier.stopServer', () => serverManager.stop()),
        vscode.commands.registerCommand('amplifier.showChat', () => {
            vscode.commands.executeCommand('amplifier.chatView.focus');
        }),
        vscode.commands.registerCommand('amplifier.setApiKey', () => credentialsManager.promptForApiKey())
    );

    // Initialize asynchronously (non-blocking) - don't await
    initializeExtension(context).catch(err => {
        console.error('[Amplifier Extension] Initialization error:', err);
        updateStatusBar('error', 'Initialization failed');
    });
    
    // Return immediately - extension is activated
    console.log('[Amplifier Extension] Activated (server starting in background)');
}

async function initializeExtension(context: vscode.ExtensionContext): Promise<void> {
    // Update status bar to show starting
    updateStatusBar('starting');

    // Check prerequisites
    const prereqCheck = await serverManager.checkPrerequisites();
    if (!prereqCheck.ok) {
        updateStatusBar('error', prereqCheck.error);
        vscode.window.showErrorMessage(prereqCheck.error!, 'Get Help').then(selection => {
            if (selection === 'Get Help') {
                vscode.env.openExternal(vscode.Uri.parse('https://github.com/microsoft/amplifier-app-vscode#prerequisites'));
            }
        });
        return;
    }

    // Check for API key
    const hasApiKey = await credentialsManager.hasApiKey();
    if (!hasApiKey) {
        updateStatusBar('no-api-key');
        // Don't block - user can set key later via chat panel welcome screen
    }

    // Auto-start server if configured
    const config = vscode.workspace.getConfiguration('amplifier');
    if (config.get('server.autoStart', true)) {
        try {
            await serverManager.start();
            updateStatusBar('ready');
        } catch (error) {
            updateStatusBar('error', 'Failed to start server');
            vscode.window.showErrorMessage(`Amplifier: Failed to start server. ${error}`);
        }
    }

}

function updateStatusBar(state: 'starting' | 'ready' | 'error' | 'no-api-key', message?: string): void {
    switch (state) {
        case 'starting':
            statusBar.text = '$(loading~spin) Amplifier: Starting...';
            statusBar.tooltip = 'Amplifier is starting up';
            statusBar.backgroundColor = undefined;
            break;
        case 'ready':
            statusBar.text = '$(check) Amplifier';
            statusBar.tooltip = 'Amplifier is ready';
            statusBar.backgroundColor = undefined;
            break;
        case 'error':
            statusBar.text = '$(error) Amplifier: Error';
            statusBar.tooltip = message || 'Amplifier encountered an error';
            statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            break;
        case 'no-api-key':
            statusBar.text = '$(key) Amplifier: Set API Key';
            statusBar.tooltip = 'Click to set your API key';
            statusBar.command = 'amplifier.setApiKey';
            statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            break;
    }
    statusBar.show();
}

export function deactivate() {
    // Clean up before stopping server
    serverManager?.stop();
}
