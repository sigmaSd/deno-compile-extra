import { assertEquals } from "jsr:@std/assert@1.0.11";
import * as path from "jsr:@std/path@0.221.0";

// Helper function to compile a Deno script and return the path to the executable
async function compileDenoScript(scriptPath: string): Promise<string> {
  const tempDir = await Deno.makeTempDir();
  const exePath = path.join(tempDir, "compiled_test_app");

  const compileProcess = new Deno.Command(Deno.execPath(), {
    args: ["compile", "-A", "--no-check", "-o", exePath, scriptPath],
    stdin: "null",
    stdout: "null",
    stderr: "inherit", // Show compilation errors
  });

  const { success } = await compileProcess.spawn().status;
  if (!success) {
    throw new Error(`Compilation failed for ${scriptPath}`);
  }
  return exePath;
}

Deno.test("localStorage polyfill in compiled executable", async () => {
  // --- Step 1: Create a temporary test script ---
  const testScriptContent = `
    import { setupLocalStorage } from "./mod.ts";

    await setupLocalStorage();

    if (localStorage.getItem("testKey")) {
      if (localStorage.getItem("testKey") !== "testValue") {
        throw new Error("wrong value")
      }
      localStorage.removeItem("testKey");
      if (localStorage.getItem("testKey")) {
        throw new Error("not removed")
      }
    } else {
      localStorage.setItem("testKey", "testValue");
      if (localStorage.length !== 1) {
        throw new Error("wrong len:" + localStorage.length.toString())
      }
    }
    if (Deno.args[0] === "clear") {
      localStorage.clear()
      if (localStorage.length !== 0) {
          throw new Error("not cleared")
      }
    }
  `;

  const tempDir = await Deno.makeTempDir();
  const testScriptPath = path.join(tempDir, "test_app.ts");
  // https://github.com/denoland/deno/issues/28353
  const modFilePath = path.join(tempDir, "mod.ts");
  // copy the content of mod.ts to tempDir
  const modFileContent = await Deno.readTextFile("./mod.ts");
  await Deno.writeTextFile(modFilePath, modFileContent);
  //copy the utils
  const utilsFilePath = path.join(tempDir, "utils.ts");
  const utilsFileContent = await Deno.readTextFile("./utils.ts");
  await Deno.writeTextFile(utilsFilePath, utilsFileContent);
  await Deno.writeTextFile(testScriptPath, testScriptContent);

  // --- Step 2: Compile the test script ---
  const executablePath = await compileDenoScript(testScriptPath);
  {
    // --- Step 3: Run the compiled executable ---
    const runProcess = new Deno.Command(executablePath, {
      cwd: tempDir,
      stdin: "null",
      stdout: "piped",
      stderr: "piped",
    }).spawn();
    const status = await runProcess.status;
    const output = await runProcess.output();

    const decoder = new TextDecoder();
    const outStr = decoder.decode(output.stdout);
    const errStr = decoder.decode(output.stderr);

    // --- Step 4: Check the output ---
    // Clean up the temporary directory and executable

    assertEquals(
      status.success,
      true,
      `Test script failed:\n ${errStr}\n${outStr}`,
    );
  }
  {
    // --- Step 3: Run the compiled executable ---
    const runProcess = new Deno.Command(executablePath, {
      cwd: tempDir,
      args: ["clear"],
      stdin: "null",
      stdout: "piped",
      stderr: "piped",
    }).spawn();
    const status = await runProcess.status;
    const output = await runProcess.output();

    const decoder = new TextDecoder();
    const outStr = decoder.decode(output.stdout);
    const errStr = decoder.decode(output.stderr);

    // --- Step 4: Check the output ---
    // Clean up the temporary directory and executable

    assertEquals(
      status.success,
      true,
      `Test script failed:\n ${errStr}\n${outStr}`,
    );
  }
  await Deno.remove(tempDir, { recursive: true });
});
