/**
 * Game Input Manager - Keyboard, mouse, gamepad, and touch input
 * Features: Input buffering, dead zones, multi-touch, gamepad support
 */

import { Vector2 } from './math';

type InputState = { down: boolean; pressed: boolean; released: boolean };
type InputSnapshot = { keys: Set<string>; mouseButtons: boolean[]; mousePos: Vector2; gamepads: GamepadSnapshot[]; touches: TouchSnapshot[] };
type GamepadSnapshot = { buttons: boolean[]; axes: number[] };
type TouchSnapshot = { id: number; pos: Vector2 };

export type AxisKeyConfig = {
    up: string[];
    down: string[];
    left: string[];
    right: string[];
};
export type DeadZoneConfig = { stick: number; trigger: number };

export class InputManager {
    private keys = new Map<string, InputState>();
    private mouse = { buttons: [this.newState(), this.newState(), this.newState()], pos: new Vector2(), delta: new Vector2() };
    private actions = new Map<string, string[]>();
    private axisKeys: AxisKeyConfig = {
        up: ['w', 'arrowup', 'z'],        // QWERTY W + AZERTY Z
        down: ['s', 'arrowdown'],
        left: ['a', 'arrowleft', 'q'],    // QWERTY A + AZERTY Q
        right: ['d', 'arrowright']
    };

    // Input buffering (60 frames circular buffer)
    private buffer: InputSnapshot[] = [];
    private bufferSize = 60;
    private bufferIndex = 0;

    // Gamepad support
    private gamepads = new Map<number, { buttons: InputState[]; axes: number[] }>();
    private deadZones: DeadZoneConfig = { stick: 0.15, trigger: 0.1 };

    // Touch support
    private touches = new Map<number, { pos: Vector2; startPos: Vector2 }>();

    private newState(): InputState { return { down: false, pressed: false, released: false }; }
    private getOrCreate(key: string): InputState {
        if (!this.keys.has(key)) this.keys.set(key, this.newState());
        return this.keys.get(key)!;
    }

    private normalizeKey(key: string): string { return key === ' ' ? 'space' : key.toLowerCase(); }
    private onKeyDown = (e: KeyboardEvent): void => {
        const key = this.normalizeKey(e.key), state = this.getOrCreate(key);
        if (!state.down) state.pressed = true;
        state.down = true;
    };
    private onKeyUp = (e: KeyboardEvent): void => {
        const key = this.normalizeKey(e.key), state = this.getOrCreate(key);
        state.down = false;
        state.released = true;
    };
    private onMouseDown = (e: MouseEvent): void => {
        if (e.button < 3) {
            const state = this.mouse.buttons[e.button];
            if (!state.down) state.pressed = true;
            state.down = true;
        }
    };
    private onMouseUp = (e: MouseEvent): void => {
        if (e.button < 3) {
            this.mouse.buttons[e.button].down = false;
            this.mouse.buttons[e.button].released = true;
        }
    };
    private onMouseMove = (e: MouseEvent): void => {
        this.mouse.delta.set(e.clientX - this.mouse.pos.x, e.clientY - this.mouse.pos.y);
        this.mouse.pos.set(e.clientX, e.clientY);
    };

    // Touch event handlers
    private onTouchStart = (e: TouchEvent): void => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const pos = new Vector2(touch.clientX, touch.clientY);
            this.touches.set(touch.identifier, { pos, startPos: pos.clone() });
        }
    };
    private onTouchMove = (e: TouchEvent): void => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const existing = this.touches.get(touch.identifier);
            if (existing) existing.pos.set(touch.clientX, touch.clientY);
        }
    };
    private onTouchEnd = (e: TouchEvent): void => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            this.touches.delete(e.changedTouches[i].identifier);
        }
    };

    constructor() {
        document.addEventListener('keydown', this.onKeyDown);
        document.addEventListener('keyup', this.onKeyUp);
        document.addEventListener('mousedown', this.onMouseDown);
        document.addEventListener('mouseup', this.onMouseUp);
        document.addEventListener('mousemove', this.onMouseMove);
        document.addEventListener('touchstart', this.onTouchStart, { passive: false });
        document.addEventListener('touchmove', this.onTouchMove, { passive: false });
        document.addEventListener('touchend', this.onTouchEnd, { passive: false });
        document.addEventListener('touchcancel', this.onTouchEnd, { passive: false });
    }

    update(): void {
        // Update gamepads
        this.updateGamepads();

        // Create input snapshot for buffer
        const snapshot: InputSnapshot = {
            keys: new Set(Array.from(this.keys.entries()).filter(([_, s]) => s.down).map(([k]) => k)),
            mouseButtons: this.mouse.buttons.map(s => s.down),
            mousePos: this.mouse.pos.clone(),
            gamepads: Array.from(this.gamepads.values()).map(gp => ({
                buttons: gp.buttons.map(s => s.down),
                axes: [...gp.axes]
            })),
            touches: Array.from(this.touches.entries()).map(([id, t]) => ({ id, pos: t.pos.clone() }))
        };

        // Add to circular buffer
        if (this.buffer.length < this.bufferSize) {
            this.buffer.push(snapshot);
        } else {
            this.buffer[this.bufferIndex] = snapshot;
        }
        this.bufferIndex = (this.bufferIndex + 1) % this.bufferSize;

        // Clear frame states
        this.keys.forEach(state => { state.pressed = state.released = false; });
        this.mouse.buttons.forEach(state => { state.pressed = state.released = false; });
        this.gamepads.forEach(gp => gp.buttons.forEach(state => { state.pressed = state.released = false; }));
        this.mouse.delta.set(0, 0);
    }

    private updateGamepads(): void {
        const gamepads = navigator.getGamepads?.();
        if (!gamepads) return;

        for (let i = 0; i < gamepads.length; i++) {
            const gp = gamepads[i];
            if (!gp) {
                this.gamepads.delete(i);
                continue;
            }

            let gpData = this.gamepads.get(i);
            if (!gpData) {
                gpData = { buttons: Array(gp.buttons.length).fill(null).map(() => this.newState()), axes: [] };
                this.gamepads.set(i, gpData);
            }

            // Update buttons
            for (let b = 0; b < gp.buttons.length; b++) {
                const pressed = gp.buttons[b].pressed;
                const state = gpData.buttons[b];
                if (pressed && !state.down) state.pressed = true;
                if (!pressed && state.down) state.released = true;
                state.down = pressed;
            }

            // Update axes with dead zone
            gpData.axes = gp.axes.map((value, idx) => {
                const deadZone = idx < 4 ? this.deadZones.stick : this.deadZones.trigger;
                return Math.abs(value) < deadZone ? 0 : value;
            });
        }
    }

    isKeyDown(key: string): boolean { return this.keys.get(key.toLowerCase())?.down ?? false; }
    isKeyPressed(key: string): boolean { return this.keys.get(key.toLowerCase())?.pressed ?? false; }
    isKeyReleased(key: string): boolean { return this.keys.get(key.toLowerCase())?.released ?? false; }
    getMousePosition(): Vector2 { return this.mouse.pos.clone(); }
    getMouseDelta(): Vector2 { return this.mouse.delta.clone(); }
    isMouseButtonDown(btn: number): boolean { return this.mouse.buttons[btn]?.down ?? false; }
    isMouseButtonPressed(btn: number): boolean { return this.mouse.buttons[btn]?.pressed ?? false; }
    isMouseButtonReleased(btn: number): boolean { return this.mouse.buttons[btn]?.released ?? false; }
    mapAction(name: string, keys: string[]): void { this.actions.set(name, keys.map(k => k.toLowerCase())); }
    isActionDown(name: string): boolean { return this.actions.get(name)?.some(k => this.isKeyDown(k)) ?? false; }
    isActionPressed(name: string): boolean { return this.actions.get(name)?.some(k => this.isKeyPressed(k)) ?? false; }
    isActionReleased(name: string): boolean { return this.actions.get(name)?.some(k => this.isKeyReleased(k)) ?? false; }
    getAxis(axis: 'horizontal' | 'vertical'): number {
        if (axis === 'horizontal') {
            const right = this.axisKeys.right.some(k => this.isKeyDown(k)) ? 1 : 0;
            const left = this.axisKeys.left.some(k => this.isKeyDown(k)) ? 1 : 0;
            return right - left;
        }
        const down = this.axisKeys.down.some(k => this.isKeyDown(k)) ? 1 : 0;
        const up = this.axisKeys.up.some(k => this.isKeyDown(k)) ? 1 : 0;
        return down - up;
    }
    setAxisKeys(config: Partial<AxisKeyConfig>): void { Object.assign(this.axisKeys, config); }
    getAxisKeys(): AxisKeyConfig { return { ...this.axisKeys }; }

    // Gamepad API
    isGamepadButtonDown(gamepadIndex: number, button: number): boolean { return this.gamepads.get(gamepadIndex)?.buttons[button]?.down ?? false; }
    isGamepadButtonPressed(gamepadIndex: number, button: number): boolean { return this.gamepads.get(gamepadIndex)?.buttons[button]?.pressed ?? false; }
    isGamepadButtonReleased(gamepadIndex: number, button: number): boolean { return this.gamepads.get(gamepadIndex)?.buttons[button]?.released ?? false; }
    getGamepadAxis(gamepadIndex: number, axis: number): number { return this.gamepads.get(gamepadIndex)?.axes[axis] ?? 0; }
    getGamepadStick(gamepadIndex: number, stick: 'left' | 'right'): Vector2 {
        const gp = this.gamepads.get(gamepadIndex);
        if (!gp) return new Vector2();
        const offset = stick === 'left' ? 0 : 2;
        return new Vector2(gp.axes[offset] ?? 0, gp.axes[offset + 1] ?? 0);
    }
    getConnectedGamepads(): number[] { return Array.from(this.gamepads.keys()); }
    vibrateGamepad(gamepadIndex: number, weakMagnitude: number, strongMagnitude: number, duration: number): void {
        const gp = navigator.getGamepads?.()?.[gamepadIndex];
        gp?.vibrationActuator?.playEffect?.('dual-rumble', { weakMagnitude, strongMagnitude, duration });
    }

    // Touch API
    getTouches(): { id: number; pos: Vector2; startPos: Vector2 }[] {
        return Array.from(this.touches.entries()).map(([id, t]) => ({ id, pos: t.pos.clone(), startPos: t.startPos.clone() }));
    }
    getTouch(id: number): { pos: Vector2; startPos: Vector2 } | null {
        const t = this.touches.get(id);
        return t ? { pos: t.pos.clone(), startPos: t.startPos.clone() } : null;
    }
    getTouchCount(): number { return this.touches.size; }

    // Input buffering
    getInputBuffer(framesBack = 0): InputSnapshot | null {
        if (framesBack < 0 || framesBack >= this.buffer.length) return null;
        const idx = (this.bufferIndex - 1 - framesBack + this.bufferSize) % this.bufferSize;
        return this.buffer[idx] ?? null;
    }
    getBufferSize(): number { return this.bufferSize; }
    setBufferSize(size: number): void {
        this.bufferSize = Math.max(1, size);
        if (this.buffer.length > this.bufferSize) {
            this.buffer = this.buffer.slice(-this.bufferSize);
            this.bufferIndex = 0;
        }
    }

    // Dead zone configuration
    setDeadZones(config: Partial<DeadZoneConfig>): void { Object.assign(this.deadZones, config); }
    getDeadZones(): DeadZoneConfig { return { ...this.deadZones }; }

    clear(): void {
        this.keys.clear();
        this.mouse.buttons.forEach(s => s.down = s.pressed = s.released = false);
        this.gamepads.clear();
        this.touches.clear();
        this.buffer = [];
        this.bufferIndex = 0;
    }
    destroy(): void {
        document.removeEventListener('keydown', this.onKeyDown);
        document.removeEventListener('keyup', this.onKeyUp);
        document.removeEventListener('mousedown', this.onMouseDown);
        document.removeEventListener('mouseup', this.onMouseUp);
        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('touchstart', this.onTouchStart);
        document.removeEventListener('touchmove', this.onTouchMove);
        document.removeEventListener('touchend', this.onTouchEnd);
        document.removeEventListener('touchcancel', this.onTouchEnd);
        this.clear();
    }
}

// Singleton
let input: InputManager | null = null;
export const getInput = (): InputManager => input ?? (input = new InputManager());
export const destroyInput = (): void => { input?.destroy(); input = null; };
