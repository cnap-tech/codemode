import type { Executor, SandboxOptions } from "../types.js";

/**
 * Auto-detect and create an executor from available peer dependencies.
 * Tries isolated-vm first, then quickjs-emscripten.
 */
export async function createExecutor(
  options: SandboxOptions = {},
): Promise<Executor> {
  // Try isolated-vm first (faster, V8-native)
  try {
    // @ts-ignore — optional peer dependency
    await import("isolated-vm");
    const { IsolatedVMExecutor } = await import("./isolated-vm.js");
    return new IsolatedVMExecutor(options);
  } catch {
    // Not available
  }

  // Try quickjs-emscripten (portable WASM)
  try {
    await import("quickjs-emscripten");
    const { QuickJSExecutor } = await import("./quickjs.js");
    return new QuickJSExecutor(options);
  } catch {
    // Not available
  }

  throw new Error(
    "No sandbox runtime found. Install one of:\n" +
      "  npm install isolated-vm    # V8 isolates, fastest (Node.js only)\n" +
      "  npm install quickjs-emscripten  # WASM sandbox, portable (Node.js, Bun, browsers)",
  );
}
