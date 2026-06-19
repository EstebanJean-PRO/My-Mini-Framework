import { describe, it, expect } from 'vitest';
import { Camera } from './camera';
import { Vector2, mulberry32 } from './math';

describe('Camera projection (Game P1 — world/screen transform)', () => {
  it('worldToScreen maps the world origin to the viewport center at default zoom/position', () => {
    const camera = new Camera({ viewportWidth: 800, viewportHeight: 600 });
    const screen = camera.worldToScreen(Vector2.zero());
    expect(screen.x).toBeCloseTo(400);
    expect(screen.y).toBeCloseTo(300);
  });

  it('worldToScreen maps the camera position to the viewport center', () => {
    const camera = new Camera({ viewportWidth: 800, viewportHeight: 600, position: new Vector2(50, 50) });
    const screen = camera.worldToScreen(new Vector2(50, 50));
    expect(screen.x).toBeCloseTo(400);
    expect(screen.y).toBeCloseTo(300);
  });

  it('worldToScreen scales offsets from the camera center by zoom', () => {
    const camera = new Camera({ viewportWidth: 800, viewportHeight: 600, zoom: 2 });
    const screen = camera.worldToScreen(new Vector2(10, 0));
    expect(screen.x).toBeCloseTo(420);
    expect(screen.y).toBeCloseTo(300);
  });

  it('screenToWorld is the inverse of worldToScreen', () => {
    const camera = new Camera({ viewportWidth: 800, viewportHeight: 600, position: new Vector2(12, -7), zoom: 1.5 });
    const worldPoint = new Vector2(33, 18);
    const roundTripped = camera.screenToWorld(camera.worldToScreen(worldPoint));
    expect(roundTripped.x).toBeCloseTo(worldPoint.x, 4);
    expect(roundTripped.y).toBeCloseTo(worldPoint.y, 4);
  });
});

describe('Camera.follow (Game P1 — lerp + deadzone)', () => {
  it('lerps toward the target by lerpFactor when there is no deadzone', () => {
    const camera = new Camera({ viewportWidth: 800, viewportHeight: 600 });
    camera.follow(new Vector2(100, 0), 0.5);
    expect(camera.position.x).toBeCloseTo(50);
    expect(camera.position.y).toBeCloseTo(0);
  });

  it('does not move while the target stays within the deadzone', () => {
    const camera = new Camera({ viewportWidth: 800, viewportHeight: 600, deadzone: { width: 20, height: 20 } });
    camera.follow(new Vector2(5, 0), 1);
    expect(camera.position.x).toBeCloseTo(0);
  });

  it('moves to keep the target at the deadzone edge once it exits the deadzone', () => {
    const camera = new Camera({ viewportWidth: 800, viewportHeight: 600, deadzone: { width: 20, height: 20 } });
    camera.follow(new Vector2(20, 0), 1);
    // half-width is 10; target at 20 exits the deadzone, camera moves so target sits
    // exactly at the deadzone edge: desiredX = 20 - 10 = 10
    expect(camera.position.x).toBeCloseTo(10);
  });
});

describe('Camera world bounds (Game P1)', () => {
  it('clamps the camera center so the viewport never shows outside world bounds', () => {
    const camera = new Camera({
      viewportWidth: 100,
      viewportHeight: 100,
      position: new Vector2(-1000, -1000),
      worldBounds: { x: 0, y: 0, width: 1000, height: 1000 },
    });
    // halfViewport (50,50) at zoom 1 -> min clamp is (50,50)
    expect(camera.position.x).toBeCloseTo(50);
    expect(camera.position.y).toBeCloseTo(50);
  });
});

describe('Camera trauma-based shake (Game P1)', () => {
  it('produces a deterministic shake offset driven by trauma and an injectable RNG', () => {
    const referenceRng = mulberry32(1);
    const r1 = referenceRng();
    const r2 = referenceRng();

    const camera = new Camera({
      viewportWidth: 800,
      viewportHeight: 600,
      shake: { decay: 0, maxOffset: 10, random: mulberry32(1) },
    });

    camera.addTrauma(1);
    camera.update(16);

    const offset = camera.getShakeOffset();
    expect(offset.x).toBeCloseTo(10 * (r1 * 2 - 1), 6);
    expect(offset.y).toBeCloseTo(10 * (r2 * 2 - 1), 6);
  });

  it('trauma decays over time and the shake offset returns to zero', () => {
    const camera = new Camera({
      viewportWidth: 800,
      viewportHeight: 600,
      shake: { decay: 1, maxOffset: 10, random: () => 0.75 },
    });

    camera.addTrauma(1);
    camera.update(1000); // 1 second at decay rate 1/sec -> trauma fully decays

    expect(camera.getTrauma()).toBeCloseTo(0, 6);
    const offset = camera.getShakeOffset();
    expect(offset.x).toBeCloseTo(0, 6);
    expect(offset.y).toBeCloseTo(0, 6);
  });
});

describe('Camera shake configurability (Game P1 — exposed config)', () => {
  it('setTrauma() sets trauma directly without requiring addTrauma()', () => {
    const camera = new Camera({ viewportWidth: 800, viewportHeight: 600 });
    camera.setTrauma(0.5);
    expect(camera.getTrauma()).toBeCloseTo(0.5);
    camera.setTrauma(2); // clamped to [0,1]
    expect(camera.getTrauma()).toBeCloseTo(1);
  });

  it('exponent controls how trauma maps to shake intensity', () => {
    const cameraSquared = new Camera({
      viewportWidth: 800, viewportHeight: 600,
      shake: { decay: 0, maxOffset: 10, exponent: 2, random: () => 1 },
    });
    const cameraLinear = new Camera({
      viewportWidth: 800, viewportHeight: 600,
      shake: { decay: 0, maxOffset: 10, exponent: 1, random: () => 1 },
    });

    cameraSquared.setTrauma(0.5);
    cameraSquared.update(16);
    cameraLinear.setTrauma(0.5);
    cameraLinear.update(16);

    // exponent=2: intensity=0.25 -> offset=10*0.25*1=2.5; exponent=1: intensity=0.5 -> offset=5
    expect(cameraSquared.getShakeOffset().x).toBeCloseTo(2.5, 6);
    expect(cameraLinear.getShakeOffset().x).toBeCloseTo(5, 6);
  });

  it('maxRotation produces a shake rotation reflected in getViewMatrix()', () => {
    const camera = new Camera({
      viewportWidth: 800, viewportHeight: 600,
      shake: { decay: 0, maxOffset: 0, maxRotation: Math.PI / 2, random: () => 1 },
    });

    camera.setTrauma(1);
    camera.update(16);

    expect(camera.getShakeRotation()).toBeCloseTo(Math.PI / 2, 6);
    // a 90° shake rotation should be visible in the view matrix's rotation component
    const m = camera.getViewMatrix();
    expect(m.b).toBeCloseTo(1, 4); // sin(90°) component of the rotation
  });

  it('an injected noise function replaces random() and is sampled by elapsed shake time', () => {
    const noise = (t: number) => Math.sin(t);
    const camera = new Camera({
      viewportWidth: 800, viewportHeight: 600,
      shake: { decay: 0, maxOffset: 10, noise, noiseFrequency: 1 },
    });

    camera.setTrauma(1);
    camera.update(500); // shakeTime becomes 0.5s

    const expectedX = 10 * Math.sin(0.5);
    expect(camera.getShakeOffset().x).toBeCloseTo(expectedX, 4);
  });
});

describe('Camera.zoomAt (Game P1 — anchor-point zoom)', () => {
  it('keeps the world point under the anchor screen point fixed after zooming', () => {
    const camera = new Camera({ viewportWidth: 800, viewportHeight: 600, position: new Vector2(10, 5), zoom: 1 });
    const anchorScreen = new Vector2(500, 350);
    const worldUnderAnchorBefore = camera.screenToWorld(anchorScreen);

    camera.zoomAt(anchorScreen, 3);

    const worldUnderAnchorAfter = camera.screenToWorld(anchorScreen);
    expect(worldUnderAnchorAfter.x).toBeCloseTo(worldUnderAnchorBefore.x, 4);
    expect(worldUnderAnchorAfter.y).toBeCloseTo(worldUnderAnchorBefore.y, 4);
    expect(camera.getZoom()).toBeCloseTo(3);
  });
});
