## 0.12.0

- Add Caches API polyfill for compiled executables

## 0.11.0

- The `isStandalone` module has been removed. (use `Deno.build.standalone`
  instead)
- Refactor `fetchPatch` and `localStoragePolyfill` to use
  `Deno.build.standalone` instead of `isStandaloneDenoExe`. (requires Deno
  2.13.0)

## 0.10.0

- use import.meta.url because it works in workers
