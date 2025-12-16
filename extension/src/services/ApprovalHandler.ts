/**
 * ApprovalHandler - Manages user approval requests from Amplifier backend
 * 
 * Shows inline approval UI in the webview for potentially destructive operations
 * (file writes, git commits, etc.)
 */

import * as vscode from 'vscode';
import { AmplifierClient } from '../client/AmplifierClient';
import { ApprovalRequiredEvent } from '../client/types';

export class ApprovalHandler {
    public webviewView?: vscode.WebviewView;
    private pendingApproval: any = null;

    constructor(
        private client: AmplifierClient,
        webviewView: vscode.WebviewView | undefined
    ) {
        this.webviewView = webviewView;
    }

    /**
     * Handle an approval request from the backend
     * 
     * Shows inline approval UI in the webview with the provided options.
     * If the user doesn't respond within the timeout period, uses the default decision.
     * 
     * @param sessionId The session ID requesting approval
     * @param approvalData The approval request data from backend
     */
    async handleApprovalRequest(
        sessionId: string,
        approvalData: ApprovalRequiredEvent
    ): Promise<void> {
        console.log('[ApprovalHandler] Approval requested:', {
            approval_id: approvalData.approval_id,
            prompt: approvalData.prompt,
        });

        try {
            // Extract context details for display
            const context = this._extractContext(approvalData.context);

            // Send to webview to show inline approval UI
            this.webviewView?.webview.postMessage({
                type: 'showApproval',
                prompt: approvalData.prompt,
                context: context,
                timeout: approvalData.timeout,
                approvalId: approvalData.approval_id,
                options: approvalData.options,
                default: approvalData.default
            });

            // Store pending approval for when webview responds
            this.pendingApproval = {
                sessionId,
                approvalId: approvalData.approval_id,
                timeout: approvalData.timeout,
                default: approvalData.default
            };

            // Set timeout to auto-deny if no response
            setTimeout(async () => {
                if (this.pendingApproval?.approvalId === approvalData.approval_id) {
                    console.log('[ApprovalHandler] Timeout - using default:', approvalData.default);
                    await this.submitDecision(approvalData.default);
                }
            }, approvalData.timeout * 1000);

        } catch (error: any) {
            console.error('[ApprovalHandler] Error:', error);
            // Fallback to default on error
            await this.submitDecision(approvalData.default);
        }
    }

    /**
     * Handle approval decision from webview
     */
    async handleApprovalDecision(approvalId: string, decision: string): Promise<void> {
        if (!this.pendingApproval || this.pendingApproval.approvalId !== approvalId) {
            console.warn('[ApprovalHandler] No matching pending approval for', approvalId);
            return;
        }

        await this.submitDecision(decision);
    }

    /**
     * Submit decision to backend
     */
    private async submitDecision(decision: string): Promise<void> {
        if (!this.pendingApproval) return;

        try {
            await this.client.submitApproval(this.pendingApproval.sessionId, {
                decision
            });
            console.log('[ApprovalHandler] Decision submitted:', decision);
        } finally {
            this.pendingApproval = null;
        }
    }

    /**
     * Extract human-readable context from approval context object
     */
    private _extractContext(context: any): string {
        if (!context) return '';

        // Extract file path if present
        if (context.file_path || context.path) {
            return context.file_path || context.path;
        }

        // Extract command if present
        if (context.command) {
            return `Command: ${context.command}`;
        }

        // Extract operation if present
        if (context.operation) {
            return context.operation;
        }

        // Fallback to JSON representation
        return JSON.stringify(context);
    }
}
