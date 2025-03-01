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

Issue:
[https://github.com/denoland/deno/issues/10693](https://github.com/denoland/deno/issues/10693)
