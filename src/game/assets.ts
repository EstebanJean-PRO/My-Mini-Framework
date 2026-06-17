export type AssetType = 'image' | 'audio' | 'json';

export interface AssetManifestEntry {
    type: AssetType;
    url: string;
}

export type AssetManifest = Record<string, AssetManifestEntry>;

export interface PreloadProgress {
    loaded: number;
    total: number;
    key: string;
}

export type ProgressCallback = (progress: PreloadProgress) => void;

export class AssetLoader {
    private urlCache = new Map<string, Promise<any>>();
    private assets = new Map<string, any>();

    private loadByType(type: AssetType, url: string): Promise<any> {
        const cached = this.urlCache.get(url);
        if (cached) return cached;

        let promise: Promise<any>;
        switch (type) {
            case 'image': promise = this.loadImage(url); break;
            case 'audio': promise = this.loadAudio(url); break;
            case 'json': promise = this.loadJSON(url); break;
        }
        this.urlCache.set(url, promise);
        return promise;
    }

    private loadImage(url: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.addEventListener('load', () => resolve(img));
            img.addEventListener('error', () => reject(new Error(`Failed to load image: ${url}`)));
            img.src = url;
        });
    }

    private loadAudio(url: string): Promise<HTMLAudioElement> {
        return new Promise((resolve, reject) => {
            const audio = new Audio();
            audio.addEventListener('loadeddata', () => resolve(audio));
            audio.addEventListener('error', () => reject(new Error(`Failed to load audio: ${url}`)));
            audio.src = url;
        });
    }

    private async loadJSON(url: string): Promise<any> {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to load JSON: ${url}`);
        return response.json();
    }

    async preload(manifest: AssetManifest, onProgress?: ProgressCallback): Promise<void> {
        const entries = Object.entries(manifest);
        const total = entries.length;
        let loaded = 0;

        await Promise.all(entries.map(async ([key, entry]) => {
            const resource = await this.loadByType(entry.type, entry.url);
            this.assets.set(key, resource);
            loaded++;
            onProgress?.({ loaded, total, key });
        }));
    }

    get<T = any>(key: string): T {
        if (!this.assets.has(key)) throw new Error(`Asset not loaded: ${key}`);
        return this.assets.get(key) as T;
    }

    has(key: string): boolean { return this.assets.has(key); }

    clear(): void {
        this.urlCache.clear();
        this.assets.clear();
    }
}

let assetLoaderInstance: AssetLoader | null = null;
export const getAssetLoader = (): AssetLoader => assetLoaderInstance ?? (assetLoaderInstance = new AssetLoader());
export const destroyAssetLoader = (): void => { assetLoaderInstance?.clear(); assetLoaderInstance = null; };
