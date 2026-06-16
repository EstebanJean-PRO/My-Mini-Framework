function equalBase(a: any, b: any, deep: boolean, visited = new WeakSet()): boolean {
    if (a === b) return true;

    if (typeof a !== typeof b || a == null || b == null) return false;

    if (typeof a !== 'object') return a === b;

    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();

    if (a instanceof RegExp && b instanceof RegExp) return a.source === b.source && a.flags === b.flags;

    if (a instanceof Map && b instanceof Map) {
        if (a.size !== b.size) return false;
        for (const [k, v] of a) {
            if (!b.has(k)) return false;
            if (deep ? !equalBase(v, b.get(k), true, visited) : v !== b.get(k)) return false;
        }
        return true;
    }

    if (a instanceof Set && b instanceof Set) {
        if (a.size !== b.size) return false;
        for (const v of a) if (!b.has(v)) return false;
        return true;
    }

    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        return a.every((item, i) => deep ? equalBase(item, b[i], true, visited) : item === b[i]);
    }

    if (Array.isArray(a) || Array.isArray(b)) return false;

    if (visited.has(a)) return true;
    visited.add(a);

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    return keysA.every(key =>
        (key in b) &&
        (deep ? equalBase(a[key], b[key], true, visited) : a[key] === b[key])
    );
}

// APIs publiques
export function shallowEqual(a: any, b: any): boolean {
    return equalBase(a, b, false);
}

export function deepEqual(a: any, b: any): boolean {
    return equalBase(a, b, true);
}