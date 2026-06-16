import type { Executor, SandboxOptions } from "../types.js";

/**
 * Detect whether we're running under Bun. On Bun, isolated-vm cannot dlopen
 * (it relies on V8 symbols like `v8::ValueSerializer::Delegate::IsHostObject`
 * that Bun's JavaScriptCore engine does not export), so we prefer the WASM
 * QuickJS backend.
 *
 * Uses Bun's officially documented detection pattern:
 * https://bun.com/docs/guides/util/detect-bun
 *
 * The `typeof process` guard keeps this safe in non-Node-shaped runtimes
 * (Cloudflare Workers, browser) where `process` is undefined.
 */
function isBun(): boolean {
  // Cast through globalThis to avoid requiring @types/node just for `process`.
  const proc = (globalThis as { process?: { versions?: { bun?: string } } }).process;
  return !!proc?.versions?.bun;
}

/**
 * Pick a sandbox runtime automatically.
 *
 * Order of preference:
 *   - **LLRT native** → first when `@robinbraemer/llrt` is installed. This is
 *     the lightweight default candidate and satisfies the shared executor
 *     contract, including host callbacks.
 *   - **Bun** → QuickJS first (isolated-vm cannot load native bindings under
 *     JavaScriptCore), fall back to isolated-vm only if QuickJS isn't
 *     installed.
 *   - **Node without LLRT** → isolated-vm first (mature V8 isolates), then
 *     QuickJS if isolated-vm isn't installed (e.g. ARM Linux without build
 *     tools, or a Node minor without a prebuild).
 *
 * QuickJS is a compatibility fallback, not a recommended production backend.
 * See `QuickJSExecutor`'s docstring for the upstream `quickjs-emscripten`
 * bugs it inherits.
 *
 * All sandbox runtimes are optional peer dependencies.
 */
export async function createExecutor(
  options: SandboxOptions = {},
): Promise<Executor> {
  const order = isBun()
    ? (["llrt", "quickjs", "isolated-vm"] as const)
    : (["llrt", "isolated-vm", "quickjs"] as const);

  /* oxlint-disable no-await-in-loop */
  for (const backend of order) {
    if (backend === "llrt") {
      try {
        await import("@robinbraemer/llrt");
      } catch (error) {
        if (isMissingOptionalDependency(error, "@robinbraemer/llrt")) {
          continue;
        }
        throw error;
      }

      const { LlrtNativeExecutor } = await import("./llrt-native.js");
      return new LlrtNativeExecutor(options);
    } else if (backend === "isolated-vm") {
      try {
        // @ts-ignore — optional peer dependency
        await import("isolated-vm");
        const { IsolatedVMExecutor } = await import("./isolated-vm.js");
        return new IsolatedVMExecutor(options);
      } catch {
        // not available — try the next backend
      }
    } else {
      try {
        // @ts-ignore — optional peer dependency
        await import("quickjs-emscripten");
        const { QuickJSExecutor } = await import("./quickjs.js");
        return new QuickJSExecutor(options);
      } catch {
        // not available — try the next backend
      }
    }
  }
  /* oxlint-enable no-await-in-loop */

  throw new Error(
    "No sandbox runtime found. Install one of:\n" +
      "  npm install @robinbraemer/llrt   # Native LLRT (default candidate)\n" +
      "  npm install isolated-vm          # V8 isolates (Node.js fallback)\n" +
      "  npm install quickjs-emscripten   # WASM QuickJS (Bun, Workers, browser)",
  );
}

export function isMissingOptionalDependency(
  error: unknown,
  dependency: string,
): boolean {
  const escapedDependency = escapeRegExp(dependency);
  const missingDependencyPattern = new RegExp(
    `Cannot find (?:package|module) ['"]${escapedDependency}['"]`,
  );

  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "ERR_MODULE_NOT_FOUND" &&
    missingDependencyPattern.test(error.message)
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
