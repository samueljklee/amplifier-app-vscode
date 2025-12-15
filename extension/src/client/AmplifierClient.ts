/**
 * AmplifierClient - HTTP client for Amplifier VS Code Server
 * 
 * Handles all REST API communication with the Python backend server.
 * Does not handle SSE streaming (see EventStream.ts).
 */

import {
    CreateSessionRequest,
    CreateSessionResponse,
    PromptRequest,
    PromptResponse,
    ApprovalRequest,
    ApprovalResponse,
    SessionStatusResponse,
    ListSessionsResponse,
    ListProfilesResponse,
    ProfileDetails,
    ApiError,
    HealthResponse,
    ServerInfoResponse
} from './types';

export class AmplifierClient {
    constructor(private baseUrl: string) {}

    /**
     * Create a new Amplifier session
     */
    async createSession(request: CreateSessionRequest): Promise<CreateSessionResponse> {
        const response = await fetch(`${this.baseUrl}/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
        });

        if (!response.ok) {
            throw await this.handleError(response);
        }

        return await response.json() as CreateSessionResponse;
    }

    /**
     * Submit a prompt to an existing session
     */
    async submitPrompt(sessionId: string, request: PromptRequest): Promise<PromptResponse> {
        const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
        });

        if (!response.ok) {
            throw await this.handleError(response);
        }

        return await response.json() as PromptResponse;
    }

    /**
     * Submit an approval decision
     */
    async submitApproval(sessionId: string, request: ApprovalRequest): Promise<ApprovalResponse> {
        const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/approval`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
        });

        if (!response.ok) {
            throw await this.handleError(response);
        }

        return await response.json() as ApprovalResponse;
    }

    /**
     * Get session status
     */
    async getSessionStatus(sessionId: string): Promise<SessionStatusResponse> {
        const response = await fetch(`${this.baseUrl}/sessions/${sessionId}`);

        if (!response.ok) {
            throw await this.handleError(response);
        }

        return await response.json() as SessionStatusResponse;
    }

    /**
     * Delete/stop a session
     */
    async deleteSession(sessionId: string): Promise<void> {
        const response = await fetch(`${this.baseUrl}/sessions/${sessionId}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            throw await this.handleError(response);
        }
    }

    /**
     * List all sessions
     */
    async listSessions(status?: string, limit?: number): Promise<ListSessionsResponse> {
        const params = new URLSearchParams();
        if (status) params.set('status', status);
        if (limit) params.set('limit', String(limit));

        const url = `${this.baseUrl}/sessions${params.toString() ? '?' + params.toString() : ''}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw await this.handleError(response);
        }

        return await response.json() as ListSessionsResponse;
    }

    /**
     * List all available profiles
     */
    async listProfiles(collection?: string): Promise<ListProfilesResponse> {
        const params = new URLSearchParams();
        if (collection) params.set('collection', collection);

        const url = `${this.baseUrl}/profiles${params.toString() ? '?' + params.toString() : ''}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw await this.handleError(response);
        }

        return await response.json() as ListProfilesResponse;
    }

    /**
     * Get detailed information about a profile
     */
    async getProfile(profileName: string): Promise<ProfileDetails> {
        const response = await fetch(`${this.baseUrl}/profiles/${encodeURIComponent(profileName)}`);

        if (!response.ok) {
            throw await this.handleError(response);
        }

        return await response.json() as ProfileDetails;
    }

    /**
     * Check server health
     */
    async health(): Promise<HealthResponse> {
        const response = await fetch(`${this.baseUrl}/health`);

        if (!response.ok) {
            throw await this.handleError(response);
        }

        return await response.json() as HealthResponse;
    }

    /**
     * Get server info and capabilities
     */
    async info(): Promise<ServerInfoResponse> {
        const response = await fetch(`${this.baseUrl}/info`);

        if (!response.ok) {
            throw await this.handleError(response);
        }

        return await response.json() as ServerInfoResponse;
    }

    /**
     * Handle API error responses
     */
    private async handleError(response: Response): Promise<Error> {
        try {
            const errorData = await response.json() as ApiError;
            const error = new Error(errorData.error.message);
            (error as any).code = errorData.error.code;
            (error as any).status = response.status;
            (error as any).details = errorData.error.details;
            return error;
        } catch {
            // Fallback if response is not JSON
            return new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
    }
}
