import { generateId } from '../utils/id';

// Type pour un handler d'événement avec métadonnées
interface EventHandler {
    id: string;
    handler: (event: SyntheticEvent | Event) => void;
    eventType: string;
}

// Synthetic Event pour le pooling
export interface SyntheticEvent {
    type: string;
    target: EventTarget | null;
    currentTarget: EventTarget | null;
    bubbles: boolean;
    cancelable: boolean;
    defaultPrevented: boolean;
    preventDefault(): void;
    stopPropagation(): void;
    stopImmediatePropagation(): void;
    timeStamp: number;
    // Properties spécifiques aux différents types d'événements
    key?: string;
    code?: string;
    clientX?: number;
    clientY?: number;
    button?: number;
    buttons?: number;
    altKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
    detail?: number;
    // Méthode pour libérer l'événement vers le pool
    release?: () => void;
}

// Registre global des handlers
const eventRegistry = new Map<string, EventHandler>();
// Registre des listeners directs pour événements non-bubbling (Map<elementId, Map<eventType, listener>>)
const directListeners = new Map<string, Map<string, EventListener>>();
let isInitialized = false;

// Liste des types d'événements supportés
const BUBBLING_EVENTS = [
    'click', 'dblclick', 'mousedown', 'mouseup', 'mouseover', 'mouseout',
    'input', 'change', 'submit', 'reset',
    'keydown', 'keyup', 'keypress'
];

const NON_BUBBLING_EVENTS = [
    'scroll', 'resize', 'load', 'focus', 'blur'
];

const SUPPORTED_EVENTS = [...BUBBLING_EVENTS, ...NON_BUBBLING_EVENTS];

// ==================== EVENT POOLING SYSTEM ====================

const POOL_CONFIG = { maxPoolSize: 50, enablePooling: true, warningThreshold: 40 };
const eventPools = new Map<string, SyntheticEvent[]>();
const poolStats = new Map<string, { created: number; reused: number; released: number }>();

const initializePools = () => SUPPORTED_EVENTS.forEach(type => {
    eventPools.set(type, []);
    poolStats.set(type, { created: 0, reused: 0, released: 0 });
});

function createSyntheticEvent(nativeEvent: Event): SyntheticEvent {
    const { type } = nativeEvent;
    const pool = eventPools.get(type)!;
    const stats = poolStats.get(type)!;

    const syntheticEvent = (POOL_CONFIG.enablePooling && pool.length > 0)
        ? (stats.reused++, pool.pop()!)
        : (stats.created++, {} as SyntheticEvent);

    // Base properties
    Object.assign(syntheticEvent, {
        type, target: nativeEvent.target, currentTarget: nativeEvent.currentTarget,
        bubbles: nativeEvent.bubbles, cancelable: nativeEvent.cancelable,
        defaultPrevented: nativeEvent.defaultPrevented, timeStamp: nativeEvent.timeStamp,
        preventDefault: () => nativeEvent.preventDefault(),
        stopPropagation: () => nativeEvent.stopPropagation(),
        stopImmediatePropagation: () => nativeEvent.stopImmediatePropagation(),
        release: () => releaseSyntheticEvent(syntheticEvent)
    });

    // Event-specific properties
    if (nativeEvent instanceof MouseEvent) {
        Object.assign(syntheticEvent, {
            clientX: nativeEvent.clientX, clientY: nativeEvent.clientY, button: nativeEvent.button,
            buttons: nativeEvent.buttons, altKey: nativeEvent.altKey, ctrlKey: nativeEvent.ctrlKey,
            metaKey: nativeEvent.metaKey, shiftKey: nativeEvent.shiftKey, detail: nativeEvent.detail
        });
    }
    if (nativeEvent instanceof KeyboardEvent) {
        Object.assign(syntheticEvent, {
            key: nativeEvent.key, code: nativeEvent.code, altKey: nativeEvent.altKey,
            ctrlKey: nativeEvent.ctrlKey, metaKey: nativeEvent.metaKey, shiftKey: nativeEvent.shiftKey
        });
    }

    return syntheticEvent;
}

function releaseSyntheticEvent(syntheticEvent: SyntheticEvent): void {
    if (!POOL_CONFIG.enablePooling) return;
    const pool = eventPools.get(syntheticEvent.type)!;
    const stats = poolStats.get(syntheticEvent.type)!;

    if (pool.length < POOL_CONFIG.maxPoolSize) {
        // Clean references
        Object.assign(syntheticEvent, {
            target: null,
            currentTarget: null,
            preventDefault: () => {},
            stopPropagation: () => {},
            stopImmediatePropagation: () => {},
            release: () => {}
        });
        ['key', 'code', 'clientX', 'clientY', 'button', 'buttons', 'altKey', 'ctrlKey', 'metaKey', 'shiftKey', 'detail']
            .forEach(prop => delete syntheticEvent[prop as keyof SyntheticEvent]);

        pool.push(syntheticEvent);
        stats.released++;

        if (pool.length > POOL_CONFIG.warningThreshold) {
            console.warn(`Event pool for "${syntheticEvent.type}" is getting large: ${pool.length} events`);
        }
    }
}

export const configureEventPooling = (config: Partial<typeof POOL_CONFIG>) => {
    Object.assign(POOL_CONFIG, config);
    if (!config.enablePooling) eventPools.forEach(pool => pool.length = 0);
};

export const getEventPoolStats = () => {
    const stats: Record<string, any> = {};
    poolStats.forEach((stat, eventType) => stats[eventType] = { ...stat, poolSize: eventPools.get(eventType)?.length || 0 });
    return stats;
};

export const clearEventPools = () => {
    eventPools.forEach(pool => pool.length = 0);
    poolStats.forEach(stat => Object.assign(stat, { created: 0, reused: 0, released: 0 }));
};


// Initialiser le système de délégation globale
export function initializeEventSystem(): void {
    if (isInitialized) return;

    // Initialiser les pools d'événements
    initializePools();

    // Ajouter un écouteur global seulement pour les événements bubbling
    BUBBLING_EVENTS.forEach(eventType => {
        document.addEventListener(eventType, dispatchEvent);
    });

    isInitialized = true;
}

// Enregistrer un handler d'événement
export function registerEventHandler(
    eventType: string, 
    handler: (event: SyntheticEvent | Event) => void
): string {
    const id = `event-${Date.now()}-${generateId()}`;
    eventRegistry.set(id, { id, handler, eventType });
    initializeEventSystem();
    return id;
}

// Supprimer un handler d'événement
export function removeEventHandler(eventId: string): void {
    const handler = eventRegistry.get(eventId);
    if (handler) {
        eventRegistry.delete(eventId);
    }
}

// Mettre à jour un handler d'événement existant
export function updateEventHandler(eventId: string, newHandler: (event: SyntheticEvent | Event) => void): void {
    const existingHandler = eventRegistry.get(eventId);
    if (existingHandler) {
        eventRegistry.set(eventId, { ...existingHandler, handler: newHandler });
    }
}

// Attacher un listener direct pour événements non-bubbling
export function attachDirectListener(element: HTMLElement, eventType: string, eventId: string): void {
    const elementId = element.id;
    if (!elementId) return;

    const listener = (event: Event) => {
        const handler = eventRegistry.get(eventId);
        if (handler?.eventType === eventType) {
            const syntheticEvent = POOL_CONFIG.enablePooling ? createSyntheticEvent(event) : null;
            handler.handler(syntheticEvent || event);
            if (syntheticEvent) {
                setTimeout(() => syntheticEvent.release?.(), 0);
            }
        }
    };

    if (!directListeners.has(elementId)) {
        directListeners.set(elementId, new Map());
    }

    const elementListeners = directListeners.get(elementId)!;
    const oldListener = elementListeners.get(eventType);
    if (oldListener) {
        element.removeEventListener(eventType, oldListener);
    }

    element.addEventListener(eventType, listener);
    elementListeners.set(eventType, listener);
}

// Supprimer un listener direct
export function removeDirectListener(element: HTMLElement, eventType: string): void {
    const elementId = element.id;
    if (!elementId) return;

    const elementListeners = directListeners.get(elementId);
    if (!elementListeners) return;

    const listener = elementListeners.get(eventType);
    if (listener) {
        element.removeEventListener(eventType, listener);
        elementListeners.delete(eventType);

        if (elementListeners.size === 0) {
            directListeners.delete(elementId);
        }
    }
}

// Helper pour supprimer tous les événements d'un élément
export function removeElementEventHandlers(element: HTMLElement): void {
    for (const key in element.dataset) {
        if (key.startsWith('event') && key.endsWith('Id')) {
            const eventId = element.dataset[key];
            if (eventId && eventRegistry.has(eventId)) {
                removeEventHandler(eventId);
            }
        }
    }

    // Supprimer également tous les listeners directs pour cet élément
    if (element.id) {
        const elementListeners = directListeners.get(element.id);
        if (elementListeners) {
            elementListeners.forEach((listener, eventType) => {
                element.removeEventListener(eventType, listener);
            });
            directListeners.delete(element.id);
        }
    }
}

function dispatchEvent(event: Event): void {
    let target = event.target as HTMLElement;
    let syntheticEvent: SyntheticEvent | null = null;
    let handlersExecuted = 0;

    while (target) {
        const eventId = target.dataset[`event${event.type.charAt(0).toUpperCase() + event.type.slice(1)}Id`];
        if (eventId) {
            const handler = eventRegistry.get(eventId);
            if (handler?.eventType === event.type) {
                if (!syntheticEvent && POOL_CONFIG.enablePooling) syntheticEvent = createSyntheticEvent(event);
                handler.handler(syntheticEvent || event);
                handlersExecuted++;
            }
        }
        target = target.parentElement as HTMLElement;
    }

    if (syntheticEvent && handlersExecuted > 0) {
        setTimeout(() => syntheticEvent!.release?.(), 0);
    }
}

// BUG (Core P4 #8 + #11): dispatchEventManualRelease and setEventReleaseMode below are
// dead code — setEventReleaseMode is exported but never called anywhere in the codebase.
// The "manual release" concept (caller controls SyntheticEvent pool return) is incomplete:
// no API exists for callers to invoke release() outside the dispatch cycle.
// Additionally (#11), setEventReleaseMode iterates SUPPORTED_EVENTS which includes
// non-bubbling events (scroll, focus, blur) and adds them to document — they will never
// fire there, creating a silent dead dispatch path.
// SOLUTION: delete both functions. Auto-release via setTimeout already works. If manual
// release is ever needed, design it from scratch restricted to BUBBLING_EVENTS only.
const dispatchEventManualRelease = (event: Event) => {
    let target = event.target as HTMLElement;
    while (target) {
        const eventId = target.dataset[`event${event.type.charAt(0).toUpperCase() + event.type.slice(1)}Id`];
        if (eventId) {
            const handler = eventRegistry.get(eventId);
            if (handler?.eventType === event.type) {
                handler.handler(POOL_CONFIG.enablePooling ? createSyntheticEvent(event) : event);
            }
        }
        target = target.parentElement as HTMLElement;
    }
};

export const setEventReleaseMode = (mode: 'auto' | 'manual') => {
    if (!isInitialized) return;
    const dispatcher = mode === 'manual' ? dispatchEventManualRelease : dispatchEvent;
    SUPPORTED_EVENTS.forEach(type => {
        document.removeEventListener(type, dispatchEvent);
        document.removeEventListener(type, dispatchEventManualRelease);
        document.addEventListener(type, dispatcher);
    });
};