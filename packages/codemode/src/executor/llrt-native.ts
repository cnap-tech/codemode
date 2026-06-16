import type { Executor, ExecuteResult, ExecuteStats, SandboxOptions } from "../types.js";

/**
 * Experimental in-process LLRT executor backed by `@robinbraemer/llrt`.
 *
 * Plain globals cross as JSON. Function globals and one-level namespace
 * methods cross through the LLRT host callback bridge.
 */
export class LlrtNativeExecutor implements Executor {
  private readonly memoryMB: number;
  private readonly timeoutMs: number;
  private readonly wallTimeMs: number;

  constructor(options: SandboxOptions = {}) {
    this.memoryMB = options.memoryMB ?? 64;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.wallTimeMs = options.wallTimeMs ?? 60_000;
  }

  async execute(
    code: string,
    globals: Record<string, unknown>,
  ): Promise<ExecuteResult> {
    const start = Date.now();

    try {
      const { LlrtRuntime } = await import("@robinbraemer/llrt");
      const runtime = new LlrtRuntime({
        memoryMB: this.memoryMB,
        wallTimeMs: Math.min(this.timeoutMs, this.wallTimeMs),
      });
      const bindings = buildHostBindings(globals);
      const result = await runtime.callJson<ExecutionInput, unknown>(
        wrapCode(code),
        bindings.input,
        { functions: bindings.functions },
      );

      if (!result.ok) {
        return {
          result: undefined,
          error: formatLlrtError(result.error),
          stats: statsFromLlrt(result.stats, start, this.memoryMB),
        };
      }

      return {
        result: result.value,
        stats: statsFromLlrt(result.stats, start, this.memoryMB),
      };
    } catch (error) {
      return {
        result: undefined,
        error: error instanceof Error ? error.message : String(error),
        stats: emptyStats(Date.now() - start, this.memoryMB),
      };
    }
  }
}

type HostCallable = (...args: unknown[]) => unknown | Promise<unknown>;

interface ExecutionInput {
  globals: Record<string, unknown>;
  globalFunctions: Record<string, string>;
  namespaceFunctions: Record<string, Record<string, string>>;
}

function buildHostBindings(globals: Record<string, unknown>): {
  input: ExecutionInput;
  functions: Record<string, HostCallable>;
} {
  const input: ExecutionInput = {
    globals: {},
    globalFunctions: {},
    namespaceFunctions: {},
  };
  const functions: Record<string, HostCallable> = {};

  for (const [name, value] of Object.entries(globals)) {
    if (isHostCallable(value)) {
      input.globalFunctions[name] = name;
      functions[name] = value;
      continue;
    }

    if (isNamespace(value)) {
      const namespaceData: Record<string, unknown> = {};
      const namespaceFunctions: Record<string, string> = {};

      for (const [key, entry] of Object.entries(value)) {
        if (isHostCallable(entry)) {
          const hostName = `${name}.${key}`;
          namespaceFunctions[key] = hostName;
          functions[hostName] = entry;
        } else {
          namespaceData[key] = entry;
        }
      }

      input.globals[name] = namespaceData;
      if (Object.keys(namespaceFunctions).length > 0) {
        input.namespaceFunctions[name] = namespaceFunctions;
      }
      continue;
    }

    input.globals[name] = value;
  }

  return { input, functions };
}

function isHostCallable(value: unknown): value is HostCallable {
  return typeof value === "function";
}

function isNamespace(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function wrapCode(code: string): string {
  return `async ({ input, host }) => {
    globalThis.require = undefined;
    globalThis.process = undefined;
    globalThis.fetch = undefined;
    globalThis.console = {
      log: () => {},
      warn: () => {},
      error: () => {},
    };

    for (const [name, value] of Object.entries(input.globals)) {
      globalThis[name] = value;
    }

    for (const [name, hostName] of Object.entries(input.globalFunctions)) {
      globalThis[name] = (...args) => host[hostName](...args);
    }

    for (const [namespace, methods] of Object.entries(input.namespaceFunctions)) {
      const namespaceValue = globalThis[namespace] ?? {};
      for (const [methodName, hostName] of Object.entries(methods)) {
        namespaceValue[methodName] = (...args) => host[hostName](...args);
      }
      globalThis[namespace] = namespaceValue;
    }

    return await (${code})();
  }`;
}

function formatLlrtError(error: {
  code: string;
  name: string;
  message: string;
}): string {
  if (error.code === "TIMEOUT") {
    return `Wall-clock timeout exceeded: ${error.name}: ${error.message}`;
  }
  return `${error.code}: ${error.name}: ${error.message}`;
}

function statsFromLlrt(
  stats: {
    wallTimeMs: number;
    cpuTimeMs: number | null;
    memoryUsedBytes: number | null;
    memoryLimitBytes: number | null;
  },
  start: number,
  memoryMB: number,
): ExecuteStats {
  const wallTimeMs = stats.wallTimeMs || Date.now() - start;
  const heapUsedBytes = stats.memoryUsedBytes ?? 0;
  const heapSizeLimitBytes = stats.memoryLimitBytes ?? memoryMB * 1024 * 1024;

  return {
    cpuTimeMs: stats.cpuTimeMs ?? wallTimeMs,
    wallTimeMs,
    heapUsedBytes,
    heapTotalBytes: heapUsedBytes,
    externalBytes: 0,
    heapSizeLimitBytes,
    totalPhysicalBytes: heapUsedBytes,
    availableBytes: Math.max(0, heapSizeLimitBytes - heapUsedBytes),
    executableBytes: 0,
    mallocedBytes: 0,
    peakMallocedBytes: 0,
  };
}

function emptyStats(wallTimeMs: number, memoryMB: number): ExecuteStats {
  return {
    cpuTimeMs: wallTimeMs,
    wallTimeMs,
    heapUsedBytes: 0,
    heapTotalBytes: 0,
    externalBytes: 0,
    heapSizeLimitBytes: memoryMB * 1024 * 1024,
    totalPhysicalBytes: 0,
    availableBytes: memoryMB * 1024 * 1024,
    executableBytes: 0,
    mallocedBytes: 0,
    peakMallocedBytes: 0,
  };
}
