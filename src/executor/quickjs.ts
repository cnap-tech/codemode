import type { Executor, ExecuteResult, SandboxOptions } from "../types.js";

/**
 * Executor implementation using quickjs-emscripten (QuickJS compiled to WASM).
 * Requires `quickjs-emscripten` as a peer dependency.
 *
 * Advantages over isolated-vm:
 * - Pure WASM, no native dependencies (works everywhere including Bun)
 * - WASM-level sandbox isolation
 *
 * Tradeoffs:
 * - ~3-5x slower than V8 for compute (negligible for API orchestration)
 * - Only one async suspension at a time per module
 */
export class QuickJSExecutor implements Executor {
  private memoryBytes: number;
  private timeoutMs: number;

  constructor(options: SandboxOptions = {}) {
    this.memoryBytes = (options.memoryMB ?? 64) * 1024 * 1024;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async execute(
    code: string,
    globals: Record<string, unknown>,
  ): Promise<ExecuteResult> {
    const qjs = await import("quickjs-emscripten");

    // Use the convenience function that manages module/runtime lifecycle
    const vm = await qjs.newAsyncContext();
    const runtime = vm.runtime;

    runtime.setMemoryLimit(this.memoryBytes);
    runtime.setMaxStackSize(1024 * 320); // 320KB stack

    // Interrupt after timeout
    const deadline = Date.now() + this.timeoutMs;
    runtime.setInterruptHandler(() => Date.now() > deadline);

    try {
      // No-op console — sandbox code should return data, not log it.
      // Injecting a real console would create an OOM vector since logs
      // accumulate in the host process outside the VM memory limit.
      injectNoopConsole(vm);

      // Inject globals
      for (const [name, value] of Object.entries(globals)) {
        if (typeof value === "function") {
          injectAsyncFunction(vm, name, value as (...args: unknown[]) => unknown);
        } else if (
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value) &&
          Object.values(value as Record<string, unknown>).some((v) => typeof v === "function")
        ) {
          injectNamespace(vm, name, value as Record<string, unknown>);
        } else {
          // Inject as JSON data
          const jsonStr = JSON.stringify(value);
          const handle = vm.evalCode(`(${jsonStr})`);
          if (handle.error) {
            handle.error.dispose();
          } else {
            vm.setProp(vm.global, name, handle.value);
            handle.value.dispose();
          }
        }
      }

      // Execute the code
      const wrappedCode = `(${code})()`;
      const resultHandle = await vm.evalCodeAsync(wrappedCode);

      if (resultHandle.error) {
        let error = vm.dump(resultHandle.error);
        try { resultHandle.error.dispose(); } catch { /* already disposed */ }
        // Unwrap rejected promise wrapper
        if (typeof error === "object" && error?.type === "rejected") {
          error = error.reason;
        }
        return {
          result: undefined,
          error: typeof error === "object" && error?.message ? error.message : String(error),
        };
      }

      let result = vm.dump(resultHandle.value);
      // The value handle from async evaluation may already be managed/disposed
      // by the runtime, so we guard the dispose call
      try { resultHandle.value.dispose(); } catch { /* already disposed */ }

      // evalCodeAsync wraps async results as { type: 'fulfilled', value } or { type: 'rejected', reason }
      result = unwrapPromiseResult(result);

      return { result };
    } catch (err) {
      return {
        result: undefined,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      // Dispose context first, then runtime
      // Use try/catch because quickjs-emscripten can throw during
      // cleanup when host references are freed
      try { vm.dispose(); } catch { /* ignore cleanup errors */ }
      try { runtime.dispose(); } catch { /* ignore cleanup errors */ }
    }
  }
}

function injectNoopConsole(vm: any): void {
  const consoleObj = vm.newObject();

  const noopFn = vm.newFunction("log", () => {});

  vm.setProp(consoleObj, "log", noopFn);
  vm.setProp(consoleObj, "warn", noopFn);
  vm.setProp(consoleObj, "error", noopFn);
  vm.setProp(vm.global, "console", consoleObj);

  noopFn.dispose();
  consoleObj.dispose();
}

function injectAsyncFunction(
  vm: any,
  name: string,
  fn: (...args: unknown[]) => unknown,
): void {
  const handle = vm.newAsyncifiedFunction(name, async (...argHandles: any[]) => {
    const args = argHandles.map((h: any) => vm.dump(h));
    const result = await fn(...args);
    return marshalToVM(vm, result);
  });
  vm.setProp(vm.global, name, handle);
  handle.dispose();
}

function injectNamespace(
  vm: any,
  name: string,
  ns: Record<string, unknown>,
): void {
  const nsObj = vm.newObject();

  for (const [key, value] of Object.entries(ns)) {
    if (typeof value === "function") {
      const handle = vm.newAsyncifiedFunction(key, async (...argHandles: any[]) => {
        const args = argHandles.map((h: any) => vm.dump(h));
        const result = await value(...args);
        return marshalToVM(vm, result);
      });
      vm.setProp(nsObj, key, handle);
      handle.dispose();
    } else {
      const jsonStr = JSON.stringify(value);
      const handle = vm.evalCode(`(${jsonStr})`);
      if (!handle.error) {
        vm.setProp(nsObj, key, handle.value);
        handle.value.dispose();
      } else {
        handle.error.dispose();
      }
    }
  }

  vm.setProp(vm.global, name, nsObj);
  nsObj.dispose();
}

/**
 * When evalCodeAsync runs an async arrow function, the dump of the result
 * is `{ type: 'fulfilled', value: X }` instead of just `X`.
 * This unwraps it.
 */
function unwrapPromiseResult(result: unknown): unknown {
  if (
    typeof result === "object" &&
    result !== null &&
    "type" in result &&
    (result as any).type === "fulfilled" &&
    "value" in result
  ) {
    return (result as any).value;
  }
  return result;
}

function marshalToVM(vm: any, value: unknown): any {
  if (value === undefined || value === null) return vm.undefined;
  if (typeof value === "string") return vm.newString(value);
  if (typeof value === "number") return vm.newNumber(value);
  if (typeof value === "boolean") return value ? vm.true : vm.false;

  // For objects/arrays, serialize to JSON and parse inside VM
  const jsonStr = JSON.stringify(value);
  const result = vm.evalCode(`(${jsonStr})`);
  if (result.error) {
    result.error.dispose();
    return vm.undefined;
  }
  return result.value;
}
