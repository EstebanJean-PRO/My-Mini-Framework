// BUG (Core P2): 7-char base-36 random string; ~50% collision probability at ~280k IDs.
// In a game UI regenerating event-handler IDs every frame this is reachable quickly,
// causing two DOM nodes to share an ID and events to dispatch to the wrong handler.
// SOLUTION: monotonic counter with a framework prefix to avoid clashing with user
// data-* attributes. `let _nextId = 0; return \`mf-\${++_nextId}\`;`
export function generateId(): string {
    return `${Math.random().toString(36).substring(2, 9)}`;
}