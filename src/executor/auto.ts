import type { Executor, SandboxOptions } from "../types.js";

/**
 * Create an executor using the isolated-vm peer dependency.
 */
export async function createExecutor(
  options: SandboxOptions = {},
): Promise<Executor> {
  try {
    // @ts-ignore — optional peer dependency
    await import("isolated-vm");
    const { IsolatedVMExecutor } = await import("./isolated-vm.js");
    return new IsolatedVMExecutor(options);
  } catch {
    // Not available
  }

  throw new Error(
    "No sandbox runtime found. Install isolated-vm:\n" +
      "  npm install isolated-vm    # V8 isolates (Node.js)",
  );
}
