import { assertEquals } from "@std/assert";
import * as path from "@std/path";
import { exists } from "@std/fs";

// Helper function to compile a Deno script and return the path to the executable
async function compileDenoScript(scriptPath: string): Promise<string> {
  const tempDir = await Deno.makeTempDir({ prefix: "cache_test_compile_" });
  const exePath = path.join(tempDir, "compiled_cache_test_app");

  console.log(`Compiling test script: ${scriptPath} to ${exePath}`);

  const compileProcess = new Deno.Command(Deno.execPath(), {
    args: [
      "compile",
      "--allow-env",
      "--allow-read",
      "--allow-write",
      "--allow-net",
      "-o",
      exePath,
      scriptPath,
    ], // Added --allow-net for add/addAll
    stdin: "null",
    stdout: "inherit", // Show compilation output
    stderr: "inherit", // Show compilation errors
  });

  const { success, code } = await compileProcess.spawn().status;
  if (!success) {
    throw new Error(
      `Compilation failed for ${scriptPath} with exit code ${code}`,
    );
  }
  console.log(`Compilation successful: ${exePath}`);
  // Check if executable exists
  if (!(await exists(exePath, { isFile: true }))) {
    throw new Error(`Compiled executable not found at ${exePath}`);
  }

  return exePath;
}

Deno.test("Caches polyfill in compiled executable", async (_t) => {
  // --- Step 1: Create a temporary test script ---
  const testScriptContent = `
    // Explicitly import the polyfill setup function
    // In a real app, you might just import "./mod.ts" if setup is auto-run
    import { setupCachesPolyfill } from "./mod.ts";
    import { assertEquals, assert } from "jsr:@std/assert@1.0.11"; // Need asserts in compiled code too

    console.log("Test script started. Setting up caches polyfill...");
    await setupCachesPolyfill(); // Ensure setup completes
    console.log("Polyfill setup complete.");

    if (!globalThis.caches) {
      throw new Error("globalThis.caches is not defined after polyfill setup!");
    }
    console.log("globalThis.caches is defined.");

    const CACHE_NAME = "test-cache-v1";
    const REQ_URL = "https://example.com/data.txt";
    const REQ_URL_OTHER = "https://example.com/other.json";
    const RES_BODY = "Hello from polyfilled cache!";
    const RES_HEADERS = { "Content-Type": "text/plain", "X-Custom-Header": "PolyfillValue" };

    async function runTests() {
      console.log("Running cache tests...");

      // Test open and initial state
      console.log(\`Opening cache: \${CACHE_NAME}\`);
      const cache = await caches.open(CACHE_NAME);
      assert(cache, "Cache object should be returned");
      console.log("Cache opened.");

      // Test put
      const req = new Request(REQ_URL);
      const res = new Response(RES_BODY, { headers: RES_HEADERS });
      console.log(\`Putting request: \${REQ_URL}\`);
      await cache.put(req.clone(), res.clone()); // Use clones
      console.log("Put complete.");

      // Test match
      console.log(\`Matching request: \${REQ_URL}\`);
      const matchedResponse = await cache.match(req.clone());
      assert(matchedResponse, "Should find a match in cache");
      console.log("Match found.");
      assertEquals(matchedResponse.status, 200);
      assertEquals(await matchedResponse.text(), RES_BODY);
      assertEquals(matchedResponse.headers.get("Content-Type"), RES_HEADERS["Content-Type"]);
      assertEquals(matchedResponse.headers.get("X-Custom-Header"), RES_HEADERS["X-Custom-Header"]);
      console.log("Match content verified.");

      // Test match with different URL
      console.log(\`Matching non-existent request: \${REQ_URL_OTHER}\`);
      const noMatch = await cache.match(REQ_URL_OTHER);
      assertEquals(noMatch, undefined, "Should not find a match for different URL");
      console.log("Non-existent match verified.");

      // Test CacheStorage.has
      console.log(\`Checking if cache exists: \${CACHE_NAME}\`);
      assert(await caches.has(CACHE_NAME), "caches.has should return true for existing cache");
      console.log("caches.has verified.");

      // Test delete
      console.log(\`Deleting request: \${REQ_URL}\`);
      const deleted = await cache.delete(req.clone());
      assert(deleted, "cache.delete should return true for deleted item");
      const matchAfterDelete = await cache.match(req.clone());
      assertEquals(matchAfterDelete, undefined, "Should not find match after delete");
      console.log("Cache entry deletion verified.");

      // Test CacheStorage.delete
      console.log(\`Deleting cache: \${CACHE_NAME}\`);
      const cacheDeleted = await caches.delete(CACHE_NAME);
      assert(cacheDeleted, "caches.delete should return true for deleted cache");
      assert(!(await caches.has(CACHE_NAME)), "caches.has should return false after delete");
      console.log(\"Cache deletion verified.\");

      console.log(\"Cache tests passed!\");
    }

    try {
        await runTests();
        console.log("Test script finished successfully.");
        Deno.exit(0); // Explicitly exit with success code
    } catch (err) {
        console.error("Error during test script execution:", err);
        Deno.exit(1); // Explicitly exit with failure code
    }
  `;

  const tempDir = await Deno.makeTempDir({ prefix: "cache_test_app_" });
  const testScriptPath = path.join(tempDir, "test_app.ts");

  try {
    // Copy necessary files to tempDir, adjusting paths
    console.log("Copying files to temp directory:", tempDir);
    const modFilePath = path.join(tempDir, "mod.ts");
    const modFileContent = await Deno.readTextFile(
      new URL("./mod.ts", import.meta.url),
    )
      // Adjust relative path to utils.ts
      .then((file) => file.replaceAll("../utils.ts", "./utils.ts"));
    await Deno.writeTextFile(modFilePath, modFileContent);

    const utilsFilePath = path.join(tempDir, "utils.ts");
    const utilsFileContent = await Deno.readTextFile(
      new URL("../utils.ts", import.meta.url),
    );
    await Deno.writeTextFile(utilsFilePath, utilsFileContent);

    await Deno.writeTextFile(testScriptPath, testScriptContent);
    console.log("Test script written to:", testScriptPath);

    // --- Step 2: Compile the test script ---
    const executablePath = await compileDenoScript(testScriptPath);

    // --- Step 3: Run the compiled executable ---
    console.log(`Running compiled executable: ${executablePath}`);
    const runProcess = new Deno.Command(executablePath, {
      cwd: tempDir, // Run from the temp directory where cache files will be created
      stdin: "null",
      stdout: "piped",
      stderr: "piped",
    });

    const output = await runProcess.output();
    const status = output.code; // Use output.code for exit status

    const decoder = new TextDecoder();
    const outStr = decoder.decode(output.stdout);
    const errStr = decoder.decode(output.stderr);

    console.log("--- Compiled Executable STDOUT ---");
    console.log(outStr);
    console.log("--- Compiled Executable STDERR ---");
    console.log(errStr);
    console.log("--- End Output ---");
    console.log(`Executable finished with code: ${status}`);

    // --- Step 4: Check the output ---
    assertEquals(
      status,
      0, // Expect success (exit code 0) from the test script
      `Test script failed (Exit code: ${status}):\n STDERR: ${errStr}\n STDOUT: ${outStr}`,
    );
    // Optionally add more assertions based on stdout/stderr if needed
  } finally {
    // --- Step 5: Clean up ---
    console.log("Cleaning up temporary directory:", tempDir);
    await Deno.remove(tempDir, { recursive: true }).catch((err) => {
      console.error(`Failed to remove temp directory ${tempDir}:`, err);
    });
    // We don't delete the compilation output dir directly, as compileDenoScript uses a separate temp dir for that
    // Deno should clean that up itself, or we could track and delete it too if necessary.
    console.log("Cleanup complete.");
  }
});
