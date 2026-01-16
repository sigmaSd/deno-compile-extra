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

### Caches Polyfill

A file-based implementation of the Cache API for Deno compiled executables.

- Persists cached responses between runs of the same compiled executable
- Isolates cache storage between different executables

**Usage:**

```typescript
import "jsr:@sigma/deno-compile-extra/cachesPolyfill";

// Use the Cache API normally
const cache = await caches.open("my-cache");

const req = new Request("https://example.com");
const res = new Response("Hello from cache!");

await cache.put(req, res);

const matchedResponse = await cache.match(req);
if (matchedResponse) {
  console.log(await matchedResponse.text()); // "Hello from cache!"
}
```

Issue:
