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
import "jsr:@sigma/deno-compile-extra/localStoragePolyfill";

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
import "jsr:@sigma/deno-compile-extra/fetchPatch";

// Now file:// URLs will work in both regular and compiled Deno
const content = await fetch(new URL("./data.txt", import.meta.url))
  .then((res) => res.text());
```

Issue:
[https://github.com/denoland/deno/issues/28129](https://github.com/denoland/deno/issues/28129)

### Is Standalone Detection

A utility function to detect if the current Deno process is running as a
standalone executable.

- Helps with conditional logic based on execution context
- Uses heuristics to determine if running in a compiled binary

**Usage:**

```typescript
import { isStandaloneDenoExe } from "jsr:@sigma/deno-compile-extra/isStandalone";

if (isStandaloneDenoExe()) {
  console.log("Running as a compiled executable");
} else {
  console.log("Running with the standard Deno runtime");
}
```

Issue:
[https://github.com/denoland/deno/issues/15996](https://github.com/denoland/deno/issues/15996)
