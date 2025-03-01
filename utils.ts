export function cacheDir(): string | null {
  switch (Deno.build.os) {
    case "linux": {
      const xdg = Deno.env.get("XDG_CACHE_HOME");
      if (xdg) return xdg;

      const home = Deno.env.get("HOME");
      if (home) return `${home}/.cache`;
      break;
    }

    case "darwin": {
      const home = Deno.env.get("HOME");
      if (home) return `${home}/Library/Caches`;
      break;
    }

    case "windows": {
      const localAppData = Deno.env.get("LOCALAPPDATA");
      if (localAppData) return localAppData;

      // Fallback for older Windows versions
      const appData = Deno.env.get("APPDATA");
      if (appData) return appData;
      break;
    }
  }

  return null;
}

export function isStandaloneDenoExe(): boolean {
  // heuristics
  return (
    import.meta.url.includes("deno-compile") &&
    try_(() => localStorage.length).isErr()
  );
}

function try_<T>(fn: () => T) {
  try {
    const ok = fn();
    return { isErr: () => false, ok };
  } catch (error) {
    return { isErr: () => true, err: error };
  }
}
