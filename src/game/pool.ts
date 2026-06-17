export interface PoolOptions<T> {
    factory: () => T;
    reset?: (item: T) => void;
    initialSize?: number;
    maxSize?: number;
}

export class Pool<T> {
    private available: T[] = [];
    private readonly factory: () => T;
    private readonly resetFn?: (item: T) => void;
    private readonly maxSize: number;
    private activeCount = 0;

    constructor(options: PoolOptions<T>) {
        this.factory = options.factory;
        this.resetFn = options.reset;
        this.maxSize = options.maxSize ?? Infinity;
        if (options.initialSize) this.prewarm(options.initialSize);
    }

    prewarm(count: number): void {
        for (let i = 0; i < count && this.available.length < this.maxSize; i++) {
            this.available.push(this.factory());
        }
    }

    acquire(): T {
        const item = this.available.pop() ?? this.factory();
        this.activeCount++;
        return item;
    }

    release(item: T): void {
        this.activeCount = Math.max(0, this.activeCount - 1);
        this.resetFn?.(item);
        if (this.available.length < this.maxSize) {
            this.available.push(item);
        }
    }

    getAvailableCount(): number { return this.available.length; }
    getActiveCount(): number { return this.activeCount; }
    getTotalCount(): number { return this.available.length + this.activeCount; }

    clear(): void {
        this.available = [];
        this.activeCount = 0;
    }
}
