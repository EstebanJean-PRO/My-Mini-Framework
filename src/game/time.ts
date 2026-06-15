/**
 * Game Time Utilities - Timers, stopwatches, scheduling, and delta time
 */

import { now, floor, max, min } from './utils';

// Timer
export class Timer {
    private startTime = 0;
    private pausedAt = 0;
    private pausedTotal = 0;
    private running = false;
    private completed = false;
    private laps: number[] = [];

    constructor(private duration = Infinity, private onComplete?: () => void) {}

    start(): this { this.startTime = now(); this.pausedTotal = 0; this.running = true; this.completed = false; this.laps = []; return this; }
    pause(): this { if (this.running && !this.pausedAt) this.pausedAt = now(); return this; }
    resume(): this { if (this.pausedAt) { this.pausedTotal += now() - this.pausedAt; this.pausedAt = 0; } return this; }
    stop(): this { this.running = false; this.pausedAt = 0; return this; }
    reset(): this { return this.stop().start(); }
    update(): boolean {
        if (!this.running || this.pausedAt) return false;
        const elapsed = this.getElapsed();
        if (elapsed >= this.duration) {
            this.completed = true;
            this.stop();
            this.onComplete?.();
            return true;
        }
        return false;
    }
    lap(): number { const time = this.getElapsed(); this.laps.push(time); return time; }
    getElapsed(): number {
        // BUG (Game P2): returns 0 as soon as stop() sets running=false. Any post-stop
        // query of elapsed time (including getRemaining() and getProgress()) gets a
        // misleading result — duration and 0 respectively.
        // SOLUTION: add `private _stoppedElapsed = 0`. In stop(), snapshot before
        // clearing running: `this._stoppedElapsed = this.getElapsed()`. Replace
        // `return 0` here with `return this._stoppedElapsed`. Reset to 0 in start().
        if (!this.running) return 0;
        const current = this.pausedAt || now();
        return current - this.startTime - this.pausedTotal;
    }
    getRemaining(): number { return max(0, this.duration - this.getElapsed()); }
    getProgress(): number { return min(1, this.getElapsed() / this.duration); }
    isRunning(): boolean { return this.running && !this.pausedAt; }
    isComplete(): boolean { return this.completed; }
    getLaps(): number[] { return [...this.laps]; }
}

// Scheduler
interface ScheduledTask {
    fn: () => void;
    delay: number;
    remaining: number;
    startTime: number;
    timeoutId: number | null;
    repeat: boolean;
}

export class Scheduler {
    private tasks = new Map<number, ScheduledTask>();
    private nextId = 0;
    private paused = false;

    delay(fn: () => void, ms: number): number {
        const id = this.nextId++;
        const task: ScheduledTask = {
            fn,
            delay: ms,
            remaining: ms,
            startTime: now(),
            timeoutId: setTimeout(() => this.executeTask(id), ms),
            repeat: false
        };
        this.tasks.set(id, task);
        return id;
    }

    repeat(fn: () => void, ms: number): number {
        const id = this.nextId++;
        const task: ScheduledTask = {
            fn,
            delay: ms,
            remaining: ms,
            startTime: now(),
            timeoutId: setInterval(fn, ms),
            repeat: true
        };
        this.tasks.set(id, task);
        return id;
    }

    pause(): void {
        if (this.paused) return;
        this.paused = true;
        const currentTime = now();

        this.tasks.forEach(task => {
            if (task.timeoutId === null) return;

            if (task.repeat) {
                // BUG (Game P2): clearInterval cancels the timer but task.remaining is
                // never updated. resume() restarts with setInterval(fn, task.delay),
                // discarding any partial progress in the current interval. One-shot tasks
                // correctly save remaining (lines below); repeat tasks silently do not.
                // SOLUTION: replace setInterval with chained setTimeout for all tasks.
                // In pause(): remaining = task.delay - (currentTime - task.startTime) % task.delay.
                // In resume(): always setTimeout(fn, task.remaining) — uniform for both
                // one-shot and repeat, no flag needed to distinguish timer type.
                clearInterval(task.timeoutId);
            } else {
                clearTimeout(task.timeoutId);
                const elapsed = currentTime - task.startTime;
                task.remaining = max(0, task.delay - elapsed);
            }
            task.timeoutId = null;
        });
    }

    resume(): void {
        if (!this.paused) return;
        this.paused = false;
        const currentTime = now();

        this.tasks.forEach((task, id) => {
            if (task.timeoutId !== null) return;

            task.startTime = currentTime;
            if (task.repeat) {
                task.timeoutId = setInterval(task.fn, task.delay);
            } else {
                task.timeoutId = setTimeout(() => this.executeTask(id), task.remaining);
            }
        });
    }

    cancel(id: number): void {
        const task = this.tasks.get(id);
        if (task) {
            if (task.timeoutId !== null) task.repeat ? clearInterval(task.timeoutId) : clearTimeout(task.timeoutId);
            this.tasks.delete(id);
        }
    }
    clear(): void {
        this.tasks.forEach(task => { if (task.timeoutId !== null) task.repeat ? clearInterval(task.timeoutId) : clearTimeout(task.timeoutId); });
        this.tasks.clear();
    }
    private executeTask(id: number): void {
        const task = this.tasks.get(id);
        if (task && !task.repeat) {
            task.fn();
            this.tasks.delete(id);
        }
    }
    isPaused(): boolean { return this.paused; }
    getTaskCount(): number { return this.tasks.size; }
}

// DeltaTime
export class DeltaTime {
    private last = now();
    private dt = 0;
    private scale = 1;
    private fps: number[] = [];

    update(): number {
        const curr = now();
        this.dt = (curr - this.last) * this.scale;
        this.last = curr;
        this.fps.push(1000 / this.dt);
        if (this.fps.length > 60) this.fps.shift();
        return this.dt;
    }
    getDelta(): number { return this.dt; }
    getDeltaSeconds(): number { return this.dt / 1000; }
    setTimeScale(s: number): void { this.scale = max(0, s); }
    getTimeScale(): number { return this.scale; }
    getFPS(): number { return this.fps.length ? this.fps.reduce((a, b) => a + b, 0) / this.fps.length : 0; }
    reset(): void { this.last = now(); this.dt = 0; this.fps = []; }
}

// Utilities
export const msToSec = (ms: number): number => ms / 1000;
export const secToMs = (sec: number): number => sec * 1000;
export const timestamp = (): number => now();
export const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export const formatTime = (ms: number, showHours = false): string => {
    const sec = floor(ms / 1000);
    const h = floor(sec / 3600), m = floor((sec % 3600) / 60), s = sec % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return showHours || h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};
