export type Unsubscribe = () => void;

let tracking = false;
let trackedPaths: Set<string> | null = null;

export function startTracking(): void {
    tracking = true;
    trackedPaths = new Set();
}

export function stopTracking(): string[] {
    tracking = false;
    const paths = trackedPaths ? Array.from(trackedPaths) : [];
    trackedPaths = null;
    return paths;
}

export function recordPath(path: string): void {
    if (tracking && trackedPaths) {
        trackedPaths.add(path);
    }
}
