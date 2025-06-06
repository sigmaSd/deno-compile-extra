import { assertEquals } from "jsr:@std/assert@1.0.11";
import * as path from "jsr:@std/path@0.221.0";

// Helper function to compile a Deno script and return the path to the executable
async function compileDenoScript(
  { scriptPath, includes, tempDir }: {
    scriptPath: string;
    includes?: string[];
    tempDir: string;
  },
): Promise<string> {
  const exePath = path.join(tempDir, "compiled_test_app");

  let args = ["compile", "-A", "-o", exePath];
  if (includes) {
    args = [...args, ...includes.map((file) => `--include=${file}`)];
  }
  args = [...args, scriptPath];

  const compileProcess = new Deno.Command(Deno.execPath(), {
    args,
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

Deno.test("patch fetch works correctly", async () => {
  // --- Step 1: Create a temporary test script ---
  const testScriptContent = `
    import "./mod.ts";

    // Now file:// URLs will work in both regular and compiled Deno
    const content = await fetch(new URL("./data.txt", import.meta.url))
      .then(res => res.text());

    if (content !== "Hello, World!") {
      throw new Error("Unexpected content");
    }
  `;

  const tempDir = await Deno.makeTempDir();
  const testScriptPath = path.join(tempDir, "test_app.ts");
  const dataPath = path.join(tempDir, "data.txt");
  // https://github.com/denoland/deno/issues/28353
  const modFilePath = path.join(tempDir, "mod.ts");
  // copy the content of mod.ts to tempDir
  const modFileContent = await Deno.readTextFile(
    new URL("./mod.ts", import.meta.url),
  )
    .then((file) => file.replaceAll("../utils.ts", "./utils.ts"));
  await Deno.writeTextFile(modFilePath, modFileContent);
  //copy the utils
  const utilsFilePath = path.join(tempDir, "utils.ts");
  const utilsFileContent = await Deno.readTextFile(
    new URL("../utils.ts", import.meta.url),
  );
  await Deno.writeTextFile(utilsFilePath, utilsFileContent);
  await Deno.writeTextFile(testScriptPath, testScriptContent);
  await Deno.writeTextFile(dataPath, "Hello, World!");

  // --- Step 2: Compile the test script ---
  const executablePath = await compileDenoScript({
    scriptPath: testScriptPath,
    includes: [dataPath],
    tempDir,
  });
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
