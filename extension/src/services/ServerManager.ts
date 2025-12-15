// ServerManager - Backend lifecycle management
// Implements P1.4.1-6: Server spawn, health check, stop, crash detection, prerequisites

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';

interface PrerequisiteCheck {
    ok: boolean;
    error?: string;
}

export class ServerManager {
    private process: cp.ChildProcess | null = null;
    private port: number;
    private host: string;
    private restartAttempts = 0;
    private maxRestartAttempts = 3;

    constructor(private context: vscode.ExtensionContext) {
        const config = vscode.workspace.getConfiguration('amplifier');
        this.port = config.get('server.port', 8765);
        this.host = config.get('server.host', '127.0.0.1');
    }

    getBaseUrl(): string {
        return `http://${this.host}:${this.port}`;
    }

    // P1.4.6: Check Python 3.11+ and uv availability
    async checkPrerequisites(): Promise<PrerequisiteCheck> {
        // Check Python version
        try {
            const pythonVersion = await this.getCommandOutput('python3 --version');
            const versionMatch = pythonVersion.match(/Python (\d+)\.(\d+)/);
            if (versionMatch) {
                const major = parseInt(versionMatch[1]);
                const minor = parseInt(versionMatch[2]);
                if (major < 3 || (major === 3 && minor < 11)) {
                    return {
                        ok: false,
                        error: `Python 3.11+ required (found ${major}.${minor}). Install from https://python.org`
                    };
                }
            }
        } catch {
            return {
                ok: false,
                error: 'Python 3.11+ is required. Install from https://python.org'
            };
        }

        // Check uv
        try {
            await this.getCommandOutput('uv --version');
        } catch {
            return {
                ok: false,
                error: 'uv package manager required. Install: curl -LsSf https://astral.sh/uv/install.sh | sh'
            };
        }

        return { ok: true };
    }

    private getCommandOutput(command: string): Promise<string> {
        return new Promise((resolve, reject) => {
            cp.exec(command, (error, stdout) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(stdout.trim());
                }
            });
        });
    }

    // P1.4.2: Spawn server with uv run
    async start(): Promise<void> {
        if (this.process) {
            console.log('[ServerManager] Server already running');
            vscode.window.showInformationMessage('Amplifier server already running');
            return;
        }

        const serverPath = this.getServerPath();
        console.log('[ServerManager] Starting server...');
        console.log('[ServerManager] Server path:', serverPath);
        console.log('[ServerManager] Command: uv run python -m amplifier_vscode_server');
        console.log('[ServerManager] Working directory:', serverPath);
        console.log('[ServerManager] Host:', this.host, 'Port:', this.port);

        this.process = cp.spawn('uv', ['run', 'python', '-m', 'amplifier_vscode_server'], {
            cwd: serverPath,
            env: {
                ...process.env,
                AMPLIFIER_HOST: this.host,
                AMPLIFIER_PORT: String(this.port),
            }
        });

        console.log('[ServerManager] Process spawned, PID:', this.process.pid);

        this.process.stdout?.on('data', (data) => {
            console.log(`[Amplifier Server STDOUT] ${data}`);
        });

        this.process.stderr?.on('data', (data) => {
            console.error(`[Amplifier Server STDERR] ${data}`);
        });

        this.process.on('error', (error) => {
            console.error('[ServerManager] Process error:', error);
        });

        // P1.4.5: Process crash detection and auto-restart
        this.process.on('exit', (code, signal) => {
            console.log(`[Amplifier Server] Process exited with code ${code}, signal ${signal}`);
            this.process = null;

            // Auto-restart on unexpected crashes (but not if stopped intentionally)
            if (code !== 0 && code !== null && this.restartAttempts < this.maxRestartAttempts) {
                this.restartAttempts++;
                console.log(`[Amplifier Server] Attempting restart ${this.restartAttempts}/${this.maxRestartAttempts}`);
                vscode.window.showWarningMessage(`Amplifier server crashed. Restarting (attempt ${this.restartAttempts}/${this.maxRestartAttempts})...`);
                
                // Wait 2 seconds before restart
                setTimeout(() => {
                    this.start().catch(err => {
                        console.error('[Amplifier Server] Restart failed:', err);
                        vscode.window.showErrorMessage('Amplifier server restart failed');
                    });
                }, 2000);
            } else if (this.restartAttempts >= this.maxRestartAttempts) {
                vscode.window.showErrorMessage('Amplifier server failed to start after multiple attempts. Please check logs.');
                this.restartAttempts = 0;
            }
        });

        // P1.4.3: Health check polling
        try {
            await this.waitForReady();
            this.restartAttempts = 0; // Reset on successful start
            vscode.window.showInformationMessage('Amplifier server started');
        } catch (error) {
            this.process?.kill();
            this.process = null;
            throw error;
        }
    }

    // P1.4.4: Server stop and cleanup
    async stop(): Promise<void> {
        if (this.process) {
            this.process.kill('SIGTERM');
            
            // Wait for graceful shutdown, force kill after 5s
            await new Promise<void>((resolve) => {
                const forceKillTimer = setTimeout(() => {
                    if (this.process) {
                        console.log('[Amplifier Server] Forcing kill after timeout');
                        this.process.kill('SIGKILL');
                    }
                    resolve();
                }, 5000);

                this.process!.on('exit', () => {
                    clearTimeout(forceKillTimer);
                    resolve();
                });
            });

            this.process = null;
            this.restartAttempts = 0;
            vscode.window.showInformationMessage('Amplifier server stopped');
        }
    }

    private getServerPath(): string {
        // Server is at repo root (sibling to extension directory)
        // context.extensionPath = /path/to/repo/extension
        // server path = /path/to/repo/server
        return path.join(this.context.extensionPath, '..', 'server');
    }

    // P1.4.3: Health check polling with timeout
    private async waitForReady(timeout = 10000): Promise<void> {
        const start = Date.now();
        let lastError: Error | undefined;
        let attempts = 0;

        console.log('[ServerManager] Waiting for server to be ready...');
        console.log('[ServerManager] Health check URL:', `${this.getBaseUrl()}/health`);

        while (Date.now() - start < timeout) {
            attempts++;
            try {
                const response = await fetch(`${this.getBaseUrl()}/health`);
                if (response.ok) {
                    console.log(`[ServerManager] Server ready after ${attempts} attempts (${Date.now() - start}ms)`);
                    return;
                }
                console.log(`[ServerManager] Health check attempt ${attempts}: status ${response.status}`);
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                if (attempts % 10 === 0) {
                    console.log(`[ServerManager] Health check attempt ${attempts}: ${lastError.message}`);
                }
                // Server not ready yet, continue polling
            }
            await new Promise(r => setTimeout(r, 100));
        }

        console.error('[ServerManager] Server failed to start within timeout');
        console.error('[ServerManager] Total attempts:', attempts);
        console.error('[ServerManager] Last error:', lastError?.message);
        const errorMsg = lastError ? `: ${lastError.message}` : '';
        throw new Error(`Server failed to start within timeout${errorMsg}`);
    }

    // Check if server is currently running
    isRunning(): boolean {
        return this.process !== null && !this.process.killed;
    }

    // Get current server status for UI display
    getStatus(): 'stopped' | 'starting' | 'running' {
        if (!this.process) {
            return 'stopped';
        }
        // If process exists but we're still in startup phase, it's 'starting'
        // This is a simple heuristic; more sophisticated tracking could be added
        return 'running';
    }
}
