/**
 * Game Entity System - Base class for game objects with physics and components
 * Dependencies: math.ts (Vector2, collision), time.ts (optional)
 */

import { Vector2, type AABB, type Circle, aabbCollision, circleCollision, circleAABBCollision } from './math';
import { generateId } from '../utils/id';

// ============================================================================
// TYPES
// ============================================================================

export type CollisionShape =
    | { type: 'aabb'; width: number; height: number }
    | { type: 'circle'; radius: number };

export interface EntityOptions {
    position?: Vector2;
    velocity?: Vector2;
    rotation?: number;
    scale?: Vector2;
    mass?: number;
    drag?: number;
    active?: boolean;
    visible?: boolean;
    tags?: string[];
    collisionShape?: CollisionShape;
}

export interface EntityComponent {
    entity: Entity;
    update(deltaMs: number): void;
    render(ctx?: CanvasRenderingContext2D): void;
    destroy(): void;
}

// ============================================================================
// ENTITY BASE CLASS
// ============================================================================

export class Entity {
    // Transform
    position: Vector2;
    velocity: Vector2;
    acceleration: Vector2;
    rotation: number;
    scale: Vector2;

    // Physics
    mass: number;
    drag: number;

    // State
    active: boolean;
    visible: boolean;
    id: string;
    tags: Set<string>;

    // Collision
    collisionShape?: CollisionShape;

    // Components
    private components = new Map<string, EntityComponent>();

    constructor(options: EntityOptions = {}) {
        this.position = options.position?.clone() ?? new Vector2();
        this.velocity = options.velocity?.clone() ?? new Vector2();
        this.acceleration = new Vector2();
        this.rotation = options.rotation ?? 0;
        this.scale = options.scale?.clone() ?? new Vector2(1, 1);
        this.mass = options.mass ?? 1;
        this.drag = options.drag ?? 0;
        this.active = options.active ?? true;
        this.visible = options.visible ?? true;
        this.id = generateId();
        this.tags = new Set(options.tags ?? []);
        this.collisionShape = options.collisionShape;
        this.onInit();
    }

    onInit(): void {}
    onUpdate(deltaMs: number): void {}
    onFixedUpdate(fixedDelta: number): void {}
    onRender(ctx?: CanvasRenderingContext2D): void {}
    onDestroy(): void {}
    onCollision(other: Entity): void {}

    update(deltaMs: number): void {
        if (!this.active) return;
        this.onUpdate(deltaMs);
        this.components.forEach(component => component.update(deltaMs));
    }
    fixedUpdate(fixedDelta: number): void {
        if (!this.active) return;
        this.applyVelocity(fixedDelta);
        this.onFixedUpdate(fixedDelta);
    }
    render(ctx?: CanvasRenderingContext2D): void {
        if (!this.active || !this.visible) return;
        this.onRender(ctx);
        this.components.forEach(component => component.render(ctx));
    }
    // BUG (Game P2): destroy() sets active=false and clears components but never
    // removes the entity from EntityManager's three internal maps (entities,
    // entitiesByTag, entitiesById). Direct callers of destroy() bypass manager.remove(),
    // leaving the entity in all maps indefinitely — visible in getAll()/getByTag(),
    // iterated by checkCollisions(), and never GC'd.
    // SOLUTION: add `_destroyCallback?: () => void` to Entity. EntityManager.add() sets
    // it to () => this._removeFromMaps(entity); EntityManager.remove() clears it before
    // calling destroy() to prevent re-entry. destroy() calls _destroyCallback?.() then
    // nulls it. Decoupled: Entity carries no import of or hard reference to EntityManager.
    destroy(): void {
        this.active = false;
        this.visible = false;
        this.components.forEach(component => component.destroy());
        this.components.clear();
        this.onDestroy();
    }

    applyForce(force: Vector2): void {
        const acceleration = force.clone().divide(this.mass);
        this.acceleration.add(acceleration);
    }
    applyVelocity(deltaMs: number): void {
        const deltaSec = deltaMs / 1000;
        this.velocity.add(this.acceleration.clone().multiply(deltaSec));
        if (this.drag > 0) {
            const dragFactor = 1 - this.drag * deltaSec;
            this.velocity.multiply(Math.max(0, dragFactor));
        }
        this.position.add(this.velocity.clone().multiply(deltaSec));
        this.acceleration.set(0, 0);
    }

    getBounds(): AABB | Circle | null {
        if (!this.collisionShape) return null;
        return this.collisionShape.type === 'aabb' ? {
            x: this.position.x - this.collisionShape.width / 2,
            y: this.position.y - this.collisionShape.height / 2,
            width: this.collisionShape.width * this.scale.x,
            height: this.collisionShape.height * this.scale.y
        } : {
            x: this.position.x,
            y: this.position.y,
            radius: this.collisionShape.radius * Math.max(this.scale.x, this.scale.y)
        };
    }
    checkCollision(other: Entity): boolean {
        const bounds1 = this.getBounds();
        const bounds2 = other.getBounds();
        if (!bounds1 || !bounds2) return false;
        const isAABB1 = 'width' in bounds1;
        const isAABB2 = 'width' in bounds2;
        if (isAABB1 && isAABB2) return aabbCollision(bounds1 as AABB, bounds2 as AABB);
        if (!isAABB1 && !isAABB2) return circleCollision(bounds1 as Circle, bounds2 as Circle);
        const circle = (isAABB1 ? bounds2 : bounds1) as Circle;
        const aabb = (isAABB1 ? bounds1 : bounds2) as AABB;
        return circleAABBCollision(circle, aabb);
    }
    addComponent<T extends EntityComponent>(name: string, component: T): T {
        component.entity = this;
        this.components.set(name, component);
        return component;
    }
    getComponent<T extends EntityComponent>(name: string): T | undefined {
        return this.components.get(name) as T | undefined;
    }
    removeComponent(name: string): void {
        const component = this.components.get(name);
        if (component) {
            component.destroy();
            this.components.delete(name);
        }
    }
    hasComponent(name: string): boolean {
        return this.components.has(name);
    }
    getComponents(): EntityComponent[] {
        return Array.from(this.components.values());
    }
}

// ============================================================================
// ENTITY MANAGER
// ============================================================================

export class EntityManager {
    private entities = new Set<Entity>();
    private entitiesByTag = new Map<string, Set<Entity>>();
    private entitiesById = new Map<string, Entity>();

    add(entity: Entity): void {
        this.entities.add(entity);
        this.entitiesById.set(entity.id, entity);
        entity.tags.forEach(tag => {
            if (!this.entitiesByTag.has(tag)) this.entitiesByTag.set(tag, new Set());
            this.entitiesByTag.get(tag)!.add(entity);
        });
    }
    remove(entity: Entity): void {
        this.entities.delete(entity);
        this.entitiesById.delete(entity.id);
        entity.tags.forEach(tag => this.entitiesByTag.get(tag)?.delete(entity));
        entity.destroy();
    }
    update(deltaMs: number): void {
        this.entities.forEach(entity => { if (entity.active) entity.update(deltaMs); });
    }
    fixedUpdate(fixedDelta: number): void {
        this.entities.forEach(entity => { if (entity.active) entity.fixedUpdate(fixedDelta); });
    }
    render(ctx?: CanvasRenderingContext2D): void {
        this.entities.forEach(entity => { if (entity.active && entity.visible) entity.render(ctx); });
    }
    checkCollisions(): void {
        // BUG (Game P2): Array.from(this.entities) allocates a new array on every call.
        // checkCollisions() runs in the fixed-update path (~60×/sec), causing continuous
        // GC pressure regardless of whether the entity set changed.
        // SOLUTION: add `private _entityArray: Entity[] = []` and `private _dirty = true`.
        // Set _dirty = true in add() and remove(). Rebuild the array only when dirty:
        //   if (this._dirty) { this._entityArray = Array.from(this.entities); this._dirty = false; }
        // Zero allocation per frame when the entity set is stable.
        const entities = Array.from(this.entities);
        for (let i = 0; i < entities.length; i++) {
            for (let j = i + 1; j < entities.length; j++) {
                const entityA = entities[i];
                const entityB = entities[j];
                if (entityA.active && entityB.active && entityA.checkCollision(entityB)) {
                    entityA.onCollision(entityB);
                    entityB.onCollision(entityA);
                }
            }
        }
    }
    getAll(): Entity[] {
        return Array.from(this.entities);
    }
    getByTag(tag: string): Entity[] {
        return Array.from(this.entitiesByTag.get(tag) ?? []);
    }
    getById(id: string): Entity | undefined {
        return this.entitiesById.get(id);
    }
    clear(): void {
        this.entities.forEach(entity => entity.destroy());
        this.entities.clear();
        this.entitiesByTag.clear();
        this.entitiesById.clear();
    }
    getCount(): number {
        return this.entities.size;
    }
}

// ============================================================================
// SINGLETON PATTERN
// ============================================================================

let entityManager: EntityManager | null = null;

export const createEntityManager = (): EntityManager => {
    if (entityManager) {
        console.warn('EntityManager already exists. Use getEntityManager() or call destroyEntityManager() first.');
    }
    entityManager = new EntityManager();
    return entityManager;
};

export const getEntityManager = (): EntityManager => entityManager ?? (entityManager = new EntityManager());

export const destroyEntityManager = (): void => {
    if (entityManager) {
        entityManager.clear();
        entityManager = null;
    }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Quick entity creation helper
 */
export function createEntity(options: EntityOptions = {}): Entity {
    const entity = new Entity(options);
    getEntityManager().add(entity);
    return entity;
}

/**
 * Setup entity system with game loop
 */
export function setupEntitySystem(gameLoop: any): void {
    const manager = getEntityManager();

    gameLoop.setCallbacks({
        update: (deltaMs: number) => {
            manager.update(deltaMs);
        },
        fixedUpdate: (fixedDelta: number) => {
            manager.fixedUpdate(fixedDelta);
            manager.checkCollisions();
        },
        render: (ctx?: CanvasRenderingContext2D) => {
            manager.render(ctx);
        }
    });
}
