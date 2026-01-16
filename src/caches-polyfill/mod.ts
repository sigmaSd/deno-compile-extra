/**
 * Cache API polyfill for Deno standalone executables.
 *
 * This module provides a basic Cache API implementation for Deno standalone executables
 * by storing data in JSON files in the local cache directory. It allows persistence
 * of cached responses across executions of the same compiled executable.
 *
 * ## Limitations
 *
 * - Storage is based on a hash derived from the main module URL.
 * - Does not fully support all Cache/CacheStorage options (e.g., ignoreSearch, cache variations).
 * - Performance might be limited for very large numbers of caches or large response bodies.
 * - Response body streams are fully consumed and stored as base64 strings.
 *
 * ## Usage
 *
 * ```ts
 * import "jsr:@sigma/deno-compile-extra/cachesPolyfill";
 *
 * // Now you can use the Cache API as usual
 * const cache = await caches.open("my-cache");
 *
 * const req = new Request("https://example.com");
 * const res = new Response("Hello from cache!");
 *
 * await cache.put(req, res);
 *
 * const matchedResponse = await cache.match(req);
 * if (matchedResponse) {
 *   console.log(await matchedResponse.text()); // "Hello from cache!"
 * }
 * ```
 *
 * @module
 */

import * as path from "@std/path";
import { ensureDir, exists } from "@std/fs";
import { cacheDir } from "../utils.ts";
import assert from "node:assert";

// Helper to convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Helper to convert Base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary_string = atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

// Helper to convert Headers to Record
function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

// Helper to get Request URL key (simplistic)
function getRequestKey(input: RequestInfo | URL): string {
  if (input instanceof Request) {
    return input.url;
  } else {
    return String(input);
  }
}

interface StoredCacheEntry {
  request: {
    url: string;
    method: string;
    headers: Record<string, string>;
  };
  response: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string; // Base64 encoded body
  };
}

interface CacheData {
  entries: Record<string, StoredCacheEntry>; // Keyed by request URL for now
}

class CacheImpl implements Cache {
  #cacheName: string;
  #storagePath: string;
  #data: CacheData = { entries: {} };
  #loaded = false;

  constructor(cacheName: string, storagePath: string) {
    this.#cacheName = cacheName;
    this.#storagePath = storagePath;
  }

  // #load is now only called by #ensureLoaded when needed
  async #load(): Promise<void> {
    // Double check, although #ensureLoaded should prevent this
    if (this.#loaded) return;

    // console.log(`[Cache Polyfill] Loading cache "${this.#cacheName}"...`); // Added log
    try {
      if (await exists(this.#storagePath, { isFile: true })) {
        const fileContent = await Deno.readTextFile(this.#storagePath);
        this.#data = JSON.parse(fileContent);
        if (!this.#data.entries) this.#data.entries = {}; // Ensure entries exist
        // console.log(
        //   `[Cache Polyfill] Cache "${this.#cacheName}" loaded from disk.`,
        // );
      } else {
        // File doesn't exist, initialize empty cache in memory
        this.#data = { entries: {} };
        // console.log(
        //   `[Cache Polyfill] Cache "${this.#cacheName}" initialized (new).`,
        // );
      }
      this.#loaded = true; // Mark as loaded only on success
    } catch (error) {
      throw new Error(
        `[Cache Polyfill] Error loading cache "${this.#cacheName}":` +
          error,
      );
    }
  }

  async #save(): Promise<void> {
    // Ensure the directory exists before trying to save
    try {
      await ensureDir(path.dirname(this.#storagePath));
      await Deno.writeTextFile(
        this.#storagePath,
        JSON.stringify(this.#data, null, 2), // Pretty print for readability
      );
      // console.log(`[Cache Polyfill] Cache "${this.#cacheName}" saved.`);
    } catch (error) {
      throw new Error(
        `[Cache Polyfill] Error saving cache "${this.#cacheName}":` + error,
      );
    }
  }

  // Simplified #ensureLoaded: loads lazily on first access if needed
  async #ensureLoaded(): Promise<void> {
    if (!this.#loaded) {
      await this.#load();
    }
  }

  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    await this.#ensureLoaded(); // Load cache data if not already loaded
    const req = request instanceof Request ? request : new Request(request);
    const key = getRequestKey(req);

    // Clone response to read body, as body can only be read once
    const resClone = response.clone();
    const bodyBuffer = await resClone.arrayBuffer();
    const bodyBase64 = arrayBufferToBase64(bodyBuffer);

    const entry: StoredCacheEntry = {
      request: {
        url: req.url,
        method: req.method,
        headers: headersToRecord(req.headers),
      },
      response: {
        status: resClone.status,
        statusText: resClone.statusText,
        headers: headersToRecord(resClone.headers),
        body: bodyBase64,
      },
    };
    this.#data.entries[key] = entry;
    await this.#save(); // Save changes
  }

  async match(
    request: RequestInfo | URL,
    _options?: CacheQueryOptions, // Options like ignoreSearch not implemented yet
  ): Promise<Response | undefined> {
    await this.#ensureLoaded(); // Load cache data if not already loaded
    const key = getRequestKey(request);
    // TODO: Implement options like ignoreSearch, ignoreMethod etc.
    const entry = this.#data.entries[key];

    if (entry) {
      const body = base64ToArrayBuffer(entry.response.body);
      return new Response(body, {
        status: entry.response.status,
        statusText: entry.response.statusText,
        headers: new Headers(entry.response.headers),
      });
    }
    return undefined;
  }

  async delete(
    request: RequestInfo | URL,
    _options?: CacheQueryOptions, // Options like ignoreSearch not implemented yet
  ): Promise<boolean> {
    await this.#ensureLoaded(); // Load cache data if not already loaded
    const key = getRequestKey(request);
    // TODO: Implement options
    if (this.#data.entries[key]) {
      delete this.#data.entries[key];
      await this.#save(); // Save changes
      return true;
    }
    return false;
  }

  async add(request: RequestInfo | URL): Promise<void> {
    await this.#ensureLoaded(); // Load cache data if not already loaded (needed before addAll)
    await this.addAll([request]);
  }

  async addAll(requests: ReadonlyArray<RequestInfo | URL>): Promise<void> {
    await this.#ensureLoaded(); // Load cache data if not already loaded
    // Fetch each request and put it in the cache
    // Note: This uses the *original* fetch, not potentially polyfilled one
    const promises = requests.map(async (requestInfo) => {
      const request = requestInfo instanceof Request
        ? requestInfo
        : new Request(requestInfo);
      // Important: Use original fetch to avoid potential loops if fetch is also patched
      const response = await fetch(request.clone()); // Clone req for fetch
      if (!response.ok) {
        throw new TypeError(
          `Failed to fetch "${request.url}": ${response.status} ${response.statusText}`,
        );
      }
      // \`this.put\` will handle saving internally after ensuring loaded again (though it's already loaded here)
      await this.put(request, response);
    });
    // We don't need a final #save here, as each put call saves individually.
    await Promise.all(promises);
  }

  // Deno doesn't implement Cache.keys(), so we're omitting it from the polyfill
  // This ensures better compatibility with native Deno caches API
}

class CacheStorageImpl implements CacheStorage {
  #storageRoot: string = ""; // Initialized asynchronously
  #caches: Map<string, CacheImpl> = new Map();
  #initialized: boolean = false;
  #initPromise: Promise<void> | null = null;

  constructor() {
    // Delay initialization until the first call that needs the path
    this.#initPromise = this.#initialize();
  }

  async #initialize(): Promise<void> {
    if (this.#initialized) return;
    // Prevent concurrent initialization attempts
    if (this.#initPromise && this.#initPromise !== (async () => {})()) { // Check if promise is already running
      await this.#initPromise;
      return;
    }

    const initWork = async () => {
      try {
        const cacheDirPath = cacheDir();
        assert(cacheDirPath, "Could not determine cache directory");
        // Use a hash of the entry point for isolation, similar to localStorage polyfill
        const entryPointUrl = import.meta.url;
        const storageId = await this.#createStorageId(entryPointUrl);
        this.#storageRoot = path.join(
          cacheDirPath,
          "deno-cache-api",
          storageId,
        );
        await ensureDir(this.#storageRoot);
        this.#initialized = true;
        // console.log(
        //   `[Cache Polyfill] CacheStorage initialized at: ${this.#storageRoot}`,
        // );
      } catch (error) {
        throw new Error(
          "[Cache Polyfill] CacheStorage failed to initialize:" +
            error,
        );
      } finally {
        this.#initPromise = null; // Clear promise regardless of outcome
      }
    };

    // Assign the promise and start the work
    this.#initPromise = initWork();
    await this.#initPromise;
  }

  // Public method to explicitly ensure initialization is complete if needed externally
  async ensureInitialized(): Promise<void> {
    await this.#ensureInitialized();
  }

  // Private ensure method used internally
  async #ensureInitialized(): Promise<void> {
    // If initialization promise exists, await it
    if (this.#initPromise) {
      await this.#initPromise;
    }
    // After awaiting, check if initialization was successful
    if (!this.#initialized) {
      // If still not initialized, throw an error (initialization must have failed)
      throw new Error(
        "[Cache Polyfill] CacheStorage is not initialized. Check logs for initialization errors.",
      );
    }
  }

  async #createStorageId(url: string): Promise<string> {
    // Simple hash function for storage isolation
    const encoder = new TextEncoder();
    const data = encoder.encode(url);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16); // Use a shorter hash for filename
  }

  async open(cacheName: string): Promise<Cache> {
    await this.#ensureInitialized(); // Ensure storage root is ready
    if (this.#caches.has(cacheName)) {
      return this.#caches.get(cacheName)!;
    }
    const storagePath = path.join(this.#storageRoot, `${cacheName}.json`);
    // CacheImpl constructor is now lightweight
    const cacheInstance = new CacheImpl(cacheName, storagePath);
    // Loading is deferred until first use via cacheInstance.#ensureLoaded()
    this.#caches.set(cacheName, cacheInstance);
    // console.log(
    //   `[Cache Polyfill] Opened handle for cache "${cacheName}". Loading deferred.`,
    // );
    return cacheInstance;
  }

  async has(cacheName: string): Promise<boolean> {
    await this.#ensureInitialized();
    // Check file existence directly, no need to instantiate CacheImpl
    const storagePath = path.join(this.#storageRoot, `${cacheName}.json`);
    return await exists(storagePath, { isFile: true });
  }

  async delete(cacheName: string): Promise<boolean> {
    await this.#ensureInitialized();
    // Remove from in-memory map first
    const existedInMemory = this.#caches.delete(cacheName);

    const storagePath = path.join(this.#storageRoot, `${cacheName}.json`);
    let existedOnDisk = false;
    try {
      // Check existence before removing to return correct boolean
      if (await exists(storagePath, { isFile: true })) {
        existedOnDisk = true;
        await Deno.remove(storagePath);
        // console.log(`[Cache Polyfill] Deleted cache "${cacheName}" from disk.`); // Added log
      }
    } catch (error) {
      // Ignore NotFound errors during delete, but log others
      if (!(error instanceof Deno.errors.NotFound)) {
        throw new Error(
          `Error when trying delete cache: ${cacheName} error: ${error}`,
        );
      }
      // If error is NotFound, existedOnDisk remains false, so we fall through correctly.
    }
    // Return true if it existed either in memory (meaning it might have pending ops)
    // or on disk (meaning it was physically present).
    return existedInMemory || existedOnDisk;
  }

  // Deno doesn't implement CacheStorage.keys() nor CacheStorage.match(), so we're omitting it from the polyfill
  // This ensures better compatibility with native Deno caches API
}

// ================= setupCachesPolyfill ===============

/**
 * Sets up a Cache API polyfill for Deno standalone executables.
 *
 * This function creates a file-based CacheStorage implementation that persists data
 * between runs of the same compiled executable. When called in the standard Deno runtime
 * (not a compiled executable), this function has no effect.
 *
 * Storage files are created in the system's cache directory, isolated based on a hash
 * of the entry point module URL.
 *
 * @example
 * ```ts
 * import { setupCachesPolyfill } from "./mod.ts"; // Or the JSR equivalent
 *
 * await setupCachesPolyfill();
 *
 * // Now you can use caches API
 * const cache = await caches.open("my-cache");
 * await cache.put(new Request("/data"), new Response("payload"));
 * ```
 */
export async function setupCachesPolyfill(): Promise<void> {
  // Only apply polyfill in standalone executables
  if (!Deno.build.standalone) {
    // console.log(
    //   "[Cache Polyfill] Not running in standalone mode. Polyfill inactive.",
    // );
    return;
  }

  // Prevent double-initialization
  // deno-lint-ignore no-explicit-any
  if ((globalThis as any).__cachesPolyfillInitialized) {
    // console.log("[Cache Polyfill] Already initialized.");
    return;
  }

  // console.log(
  //   "[Cache Polyfill] Applying Cache API polyfill for standalone executable...",
  // );

  const cachesInstance = new CacheStorageImpl();

  // Ensure CacheStorage base directory is initialized before declaring polyfill ready
  // This handles async initialization correctly.
  try {
    await cachesInstance.ensureInitialized(); // Changed from public ensureInitialized()

    // Assign the polyfill to globalThis.caches only after successful initialization
    Object.defineProperty(globalThis, "caches", {
      value: cachesInstance,
      configurable: true, // Allow potential re-configuration if needed
      writable: true, // Allow replacement if necessary
      enumerable: true,
    });

    // Mark initialization complete
    Object.defineProperty(globalThis, "__cachesPolyfillInitialized", {
      value: true,
      writable: false,
      enumerable: false,
      configurable: false,
    });

    // console.log("[Cache Polyfill] Cache API polyfill assigned successfully.");
  } catch (error) {
    throw new Error(
      "[Cache Polyfill] Failed to initialize CacheStorage. Polyfill not applied." +
        error,
    );
  }
}

// Automatically apply the polyfill when this module is imported
await setupCachesPolyfill();
