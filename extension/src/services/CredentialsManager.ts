// CredentialsManager - Secure API key storage and management
// Implements P1.5.1-5: SecretStorage, env fallback, set/get/prompt, validation

import * as vscode from 'vscode';

export class CredentialsManager {
    private static readonly API_KEY_SECRET = 'amplifier.anthropicApiKey';
    private static readonly ENV_VAR_NAME = 'ANTHROPIC_API_KEY';

    constructor(private secrets: vscode.SecretStorage) {}

    // P1.5.5: Check if API key is available
    async hasApiKey(): Promise<boolean> {
        const key = await this.getApiKey();
        return !!key;
    }

    // P1.5.2: Get API key from SecretStorage with env fallback
    async getApiKey(): Promise<string | undefined> {
        // First check SecretStorage (preferred, secure)
        const storedKey = await this.secrets.get(CredentialsManager.API_KEY_SECRET);
        if (storedKey) {
            console.log('[CredentialsManager] ✅ Using API key from SecretStorage');
            return storedKey;
        }

        // Fall back to environment variable (for CI/testing)
        const envKey = process.env[CredentialsManager.ENV_VAR_NAME];
        if (envKey) {
            console.log('[CredentialsManager] ⚠️  Using API key from environment variable');
            console.log('[CredentialsManager] 💡 Tip: Use "Amplifier: Set API Key" command to store key securely');
        } else {
            console.log('[CredentialsManager] ❌ No API key found in SecretStorage or environment');
        }
        return envKey;
    }

    // P1.5.3: Set API key in SecretStorage
    async setApiKey(key: string): Promise<void> {
        await this.secrets.store(CredentialsManager.API_KEY_SECRET, key);
    }

    // Clear API key from storage
    async clearApiKey(): Promise<void> {
        await this.secrets.delete(CredentialsManager.API_KEY_SECRET);
    }

    // P1.5.4: Prompt user for API key with InputBox validation
    async promptForApiKey(): Promise<boolean> {
        const key = await vscode.window.showInputBox({
            prompt: 'Enter your Anthropic API Key',
            password: true, // Hide input
            placeHolder: 'sk-ant-...',
            ignoreFocusOut: true, // Don't dismiss on focus loss
            validateInput: (value: string) => {
                // Basic validation for Anthropic API key format
                if (!value) {
                    return 'API key is required';
                }
                if (!value.startsWith('sk-ant-')) {
                    return 'Anthropic API keys start with "sk-ant-"';
                }
                if (value.length < 20) {
                    return 'API key appears too short';
                }
                return null; // Valid
            }
        });

        if (!key) {
            // User cancelled
            return false;
        }

        // Store the key
        await this.setApiKey(key);
        vscode.window.showInformationMessage('Anthropic API key saved securely');
        return true;
    }
}
