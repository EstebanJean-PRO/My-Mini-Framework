let _nextId = 0;

export function generateId(): string {
    return `mf-${++_nextId}`;
}