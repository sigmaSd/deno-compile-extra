# Deno Compile Extra

A collection of polyfills and utilities to enhance the functionality of Deno
compiled executables.

## Overview

Deno's `compile` command allows creating standalone executables from
TypeScript/JavaScript code. However, it have some limitations and bugs that
needs to be worked around. This package bridges those gaps with polyfills and
utilities.

## Features

### localStorage Polyfill

A file-based implementation of the Web Storage API's localStorage interface for
Deno compiled executables.

- Persists data between runs of the same compiled executable
- Uses system cache directory to store data
- Isolates storage between different executables

**Usage:**

```typescript
import { setupLocalStorage } from "jsr:@sigma/deno-compile-extra/localStoragePolyfill";

// Initialize the polyfill (does nothing if not in a compiled executable)
await setupLocalStorage();

// Use localStorage normally
localStorage.setItem("user", JSON.stringify({ name: "Jane", id: 123 }));
const user = JSON.parse(localStorage.getItem("user") || "{}");
console.log(`Hello, ${user.name}!`);
```

Issue:
[https://github.com/denoland/deno/issues/10693](https://github.com/denoland/deno/issues/10693)

### Fetch Patch for file:// URLs

A patch for the global fetch function to properly support file:// URLs in Deno
compiled executables.

- Enables reading embedded files using the standard fetch API

**Usage:**

```typescript
import { patchFetch } from "jsr:@sigma/deno-compile-extra/fetch-patch";

// Apply the patch before using fetch with file:// URLs
patchFetch();

// Now file:// URLs will work in both regular and compiled Deno
const content = await fetch(new URL("./data.txt", import.meta.url))
  .then((res) => res.text());
```

Issue:
[https://github.com/denoland/deno/issues/28129](https://github.com/denoland/deno/issues/28129)
