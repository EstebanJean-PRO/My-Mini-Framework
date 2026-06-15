/**
 * Game Network Module - Multiplayer networking with WebSocket support
 * Dependencies: time.ts (timestamp, wait)
 */

import { timestamp } from './time';
import { min } from './utils';

// ============================================================================
// TYPES
// ============================================================================

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface NetworkMessage<T = any> {
    id: string;
    type: string;
    data: T;
    timestamp: number;
    priority?: number;
    requiresAck?: boolean;
}

export interface NetworkClientOptions {
    url: string;
    autoReconnect?: boolean;
    reconnectDelay?: number;
    maxReconnectDelay?: number;
    reconnectAttempts?: number;
    pingInterval?: number;
    onOpen?: () => void;
    onClose?: (event: CloseEvent) => void;
    onError?: (event: Event) => void;
    onMessage?: (message: NetworkMessage) => void;
}

export interface LatencyStats {
    current: number;
    average: number;
    min: number;
    max: number;
    samples: number;
}

// ============================================================================
// NETWORK CLIENT
// ============================================================================

export class NetworkClient {
    private ws: WebSocket | null = null;
    private state: ConnectionState = 'disconnected';
    private reconnectTimer: number | null = null;
    private reconnectCount = 0;
    private currentReconnectDelay = 0;
    private pingTimer: number | null = null;
    private messageQueue: NetworkMessage[] = [];
    private pendingAcks = new Map<string, { message: NetworkMessage; timestamp: number }>();
    private messageId = 0;

    // Latency tracking
    private lastPingTime = 0;
    private latencySamples: number[] = [];
    private maxLatencySamples = 30;

    // Callbacks
    private onOpenCallback?: () => void;
    private onCloseCallback?: (event: CloseEvent) => void;
    private onErrorCallback?: (event: Event) => void;
    private onMessageCallback?: (message: NetworkMessage) => void;

    constructor(private options: NetworkClientOptions) {
        this.currentReconnectDelay = options.reconnectDelay ?? 1000;
        this.onOpenCallback = options.onOpen;
        this.onCloseCallback = options.onClose;
        this.onErrorCallback = options.onError;
        this.onMessageCallback = options.onMessage;
    }

    connect(): void {
        if (this.state === 'connected' || this.state === 'connecting') return;

        this.state = 'connecting';
        this.ws = new WebSocket(this.options.url);

        this.ws.onopen = () => {
            this.state = 'connected';
            this.reconnectCount = 0;
            this.currentReconnectDelay = this.options.reconnectDelay ?? 1000;
            this.flushMessageQueue();
            this.startPing();
            this.onOpenCallback?.();
        };

        this.ws.onclose = (event) => {
            this.state = 'disconnected';
            this.stopPing();
            this.onCloseCallback?.(event);

            if (this.options.autoReconnect !== false) {
                this.scheduleReconnect();
            }
        };

        this.ws.onerror = (event) => {
            this.state = 'error';
            this.onErrorCallback?.(event);
        };

        this.ws.onmessage = (event) => {
            try {
                const message: NetworkMessage = JSON.parse(event.data);
                this.handleMessage(message);
            } catch (e) {
                console.error('Failed to parse network message:', e);
            }
        };
    }

    disconnect(): void {
        // BUG (Game P2): mutates the caller's options object. Reusing the same options
        // for a subsequent connect() silently disables auto-reconnect permanently.
        // SOLUTION: shallow-copy options in the constructor (`this.options = { ...options }`)
        // so all internal mutations stay on the private copy.
        this.options.autoReconnect = false;
        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.stopPing();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.state = 'disconnected';
    }

    send<T = any>(type: string, data: T, priority = 0, requiresAck = false): string {
        const message: NetworkMessage<T> = {
            id: this.generateMessageId(),
            type,
            data,
            timestamp: timestamp(),
            priority,
            requiresAck
        };

        if (this.state === 'connected' && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.sendMessage(message);
        } else {
            this.messageQueue.push(message);
            this.messageQueue.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
        }

        if (requiresAck) {
            this.pendingAcks.set(message.id, { message, timestamp: timestamp() });
        }

        return message.id;
    }

    private sendMessage(message: NetworkMessage): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        try {
            this.ws.send(JSON.stringify(message));
        } catch (e) {
            console.error('Failed to send message:', e);
            this.messageQueue.push(message);
        }
    }

    private handleMessage(message: NetworkMessage): void {
        if (message.type === 'PONG') {
            if (this.lastPingTime > 0) {
                this.latencySamples.push(timestamp() - this.lastPingTime);
                if (this.latencySamples.length > this.maxLatencySamples) this.latencySamples.shift();
                this.lastPingTime = 0;
            }
            return;
        }
        if (message.type === 'ACK') {
            const messageId = message.data?.messageId;
            if (messageId) this.pendingAcks.delete(messageId);
            return;
        }
        if (message.requiresAck) this.send('ACK', { messageId: message.id }, 10);
        this.onMessageCallback?.(message);
    }

    private flushMessageQueue(): void {
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            if (message) {
                this.sendMessage(message);
            }
        }
    }

    private scheduleReconnect(): void {
        const maxAttempts = this.options.reconnectAttempts ?? Infinity;
        if (this.reconnectCount >= maxAttempts) return;
        this.reconnectTimer = window.setTimeout(() => {
            this.reconnectCount++;
            this.connect();
            const maxDelay = this.options.maxReconnectDelay ?? 30000;
            this.currentReconnectDelay = min(this.currentReconnectDelay * 2, maxDelay);
        }, this.currentReconnectDelay);
    }

    private startPing(): void {
        const interval = this.options.pingInterval ?? 5000;
        this.pingTimer = window.setInterval(() => {
            if (this.lastPingTime === 0) {
                this.lastPingTime = timestamp();
                this.send('ping', {}, 10);
            }
        }, interval);
    }

    private stopPing(): void {
        if (this.pingTimer !== null) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }

    private generateMessageId(): string {
        return `msg_${this.messageId++}_${timestamp()}`;
    }

    getState(): ConnectionState {
        return this.state;
    }

    isConnected(): boolean {
        return this.state === 'connected';
    }

    getLatency(): LatencyStats {
        if (this.latencySamples.length === 0) {
            return { current: 0, average: 0, min: 0, max: 0, samples: 0 };
        }

        const current = this.latencySamples[this.latencySamples.length - 1];
        const sum = this.latencySamples.reduce((a, b) => a + b, 0);
        const average = sum / this.latencySamples.length;
        const minLatency = Math.min(...this.latencySamples);
        const maxLatency = Math.max(...this.latencySamples);

        return {
            current,
            average,
            min: minLatency,
            max: maxLatency,
            samples: this.latencySamples.length
        };
    }

    getQueuedMessageCount(): number {
        return this.messageQueue.length;
    }

    getPendingAckCount(): number {
        return this.pendingAcks.size;
    }

    clearQueue(): void {
        this.messageQueue = [];
    }

    // BUG (Game P2): pending.timestamp is never updated after a retry. Every subsequent
    // call to retryPendingAcks() immediately re-sends the same messages — unlimited
    // retries at the caller's poll rate, with no backoff and no retry cap.
    // SOLUTION: add `retryCount: number` and `nextRetryAt: number` to the pending ack
    // structure. On retry: retryCount++; nextRetryAt = now + baseDelay * 2^retryCount.
    // Guard with `now >= pending.nextRetryAt`. After a max retry count, delete the entry
    // from pendingAcks and surface the error via a configurable onAckTimeout callback.
    retryPendingAcks(maxAge = 5000): number {
        let retried = 0;
        const now = timestamp();
        this.pendingAcks.forEach((pending) => {
            if (now - pending.timestamp > maxAge) {
                this.sendMessage(pending.message);
                retried++;
            }
        });
        return retried;
    }
}

// ============================================================================
// NETWORK MANAGER
// ============================================================================

export class NetworkManager {
    private client: NetworkClient | null = null;
    private messageHandlers = new Map<string, Set<(message: NetworkMessage) => void>>();

    connect(options: NetworkClientOptions): void {
        if (this.client) {
            this.client.disconnect();
        }

        // Wrap the onMessage callback to include our message routing
        const originalOnMessage = options.onMessage;
        options.onMessage = (message: NetworkMessage) => {
            this.routeMessage(message);
            originalOnMessage?.(message);
        };

        this.client = new NetworkClient(options);
        this.client.connect();
    }

    disconnect(): void {
        if (this.client) {
            this.client.disconnect();
            this.client = null;
        }
    }

    send<T = any>(type: string, data: T, priority = 0, requiresAck = false): string | null {
        return this.client ? this.client.send(type, data, priority, requiresAck) : null;
    }

    on(type: string, handler: (message: NetworkMessage) => void): void {
        if (!this.messageHandlers.has(type)) {
            this.messageHandlers.set(type, new Set());
        }
        this.messageHandlers.get(type)!.add(handler);
    }

    off(type: string, handler: (message: NetworkMessage) => void): void {
        const handlers = this.messageHandlers.get(type);
        if (handlers) {
            handlers.delete(handler);
        }
    }

    private routeMessage(message: NetworkMessage): void {
        const handlers = this.messageHandlers.get(message.type);
        if (handlers) {
            handlers.forEach(handler => handler(message));
        }
    }

    getClient(): NetworkClient | null {
        return this.client;
    }

    isConnected(): boolean {
        return this.client?.isConnected() ?? false;
    }

    getState(): ConnectionState {
        return this.client?.getState() ?? 'disconnected';
    }

    getLatency(): LatencyStats | null {
        return this.client?.getLatency() ?? null;
    }
}

// ============================================================================
// SINGLETON PATTERN
// ============================================================================

let managerInstance: NetworkManager | null = null;

export function getNetworkManager(): NetworkManager {
    if (!managerInstance) {
        managerInstance = new NetworkManager();
    }
    return managerInstance;
}

export function destroyNetworkManager(): void {
    if (managerInstance) {
        managerInstance.disconnect();
        managerInstance = null;
    }
}

// ============================================================================
// STATE SYNCHRONIZATION UTILITIES
// ============================================================================

export interface EntityState {
    id: string;
    position: { x: number; y: number };
    velocity?: { x: number; y: number };
    rotation?: number;
    [key: string]: any;
}

export interface StateDelta {
    id: string;
    changes: Partial<EntityState>;
}

export function calculateStateDelta(oldState: EntityState, newState: EntityState): StateDelta | null {
    const changes: Partial<EntityState> = {};
    let hasChanges = false;
    for (const key in newState) {
        if (key === 'id') continue;
        const oldValue = oldState[key];
        const newValue = newState[key];
        if (typeof newValue === 'object' && newValue !== null && typeof oldValue === 'object' && oldValue !== null) {
            const objChanges: any = {};
            let hasObjChanges = false;
            for (const subKey in newValue) {
                if (newValue[subKey] !== oldValue[subKey]) {
                    objChanges[subKey] = newValue[subKey];
                    hasObjChanges = true;
                }
            }
            if (hasObjChanges) {
                changes[key] = objChanges;
                hasChanges = true;
            }
        } else if (newValue !== oldValue) {
            changes[key] = newValue;
            hasChanges = true;
        }
    }
    return hasChanges ? { id: newState.id, changes } : null;
}

export function applyStateDelta(state: EntityState, delta: StateDelta): EntityState {
    const newState = { ...state };
    for (const key in delta.changes) {
        const value = delta.changes[key];
        if (typeof value === 'object' && value !== null && typeof newState[key] === 'object' && newState[key] !== null) {
            newState[key] = { ...newState[key], ...value };
        } else {
            newState[key] = value;
        }
    }
    return newState;
}

export function interpolateStates(from: EntityState, to: EntityState, t: number): EntityState {
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    t = Math.min(Math.max(t, 0), 1);
    const interpolated: EntityState = { ...to };
    if (from.position && to.position) {
        interpolated.position = {
            x: lerp(from.position.x, to.position.x, t),
            y: lerp(from.position.y, to.position.y, t)
        };
    }
    if (from.velocity && to.velocity) {
        interpolated.velocity = {
            x: lerp(from.velocity.x, to.velocity.x, t),
            y: lerp(from.velocity.y, to.velocity.y, t)
        };
    }
    if (typeof from.rotation === 'number' && typeof to.rotation === 'number') {
        interpolated.rotation = lerp(from.rotation, to.rotation, t);
    }
    return interpolated;
}

