/**
 * EventStream - SSE connection manager for Amplifier session events
 * 
 * Handles Server-Sent Events streaming with automatic reconnection
 * and exponential backoff.
 */

import { EventSource } from 'eventsource';
import { EventHandlers, AmplifierEvent } from './types';

export class EventStreamManager {
    private eventSource: EventSource | null = null;
    private reconnectAttempt = 0;
    private maxReconnectAttempts = 10;
    private baseDelay = 1000; // 1 second
    private maxDelay = 30000; // 30 seconds
    private reconnectTimer: NodeJS.Timeout | null = null;

    constructor(private baseUrl: string) {}

    /**
     * Subscribe to session events with automatic reconnection
     */
    subscribe(sessionId: string, handlers: EventHandlers): void {
        this.unsubscribe(); // Clean up any existing connection

        const url = `${this.baseUrl}/sessions/${sessionId}/events`;
        this.connect(url, handlers);
    }

    /**
     * Unsubscribe and cleanup
     */
    unsubscribe(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }

        this.reconnectAttempt = 0;
    }

    /**
     * Connect to SSE endpoint
     */
    private connect(url: string, handlers: EventHandlers): void {
        try {
            const es = new EventSource(url);
            this.eventSource = es;

            es.onopen = () => {
                this.reconnectAttempt = 0; // Reset on successful connection
                handlers.onConnected?.();
            };

            es.onmessage = (event: any) => {
                try {
                    const message: AmplifierEvent = JSON.parse(event.data);
                    console.log('[EventStream] SSE event received:', message.event);
                    this.dispatchEvent(message, handlers);
                } catch (error) {
                    console.error('[EventStream] Failed to parse SSE message:', error);
                    // Note: Not logging raw data to avoid exposing sensitive information
                }
            };

            es.onerror = (error: any) => {
                console.error('SSE connection error:', error);
                if (this.eventSource) {
                    this.eventSource.close();
                    this.eventSource = null;
                }

                // Attempt reconnection with exponential backoff
                if (this.reconnectAttempt < this.maxReconnectAttempts) {
                    this.scheduleReconnect(url, handlers);
                } else {
                    handlers.onError?.(new Error('Max reconnection attempts reached'));
                }
            };
        } catch (error) {
            console.error('Failed to create EventSource:', error);
            handlers.onError?.(error as Error);
        }
    }

    /**
     * Schedule reconnection with exponential backoff
     */
    private scheduleReconnect(url: string, handlers: EventHandlers): void {
        this.reconnectAttempt++;
        const delay = Math.min(
            this.baseDelay * Math.pow(2, this.reconnectAttempt - 1),
            this.maxDelay
        );

        handlers.onReconnecting?.(this.reconnectAttempt, delay);

        this.reconnectTimer = setTimeout(() => {
            this.connect(url, handlers);
        }, delay);
    }

    /**
     * Dispatch events to appropriate handlers
     */
    private dispatchEvent(message: AmplifierEvent, handlers: EventHandlers): void {
        const { event, data } = message;

        switch (event) {
            // Content streaming
            case 'content_block:delta':
                handlers.onContentDelta?.(data as any);
                break;

            // Thinking/reasoning
            case 'thinking:delta':
                handlers.onThinkingDelta?.(data as any);
                break;
            case 'thinking:start':
                handlers.onThinkingStart?.(data);
                break;
            case 'thinking:end':
                handlers.onThinkingEnd?.(data);
                break;

            // Tool execution
            case 'tool:pre':
                handlers.onToolStart?.(data as any);
                break;
            case 'tool:post':
                handlers.onToolEnd?.(data as any);
                break;

            // Approvals
            case 'approval:required':
                handlers.onApprovalRequired?.(data as any);
                break;

            // Prompt lifecycle
            case 'prompt:complete':
                handlers.onPromptComplete?.(data as any);
                break;

            // Errors (if server sends error events)
            case 'error':
                handlers.onError?.(new Error((data as any).message || 'Unknown error'));
                break;

            default:
                // Unknown event - log but don't fail
                console.log(`Received unknown event: ${event}`, data);
        }
    }
}
