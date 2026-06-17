import { describe, it, expect, vi } from 'vitest';
import { Entity } from './entity';
import { Vector2 } from './math';

describe('Entity scene graph (Game P1 — Composite pattern)', () => {
  it('addChild() sets parent and includes the child in children; removeChild() reverses it', () => {
    const parent = new Entity();
    const child = new Entity();

    parent.addChild(child);
    expect(child.parent).toBe(parent);
    expect(parent.children).toContain(child);

    parent.removeChild(child);
    expect(child.parent).toBeNull();
    expect(parent.children).not.toContain(child);
  });

  it('addChild() detaches the child from its previous parent (re-parenting)', () => {
    const parentA = new Entity();
    const parentB = new Entity();
    const child = new Entity();

    parentA.addChild(child);
    parentB.addChild(child);

    expect(child.parent).toBe(parentB);
    expect(parentA.children).not.toContain(child);
    expect(parentB.children).toContain(child);
  });

  it('localToWorld() composes a child position with its parent translation', () => {
    const parent = new Entity({ position: new Vector2(10, 0) });
    const child = new Entity({ position: new Vector2(5, 0) });
    parent.addChild(child);

    const worldOrigin = child.localToWorld(Vector2.zero());

    expect(worldOrigin.x).toBeCloseTo(15);
    expect(worldOrigin.y).toBeCloseTo(0);
  });

  it('localToWorld() accounts for parent rotation', () => {
    const parent = new Entity({ position: new Vector2(0, 0), rotation: Math.PI / 2 });
    const child = new Entity({ position: new Vector2(1, 0) });
    parent.addChild(child);

    // child's local origin sits at local (1,0) relative to parent; parent rotated 90°
    // counter-clockwise (standard math convention) maps (1,0) -> (0,1)
    const worldOrigin = child.localToWorld(Vector2.zero());

    expect(worldOrigin.x).toBeCloseTo(0, 4);
    expect(worldOrigin.y).toBeCloseTo(1, 4);
  });

  it('worldToLocal() is the inverse of localToWorld()', () => {
    const parent = new Entity({ position: new Vector2(3, 4), rotation: 0.7 });
    const child = new Entity({ position: new Vector2(-2, 5), rotation: 0.3, scale: new Vector2(2, 1.5) });
    parent.addChild(child);

    const localPoint = new Vector2(1.5, -0.5);
    const worldPoint = child.localToWorld(localPoint);
    const roundTripped = child.worldToLocal(worldPoint);

    expect(roundTripped.x).toBeCloseTo(localPoint.x, 4);
    expect(roundTripped.y).toBeCloseTo(localPoint.y, 4);
  });

  it('update()/render() recurse into children (Composite — branch and leaf treated uniformly)', () => {
    const parent = new Entity();
    const child = new Entity();
    parent.addChild(child);

    const childUpdate = vi.spyOn(child, 'onUpdate');
    const childRender = vi.spyOn(child, 'onRender');

    parent.update(16);
    parent.render();

    expect(childUpdate).toHaveBeenCalledWith(16);
    expect(childRender).toHaveBeenCalled();
  });

  it('destroy() recursively destroys children and detaches from its own parent', () => {
    const grandparent = new Entity();
    const parent = new Entity();
    const child = new Entity();
    grandparent.addChild(parent);
    parent.addChild(child);

    const childDestroy = vi.spyOn(child, 'onDestroy');

    parent.destroy();

    expect(childDestroy).toHaveBeenCalled();
    expect(grandparent.children).not.toContain(parent);
  });
});
