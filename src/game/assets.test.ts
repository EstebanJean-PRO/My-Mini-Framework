import { describe, it, expect, vi, afterEach } from 'vitest';
import { AssetLoader, getAssetLoader, destroyAssetLoader } from './assets';

class FakeMediaElement {
  src = '';
  private listeners: Record<string, Function[]> = {};
  addEventListener(type: string, cb: Function): void { (this.listeners[type] ??= []).push(cb); }
  removeEventListener(): void {}
  dispatch(type: string): void { this.listeners[type]?.forEach(cb => cb()); }
}

function stubImage(): FakeMediaElement[] {
  const created: FakeMediaElement[] = [];
  vi.stubGlobal('Image', class extends FakeMediaElement { constructor() { super(); created.push(this); } });
  return created;
}

function stubAudio(): FakeMediaElement[] {
  const created: FakeMediaElement[] = [];
  vi.stubGlobal('Audio', class extends FakeMediaElement { constructor() { super(); created.push(this); } });
  return created;
}

afterEach(() => {
  vi.unstubAllGlobals();
  destroyAssetLoader();
});

describe('AssetLoader (Game P1 — Flyweight asset cache)', () => {
  it('caches image resources by URL — two manifest keys sharing a URL create only one Image', async () => {
    const created = stubImage();
    const loader = new AssetLoader();

    const promise = loader.preload({
      a: { type: 'image', url: 'sprite.png' },
      b: { type: 'image', url: 'sprite.png' },
    });

    expect(created.length).toBe(1);
    created[0].dispatch('load');
    await promise;

    expect(loader.get('a')).toBe(loader.get('b'));
  });

  it('caches audio resources by URL the same way', async () => {
    const created = stubAudio();
    const loader = new AssetLoader();

    const promise = loader.preload({
      a: { type: 'audio', url: 'theme.mp3' },
      b: { type: 'audio', url: 'theme.mp3' },
    });

    expect(created.length).toBe(1);
    created[0].dispatch('loadeddata');
    await promise;

    expect(loader.get('a')).toBe(loader.get('b'));
  });

  it('loads and caches JSON resources via fetch, deduped by URL', async () => {
    const data = { hello: 'world' };
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => data }));
    vi.stubGlobal('fetch', fetchMock);

    const loader = new AssetLoader();
    await loader.preload({
      a: { type: 'json', url: 'data.json' },
      b: { type: 'json', url: 'data.json' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(loader.get('a')).toBe(loader.get('b'));
    expect(loader.get('a')).toEqual(data);
  });

  it('calls onProgress with loaded/total counts as each asset resolves', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    const loader = new AssetLoader();
    const onProgress = vi.fn();

    await loader.preload(
      { a: { type: 'json', url: 'a.json' }, b: { type: 'json', url: 'b.json' } },
      onProgress
    );

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith({ loaded: 2, total: 2, key: expect.any(String) });
  });

  it('get() throws for an asset that has not been loaded', () => {
    const loader = new AssetLoader();
    expect(() => loader.get('missing')).toThrow();
  });

  it('preload() rejects if an image fails to load', async () => {
    const created = stubImage();
    const loader = new AssetLoader();

    const promise = loader.preload({ a: { type: 'image', url: 'bad.png' } });
    created[0].dispatch('error');

    await expect(promise).rejects.toThrow();
  });

  it('getAssetLoader() returns a singleton until destroyAssetLoader() is called', () => {
    const a = getAssetLoader();
    const b = getAssetLoader();
    expect(a).toBe(b);

    destroyAssetLoader();
    const c = getAssetLoader();
    expect(c).not.toBe(a);
  });
});
