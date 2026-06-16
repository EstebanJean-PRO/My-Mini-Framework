// BUG (Core P4 — unused import): VirtualElement is imported but never used as a type;
// the VirtualElement check at line ~36 uses duck typing (`'tag' in result`) instead.
// SOLUTION: remove this import; replace the duck-type check with `instanceof`-safe
// narrowing or import the type only when/if it is used explicitly.
import { VirtualElement } from "./types";
import { shallowEqual } from "../utils/equality";

// Interface pour stocker les informations de mémoïsation (générique)
interface MemoizedFunction<R = any> {
    lastProps: any;
    lastResult: R;
    func: (...args: any[]) => R;
}

const memoCache = new WeakMap<object, MemoizedFunction>();
// Cache pour les composants réactifs
const reactiveComponentCache = new WeakMap<Function, { lastProps: any; lastResult: any }>();

// Cache pour les gestionnaires d'événements mémoïsés
const handlerCache = new WeakMap<Function, { deps: any[], handler: Function }>();
// BUG (Core P4 — dead code): handlerIdCounter and handlerIds are written inside useCallback
// but never read anywhere. The apparent intent (stable numeric IDs for handler.ts's
// registry) was never connected — handler.ts uses its own generateId() system.
// SOLUTION: delete both declarations and the three write lines in useCallback (lines 69–71).
let handlerIdCounter = 0;
const handlerIds = new WeakMap<Function, number>();


// -----------------------------------------------


// Fonction de mémoïsation générique (peut mémoïser n'importe quelle fonction)
export function memo<T extends any[], R>(
    func: (...args: T) => R,
    areEqual?: (prevArgs: T, nextArgs: T) => boolean
): (...args: T) => R {
    return (...args: T) => {
        const cached = memoCache.get(func);

        if (cached && (areEqual ? areEqual(cached.lastProps, args) : shallowEqual(cached.lastProps, args))) {
            // Retourner le résultat du cache
            // Si c'est un VirtualElement, on peut ajouter des métadonnées
            if (cached.lastResult && typeof cached.lastResult === 'object' && 'tag' in cached.lastResult) {
                return {
                    ...cached.lastResult as any,
                    __memoized: true,
                    __memoKey: JSON.stringify(args)
                } as R;
            }
            return cached.lastResult;
        }

        const result = func(...args);
        memoCache.set(func, {
            lastProps: args,
            lastResult: result,
            func
        });

        return result;
    };
}

// Hook pour mémoïser les fonctions (similaire à React.useCallback)
export function useCallback<T extends Function>(
    callback: T,
    deps: any[]
): T {
    if (!handlerIds.has(callback)) {
        handlerIds.set(callback, handlerIdCounter++);
    }

    const cached = handlerCache.get(callback);

    if (cached && shallowEqual(cached.deps, deps)) {
        return cached.handler as T;
    }

    handlerCache.set(callback, { deps, handler: callback });
    return callback;
}

// BUG (Core P4): `return cached.lastResult` inside a constructor returns a stale
// ReactiveComponent instance — which may be unmounted, have dead store subscriptions,
// or be in an inconsistent lifecycle state. The cache key is `componentClass` itself,
// so only one instance is ever returned per class regardless of args (accidental singleton).
// SOLUTION: delete this function. ReactiveComponent is stateful; constructor-level
// memoization is unsound. The correct level is render() output — wrap the class's
// render() method with memo() to memoize VirtualElement results instead of instances.
export function memoizeReactiveComponent<T extends any[]>(
    componentClass: new (...args: T) => any,
    areEqual?: (prevArgs: T, nextArgs: T) => boolean
): (new (...args: T) => any) {
    return class extends componentClass {
        constructor(...args: T) {
            const cached = reactiveComponentCache.get(componentClass);
            
            if (cached && (areEqual ? areEqual(cached.lastProps, args) : shallowEqual(cached.lastProps, args))) {
                return cached.lastResult;
            }
            
            super(...args);
            reactiveComponentCache.set(componentClass, {
                lastProps: args,
                lastResult: this
            });
        }
    };
}