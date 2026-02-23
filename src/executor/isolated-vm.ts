import type { Executor, ExecuteResult, SandboxOptions } from "../types.js";

// @ts-ignore — isolated-vm is an optional peer dependency
type IVM = any;

/**
 * Executor implementation using isolated-vm (V8 isolates).
 * Requires `isolated-vm` as a peer dependency.
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
    const ivm = await import("isolated-vm");
    const Isolate = ivm.default?.Isolate ?? (ivm as any).Isolate;
    const Reference = ivm.default?.Reference ?? (ivm as any).Reference;
    const ExternalCopy = ivm.default?.ExternalCopy ?? (ivm as any).ExternalCopy;

    const isolate = new Isolate({ memoryLimit: this.memoryMB });
    const logs: string[] = [];

    try {
      const context = await isolate.createContext();
      const jail = context.global;
      await jail.set("global", jail.derefInto());

      // Inject console (captures logs)
      await context.evalClosure(
        `globalThis.console = {
          log:   (...args) => $0.applyIgnored(undefined, args, { arguments: { copy: true } }),
          warn:  (...args) => $0.applyIgnored(undefined, args, { arguments: { copy: true } }),
          error: (...args) => $0.applyIgnored(undefined, args, { arguments: { copy: true } }),
        };`,
        [
          new Reference((...args: unknown[]) => {
            logs.push(args.map((a) => stringify(a)).join(" "));
          }),
        ],
        { arguments: { reference: true } },
      );

      // Inject globals
      for (const [name, value] of Object.entries(globals)) {
        if (typeof value === "function") {
          await injectFunction(Reference, context, name, value as (...args: unknown[]) => unknown);
        } else if (
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value) &&
          hasCallableValues(value as Record<string, unknown>)
        ) {
          await injectNamespace(Reference, ExternalCopy, context, name, value as Record<string, unknown>);
        } else {
          await context.evalClosure(
            `globalThis[${JSON.stringify(name)}] = $0;`,
            [new ExternalCopy(value).copyInto()],
            { arguments: { reference: true } },
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
      return { result, logs };
    } catch (err) {
      return {
        result: undefined,
        error: err instanceof Error ? err.message : String(err),
        logs,
      };
    } finally {
      isolate.dispose();
    }
  }
}

function hasCallableValues(obj: Record<string, unknown>): boolean {
  return Object.values(obj).some((v) => typeof v === "function");
}

async function injectFunction(
  Reference: any,
  context: any,
  name: string,
  fn: (...args: unknown[]) => unknown,
): Promise<void> {
  await context.evalClosure(
    `globalThis[${JSON.stringify(name)}] = function(...args) {
      return $0.apply(undefined, args, {
        arguments: { copy: true },
        result: { promise: true, copy: true },
      });
    };`,
    [new Reference(fn)],
    { arguments: { reference: true } },
  );
}

async function injectNamespace(
  Reference: any,
  ExternalCopy: any,
  context: any,
  name: string,
  ns: Record<string, unknown>,
): Promise<void> {
  const methods = Object.entries(ns).filter(([, v]) => typeof v === "function");
  const data = Object.entries(ns).filter(([, v]) => typeof v !== "function");

  let setupCode = `globalThis[${JSON.stringify(name)}] = {};\n`;

  if (data.length > 0) {
    setupCode = `
      const _data = $${methods.length};
      globalThis[${JSON.stringify(name)}] = { ..._data };
    `;
  }

  for (let i = 0; i < methods.length; i++) {
    const [methodName] = methods[i]!;
    setupCode += `
      globalThis[${JSON.stringify(name)}][${JSON.stringify(methodName)}] = function(...args) {
        return $${i}.apply(undefined, args, {
          arguments: { copy: true },
          result: { promise: true, copy: true },
        });
      };
    `;
  }

  const refs: any[] = methods.map(([, fn]) => new Reference(fn));
  if (data.length > 0) {
    const dataObj: Record<string, unknown> = {};
    for (const [key, val] of data) {
      dataObj[key] = val;
    }
    refs.push(new ExternalCopy(dataObj).copyInto());
  }

  await context.evalClosure(setupCode, refs, {
    arguments: { reference: true },
  });
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
