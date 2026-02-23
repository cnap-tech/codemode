import type { Executor, ExecuteResult, SandboxOptions } from "../types.js";

/**
 * Executor implementation using isolated-vm (V8 isolates).
 * Requires `isolated-vm` v6+ as a peer dependency.
 *
 * Each execute() call creates a fresh V8 isolate with its own heap — no state
 * leaks between calls. The sandbox has zero I/O capabilities by default (no
 * fetch, no fs, no require). The only way out is through injected host functions.
 */
export class IsolatedVMExecutor implements Executor {
  private memoryMB: number;
  private timeoutMs: number;

  constructor(options: SandboxOptions = {}) {
    this.memoryMB = options.memoryMB ?? 64;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async execute(
    code: string,
    globals: Record<string, unknown>,
  ): Promise<ExecuteResult> {
    // @ts-ignore — optional peer dependency
    const ivm = (await import("isolated-vm")).default ?? (await import("isolated-vm"));
    const isolate = new ivm.Isolate({ memoryLimit: this.memoryMB });

    try {
      const context = await isolate.createContext();
      const jail = context.global;
      await jail.set("global", jail.derefInto());

      // No-op console — sandbox code should return data, not log it.
      // Injecting a real console would create an OOM vector since logs
      // accumulate in the host process outside the isolate memory limit.
      await context.eval(`
        globalThis.console = {
          log: () => {},
          warn: () => {},
          error: () => {},
        };
      `);

      // Inject globals
      let refCounter = 0;
      for (const [name, value] of Object.entries(globals)) {
        if (typeof value === "function") {
          // Async host function: set Reference, wrap with .apply() in isolate
          const refName = `__ref${refCounter++}`;
          await jail.set(refName, new ivm.Reference(value));
          await context.eval(`
            globalThis[${JSON.stringify(name)}] = function(...args) {
              return ${refName}.apply(undefined, args, {
                arguments: { copy: true },
                result: { promise: true, copy: true },
              });
            };
          `);
        } else if (isNamespaceWithMethods(value)) {
          // Namespace object with methods (e.g. { request: fn })
          const ns = value as Record<string, unknown>;
          let nsSetup = `globalThis[${JSON.stringify(name)}] = {};\n`;

          for (const [key, val] of Object.entries(ns)) {
            if (typeof val === "function") {
              const refName = `__ref${refCounter++}`;
              await jail.set(refName, new ivm.Reference(val));
              nsSetup += `
                globalThis[${JSON.stringify(name)}][${JSON.stringify(key)}] = function(...args) {
                  return ${refName}.apply(undefined, args, {
                    arguments: { copy: true },
                    result: { promise: true, copy: true },
                  });
                };
              `;
            }
          }

          // Inject non-function properties as JSON
          const dataProps = Object.entries(ns).filter(([, v]) => typeof v !== "function");
          if (dataProps.length > 0) {
            const dataObj = Object.fromEntries(dataProps);
            nsSetup += `Object.assign(globalThis[${JSON.stringify(name)}], ${JSON.stringify(dataObj)});\n`;
          }

          await context.eval(nsSetup);
        } else {
          // Plain data: inject as JSON
          await context.eval(
            `globalThis[${JSON.stringify(name)}] = ${JSON.stringify(value)};`,
          );
        }
      }

      // Execute the code
      const wrappedCode = `(${code})()`;
      const script = await isolate.compileScript(wrappedCode);
      const result = await script.run(context, {
        timeout: this.timeoutMs,
        promise: true,
        copy: true,
      });

      context.release();
      return { result };
    } catch (err) {
      return {
        result: undefined,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      if (!isolate.isDisposed) {
        isolate.dispose();
      }
    }
  }
}

function isNamespaceWithMethods(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value as Record<string, unknown>).some(
      (v) => typeof v === "function",
    )
  );
}
