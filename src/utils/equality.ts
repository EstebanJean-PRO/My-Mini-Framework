// BUG (Core P2): no circular-reference guard (infinite recursion on self-referencing
// objects) and no special-type handling — Date, RegExp, Map, Set all fall through to the
// Object.keys path and compare incorrectly (e.g. any two Dates return true regardless of
// value, any two Maps return true regardless of content).
// SOLUTION: add a WeakSet visited guard passed through recursion to break cycles; add
// explicit instanceof branches for Date (getTime), RegExp (source+flags), Map and Set
// (entry-by-entry comparison) before the Object.keys fallback.
function equalBase(a: any, b: any, deep: boolean): boolean {
    if (a === b) return true;
    
    if (typeof a !== typeof b || a == null || b == null) {
        return false;
    }
    
    if (typeof a !== 'object') {
        return a === b;
    }
    
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        
        return a.every((item, index) => 
            deep ? equalBase(item, b[index], true) : item === b[index]
        );
    }
    
    if (Array.isArray(a) || Array.isArray(b)) {
        return false;
    }
    
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    // BUG (Core P1): keysB.includes(key) is O(n) inside an O(n) every() → O(n²).
    // SOLUTION: replace with `key in b` — O(1) property lookup, same semantics.
    // keysB can then be dropped entirely (length check above is sufficient).
    return keysA.every(key =>
        keysB.includes(key) &&
        (deep ? equalBase(a[key], b[key], true) : a[key] === b[key])
    );
}

// APIs publiques
export function shallowEqual(a: any, b: any): boolean {
    return equalBase(a, b, false);
}

export function deepEqual(a: any, b: any): boolean {
    return equalBase(a, b, true);
}