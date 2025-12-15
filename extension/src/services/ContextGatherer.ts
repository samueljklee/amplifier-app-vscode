/**
 * ContextGatherer - Collects workspace context for AI assistance
 * 
 * Gathers information about:
 * - Workspace root
 * - Open files and their content
 * - Git state (branch, changes)
 * - Current selection
 * - Diagnostics (errors, warnings)
 */

import * as vscode from 'vscode';
import { WorkspaceContext, OpenFile, GitState, Diagnostic, Selection } from '../client/types';
import * as path from 'path';

export class ContextGatherer {
    /**
     * Gather comprehensive workspace context
     */
    async gatherContext(options?: ContextGatherOptions): Promise<WorkspaceContext> {
        const workspaceRoot = this.getWorkspaceRoot();
        
        const context: WorkspaceContext = {
            workspace_root: workspaceRoot
        };

        // Gather optional context based on options
        const opts = options || {};
        
        if (opts.includeOpenFiles !== false) {
            context.open_files = await this.getOpenFiles(opts.maxOpenFiles);
        }
        
        if (opts.includeGitState !== false) {
            context.git_state = await this.getGitState();
        }
        
        if (opts.includeDiagnostics !== false) {
            context.diagnostics = this.getDiagnostics(opts.maxDiagnostics);
        }
        
        if (opts.includeSelection !== false) {
            context.selection = this.getSelection();
        }

        return context;
    }

    /**
     * P2.7.2: Get workspace root directory
     */
    getWorkspaceRoot(): string {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        
        console.log('[ContextGatherer] 🔍 Detecting workspace root...');
        console.log('[ContextGatherer]   Workspace folders count:', workspaceFolders?.length || 0);
        
        if (!workspaceFolders || workspaceFolders.length === 0) {
            console.log('[ContextGatherer]   ❌ No workspace folders found!');
            return '';
        }
        
        // Log all workspace folders (for multi-root workspaces)
        workspaceFolders.forEach((folder, i) => {
            console.log(`[ContextGatherer]   [${i}] ${folder.name}: ${folder.uri.fsPath}`);
        });
        
        // Return the first workspace folder (most common case)
        const root = workspaceFolders[0].uri.fsPath;
        console.log(`[ContextGatherer]   ✅ Using workspace root: ${root}`);
        return root;
    }

    /**
     * P2.7.3: Get open files and their content
     */
    async getOpenFiles(maxFiles: number = 10): Promise<OpenFile[]> {
        const openFiles: OpenFile[] = [];
        
        // Get all visible text editors
        const visibleEditors = vscode.window.visibleTextEditors;
        
        // Get all open text documents (including non-visible tabs)
        const openDocuments = vscode.workspace.textDocuments;
        
        // Prioritize visible editors, then recently accessed documents
        const documentsToInclude = new Map<string, vscode.TextDocument>();
        
        // Add visible editors first (these are what user is actively looking at)
        for (const editor of visibleEditors) {
            const doc = editor.document;
            if (!doc.isUntitled && doc.uri.scheme === 'file') {
                documentsToInclude.set(doc.uri.fsPath, doc);
            }
        }
        
        // Add other open documents (up to maxFiles)
        for (const doc of openDocuments) {
            if (documentsToInclude.size >= maxFiles) break;
            
            if (!doc.isUntitled && doc.uri.scheme === 'file' && !documentsToInclude.has(doc.uri.fsPath)) {
                documentsToInclude.set(doc.uri.fsPath, doc);
            }
        }
        
        // Convert to OpenFile format
        for (const doc of documentsToInclude.values()) {
            const activeEditor = vscode.window.visibleTextEditors.find(e => e.document === doc);
            
            openFiles.push({
                path: this.getRelativePath(doc.uri.fsPath),
                language: doc.languageId,
                content: doc.getText(),
                cursor_position: activeEditor ? {
                    line: activeEditor.selection.active.line,
                    character: activeEditor.selection.active.character
                } : undefined
            });
        }
        
        return openFiles;
    }

    /**
     * P2.7.4: Get git state (branch, staged, modified, untracked files)
     */
    async getGitState(): Promise<GitState | undefined> {
        try {
            // Try to access the built-in Git extension
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (!gitExtension) {
                console.log('[ContextGatherer] Git extension not available');
                return undefined;
            }

            // Activate the extension if needed
            if (!gitExtension.isActive) {
                await gitExtension.activate();
            }

            const git = gitExtension.exports.getAPI(1);
            if (!git) {
                console.log('[ContextGatherer] Git API not available');
                return undefined;
            }

            // Get the first repository (most common case)
            const repositories = git.repositories;
            if (repositories.length === 0) {
                console.log('[ContextGatherer] No git repositories found');
                return undefined;
            }

            const repo = repositories[0];
            const state = repo.state;

            // Get HEAD reference (current branch)
            const headRef = state.HEAD;
            const branch = headRef?.name || 'detached';

            // Collect file states
            const stagedFiles: string[] = [];
            const modifiedFiles: string[] = [];
            const untrackedFiles: string[] = [];

            // Process working tree changes
            for (const change of state.workingTreeChanges) {
                const relativePath = this.getRelativePath(change.uri.fsPath);
                modifiedFiles.push(relativePath);
            }

            // Process index changes (staged)
            for (const change of state.indexChanges) {
                const relativePath = this.getRelativePath(change.uri.fsPath);
                stagedFiles.push(relativePath);
            }

            // Process untracked files
            for (const change of state.workingTreeChanges) {
                if (change.status === 7) { // STATUS_UNTRACKED = 7
                    const relativePath = this.getRelativePath(change.uri.fsPath);
                    if (!untrackedFiles.includes(relativePath)) {
                        untrackedFiles.push(relativePath);
                    }
                }
            }

            return {
                branch,
                staged_files: stagedFiles,
                modified_files: modifiedFiles,
                untracked_files: untrackedFiles
            };

        } catch (error) {
            console.error('[ContextGatherer] Error getting git state:', error);
            return undefined;
        }
    }

    /**
     * P2.7.5: Get current selection
     */
    getSelection(): Selection | undefined {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return undefined;
        }

        const selection = editor.selection;
        if (selection.isEmpty) {
            return undefined;
        }

        const selectedText = editor.document.getText(selection);
        if (!selectedText) {
            return undefined;
        }

        return {
            path: this.getRelativePath(editor.document.uri.fsPath),
            text: selectedText,
            range: {
                start: {
                    line: selection.start.line,
                    character: selection.start.character
                },
                end: {
                    line: selection.end.line,
                    character: selection.end.character
                }
            }
        };
    }

    /**
     * P2.7.6: Get diagnostics (errors, warnings) from all open files
     */
    getDiagnostics(maxDiagnostics: number = 50): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        
        // Get all diagnostics from the diagnostic collection
        const allDiagnostics = vscode.languages.getDiagnostics();
        
        // Convert to our Diagnostic format
        for (const [uri, fileDiagnostics] of allDiagnostics) {
            if (uri.scheme !== 'file') continue;
            
            for (const diag of fileDiagnostics) {
                if (diagnostics.length >= maxDiagnostics) {
                    return diagnostics;
                }
                
                diagnostics.push({
                    path: this.getRelativePath(uri.fsPath),
                    severity: this.mapSeverity(diag.severity),
                    message: diag.message,
                    range: {
                        start: {
                            line: diag.range.start.line,
                            character: diag.range.start.character
                        },
                        end: {
                            line: diag.range.end.line,
                            character: diag.range.end.character
                        }
                    }
                });
            }
        }
        
        // Sort by severity (errors first, then warnings, etc.)
        diagnostics.sort((a, b) => {
            const severityOrder = { error: 0, warning: 1, info: 2, hint: 3 };
            return severityOrder[a.severity] - severityOrder[b.severity];
        });
        
        return diagnostics;
    }

    /**
     * Get a path relative to workspace root
     */
    private getRelativePath(absolutePath: string): string {
        const workspaceRoot = this.getWorkspaceRoot();
        if (!workspaceRoot) {
            return absolutePath;
        }
        
        const relative = path.relative(workspaceRoot, absolutePath);
        // If the path is outside the workspace, return the absolute path
        if (relative.startsWith('..')) {
            return absolutePath;
        }
        
        return relative;
    }

    /**
     * Map VS Code diagnostic severity to our severity type
     */
    private mapSeverity(severity: vscode.DiagnosticSeverity | undefined): 'error' | 'warning' | 'info' | 'hint' {
        switch (severity) {
            case vscode.DiagnosticSeverity.Error:
                return 'error';
            case vscode.DiagnosticSeverity.Warning:
                return 'warning';
            case vscode.DiagnosticSeverity.Information:
                return 'info';
            case vscode.DiagnosticSeverity.Hint:
                return 'hint';
            default:
                return 'info';
        }
    }
}

/**
 * Options for gathering context
 */
export interface ContextGatherOptions {
    includeOpenFiles?: boolean;
    includeGitState?: boolean;
    includeDiagnostics?: boolean;
    includeSelection?: boolean;
    maxOpenFiles?: number;
    maxDiagnostics?: number;
}
