import { PathBuilder } from "../utils/pathBuilder";

// Types pour les listeners de changement d'état
type StateListener<T> = (newState: T, oldState: T) => void;
type PathListener = (newValue: any, oldValue: any) => void;

// Classe Store pour gérer l'état réactif
export class Store<T = any> {
    private state: T;
    private listeners: StateListener<T>[] = [];
    private pathListeners = new Map<string, PathListener[]>();

    // Propriétés pour batching
    private pendingUpdate = false;
    private pendingChanges = new Set<string>();
    private rafId: number | null = null;
    private batchOldState: T | null = null;
    private batchNewState: T | null = null;

    constructor(initialState: T) {
        this.state = initialState;
    }

    // Obtenir l'état actuel
    getState(): T {
        return this.state;
    }

    // Dans Store, rendez cette méthode publique
    public getValueByPath(path: string): any {
        return this.getValueByPathAndObject(this.state, path);
    }

    // Obtenir une valeur dans l'état par son chemin (ex: "user.name", "matrix[0][1].value")
    private getValueByPathAndObject(obj: any, path: string): any {
        if (!path) return obj;

        let current = obj;
        let i = 0;

        while (i < path.length && current !== null && current !== undefined) {
            // Find next delimiter (. or [)
            let nextDelimiter = path.length;
            const dotIndex = path.indexOf('.', i);
            const bracketIndex = path.indexOf('[', i);

            if (dotIndex !== -1) nextDelimiter = Math.min(nextDelimiter, dotIndex);
            if (bracketIndex !== -1) nextDelimiter = Math.min(nextDelimiter, bracketIndex);

            if (nextDelimiter === i) {
                // We're at a delimiter, handle it
                if (path[i] === '.') {
                    i++; // Skip the dot
                    continue;
                } else if (path[i] === '[') {
                    // Find the closing bracket
                    const closingBracket = path.indexOf(']', i);
                    if (closingBracket === -1) break;

                    const index = parseInt(path.substring(i + 1, closingBracket));
                    if (isNaN(index)) break;

                    current = current[index];
                    i = closingBracket + 1;
                    continue;
                }
            } else {
                // Extract property name
                const propertyName = path.substring(i, nextDelimiter);
                current = current[propertyName];
                i = nextDelimiter;
            }
        }

        return current;
    }

    // Détecter tous les chemins qui ont changé entre deux états
    private detectChangedPaths(oldState: T, newState: T, basePath: string = ''): string[] {
        const changedPaths: string[] = [];
        
        // Vérifier que nous avons des objets à comparer
        if (!oldState || !newState || typeof oldState !== 'object' || typeof newState !== 'object') {
            return changedPaths;
        }
        
        // Vérifier toutes les clés de newState
        for (const key in newState) {
            const fullPath = basePath ? `${basePath}.${key}` : key;
            const oldValue = oldState[key];
            const newValue = newState[key];
            
            if (oldValue !== newValue) {
                changedPaths.push(fullPath);
                
                // Si c'est un objet/array, descendre récursivement pour plus de granularité
                if (newValue && typeof newValue === 'object' && 
                    oldValue && typeof oldValue === 'object') {
                    
                    if (Array.isArray(newValue) && Array.isArray(oldValue)) {
                        // Gérer les arrays avec indices
                        const maxLength = Math.max(oldValue.length, newValue.length);
                        for (let i = 0; i < maxLength; i++) {
                            const arrayPath = `${fullPath}[${i}]`;
                            if (oldValue[i] !== newValue[i]) {
                                changedPaths.push(arrayPath);
                                
                                // Récursion sur les éléments d'array si ce sont des objets
                                if (newValue[i] && typeof newValue[i] === 'object' &&
                                    oldValue[i] && typeof oldValue[i] === 'object') {
                                    changedPaths.push(...this.detectChangedPaths(
                                        oldValue[i] as T, newValue[i] as T, arrayPath
                                    ));
                                }
                            }
                        }
                    } else {
                        // Récursion sur les objets
                        changedPaths.push(...this.detectChangedPaths(
                            oldValue as T, newValue as T, fullPath
                        ));
                    }
                }
            }
        }

        const oldStateObj = oldState as Record<string, any>;
        const newStateObj = newState as Record<string, any>;
        
        // Vérifier les propriétés supprimées (présentes dans oldState mais pas newState)
        for (const key in oldStateObj) {
            if (!(key in newStateObj)) {
                const fullPath = basePath ? `${basePath}.${key}` : key;
                changedPaths.push(fullPath);
            }
        }
        
        return changedPaths;
    }

    // Notifier les listeners abonnés aux chemins spécifiques
    private notifyPathListeners(oldState: T, newState: T): void {
        this.pathListeners.forEach((listeners, path) => {
            // Check if this specific path changed by comparing values
            const oldValue = this.getValueByPathAndObject(oldState, path);
            const newValue = this.getValueByPathAndObject(newState, path);

            if (oldValue !== newValue) {
                listeners.forEach(listener => listener(newValue, oldValue));
            }
        });
    }

    // Exécuter toutes les mises à jour en une fois
    private flushUpdates(): void {
        // BUG (Core P2): detectChangedPaths flags removed top-level keys but doesn't
        // recurse into them, so sub-path subscribers (e.g. "user.name") are never added
        // to pendingChanges and their listeners are silently skipped. setState (non-batched)
        // correctly handles this via notifyPathListeners which value-compares every
        // registered path directly. SOLUTION: replace pendingChanges iteration with a
        // notifyPathListeners call — same logic as setState, eliminates the asymmetry and
        // allows detectChangedPaths / pendingChanges to be removed entirely.
        this.pendingChanges.forEach(path => {
            const listeners = this.pathListeners.get(path);
            if (listeners) {
                const oldValue = this.getValueByPathAndObject(this.batchOldState!, path);
                const newValue = this.getValueByPathAndObject(this.batchNewState!, path);
                listeners.forEach(listener => listener(newValue, oldValue));
            }
        });

        this.listeners.forEach(listener => listener(this.batchNewState!, this.batchOldState!));

        this.pendingUpdate = false;
        this.pendingChanges.clear();
        this.rafId = null;
        this.batchOldState = null;
        this.batchNewState = null;
    }

    // Planifier une mise à jour batchée
    private scheduleBatchUpdate(oldState: T, newState: T): void {
        if (!this.pendingUpdate) {
            this.batchOldState = oldState;
        }
        this.batchNewState = newState;

        const changedPaths = this.detectChangedPaths(oldState, newState);
        changedPaths.forEach(path => this.pendingChanges.add(path));

        if (!this.pendingUpdate) {
            this.pendingUpdate = true;
            this.rafId = requestAnimationFrame(() => {
                this.flushUpdates();
            });
        }
    }
    
    // Notification immédiate des listeners
    private notifyListeners(oldState: T, newState: T): void {
        this.notifyPathListeners(oldState, newState);
        this.listeners.forEach(listener => listener(newState, oldState));
    }

    // Forcer l'exécution immédiate des updates (utile pour les tests)
    flushSync(): void {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.flushUpdates();
        }
    }

    

    // Modifier l'état immédiatement
    setState(newState: Partial<T> | ((prevState: T) => T)): void {
        // BUG (Core P2): shallow spread shares nested object references between oldState
        // and this.state. A functional updater that mutates a nested object in-place makes
        // oldState.nested === this.state.nested, so notifyPathListeners sees no change.
        // SOLUTION: enforce immutable update discipline — updaters must return a new object,
        // not mutate in place. Add a dev-mode identity check: if the updater returns the
        // same reference as the previous state, warn immediately. structuredClone() is
        // correct but O(n) on every call — unacceptable at 60fps game-loop state writes.
        const oldState = { ...this.state };
        
        if (typeof newState === 'function') {
            this.state = newState(oldState);
        } else {
            this.state = { ...oldState, ...newState };
        }

        this.notifyListeners(oldState, this.state);
    }

    // Modifier l'état pour batch updates
    setBatchedState(newState: Partial<T> | ((prevState: T) => T)): void {
        const oldState = { ...this.state };
        
        if (typeof newState === 'function') {
            this.state = newState(oldState);
        } else {
            this.state = { ...oldState, ...newState };
        }

        this.scheduleBatchUpdate(oldState, this.state);
    }

    // S'abonner aux changements d'état
    subscribe(listener: StateListener<T>): () => void {
        this.listeners.push(listener);

        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    // S'abonner à un chemin spécifique dans l'état
    subscribeTo(path: string, listener: PathListener): () => void {
        if (!this.pathListeners.has(path)) {
            this.pathListeners.set(path, []);
        }
        this.pathListeners.get(path)!.push(listener);
        
        return () => {
            const listeners = this.pathListeners.get(path);
            if (listeners) {
                const index = listeners.indexOf(listener);
                if (index > -1) listeners.splice(index, 1);
            }
        };
    }

    createPath(): PathBuilder<T> {
        return new PathBuilder<T>();
    }

    subscribeToPath<U>(pathBuilder: PathBuilder<U>, listener: PathListener): () => void {
        return this.subscribeTo(pathBuilder.path(), listener);
    }
}

// ------------ Fonctions utilitaires ------------

// -----------------------------------------------

// Instance globale du store (store unique comme convenu)
export const globalStore = new Store<Record<string, any>>({});

export function getState() : any;
export function getState<T = any>(key: string): T;
export function getState(key?: string) {
    const state = globalStore.getState();
    return key ? state[key] : state;
}

export function setState<T>(newState: Partial<T> | ((prevState: T) => T)) {
    globalStore.setState(newState);
}

export function setBatchedState<T>(newState: Partial<T> | ((prevState: T) => T)) {
    globalStore.setBatchedState(newState);
}

export function subscribeToPath<U>(pathBuilder: PathBuilder<U>, listener: PathListener): () => void {
    return globalStore.subscribeToPath(pathBuilder, listener);
}

export function createStatePath(): PathBuilder<any> {
    return globalStore.createPath();
}