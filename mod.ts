// import assert from "node:assert";
import { cacheDir, isStandaloneDenoExe } from "./utils.ts";
import { join as joinPath } from "jsr:@std/path@1.0.8";
import { ensureDir } from "jsr:@std/fs@1.0.13";

class LocalStorage {
  storageData: Record<string, string> = {};
  storagePath: string = "";

  async setup() {
    const cacheDirPath = cacheDir();
    // assert(cacheDirPath);
    const localStoragePath = joinPath(cacheDirPath, "deno-localStorage");
    await ensureDir(localStoragePath);

    const storageId = await this.createStorageId(import.meta.url);
    this.storagePath = joinPath(localStoragePath, `${storageId}.json`);

    try {
      const data = await Deno.readTextFile(this.storagePath);
      this.storageData = JSON.parse(data);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        console.warn("Error loading localStorage data:", error);
      }
      this.storageData = {};
      await Deno.writeTextFile(
        this.storagePath,
        JSON.stringify(this.storageData),
      );
    }
  }

  async createStorageId(url: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(url);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);
  }

  saveData(): void {
    Deno.writeTextFileSync(this.storagePath, JSON.stringify(this.storageData));
  }

  getItem(key: string): string | null {
    return this.storageData[key] ?? null;
  }

  setItem(key: string, value: string): void {
    this.storageData[key] = value;
    this.saveData();
  }

  removeItem(key: string): void {
    delete this.storageData[key];
    this.saveData();
  }

  clear(): void {
    this.storageData = {};
    this.saveData();
  }

  key(index: number): string | null {
    return Object.keys(this.storageData)[index] ?? null;
  }

  get length(): number { // Keep this getter for internal use
    return Object.keys(this.storageData).length;
  }
}

export async function setupLocalStorage() {
  if (!isStandaloneDenoExe()) {
    return;
  }

  const localStorageInstance = new LocalStorage();
  await localStorageInstance.setup();

  // Create a Storage-like object with 'length' as a data property
  const storageShim = {
    getItem: localStorageInstance.getItem.bind(localStorageInstance),
    setItem: localStorageInstance.setItem.bind(localStorageInstance),
    removeItem: localStorageInstance.removeItem.bind(localStorageInstance),
    clear: localStorageInstance.clear.bind(localStorageInstance),
    key: localStorageInstance.key.bind(localStorageInstance),
    get length() {
      return localStorageInstance.length;
    },
  };

  // Assign the shim to globalThis.localStorage
  Object.defineProperty(globalThis, "localStorage", {
    value: storageShim,
    configurable: true,
    writable: true,
    enumerable: true,
  });
}
