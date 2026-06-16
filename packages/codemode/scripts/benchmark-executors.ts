import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import { arch, argv, cwd, env, platform, version } from "node:process";
import {
  parseBenchmarkCliArgs,
  resolveBenchmarkOutputPath,
} from "../src/executor/benchmark-cli.js";
import { renderBenchmarkMarkdown, type BenchmarkResult } from "../src/executor/benchmark-report.js";
import { IsolatedVMExecutor } from "../src/executor/isolated-vm.js";
import { LlrtNativeExecutor } from "../src/executor/llrt-native.js";
import { QuickJSExecutor } from "../src/executor/quickjs.js";
import type { Executor, SandboxOptions } from "../src/types.js";

type ExecutorFactory = (options: SandboxOptions) => Executor;

interface Engine {
  name: string;
  create: ExecutorFactory;
}

interface Scenario {
  name: string;
  iterations: number;
  code: string;
  globals: Record<string, unknown>;
}

const engines: Engine[] = [
  {
    name: "llrt-native",
    create: (options) => new LlrtNativeExecutor(options),
  },
  {
    name: "isolated-vm",
    create: (options) => new IsolatedVMExecutor(options),
  },
  {
    name: "quickjs-wasm",
    create: (options) => new QuickJSExecutor(options),
  },
];

const scenarios: Scenario[] = [
  {
    name: "cold-simple",
    iterations: 25,
    code: `async () => ({ value: 1 + 2 })`,
    globals: {},
  },
  {
    name: "openapi-json-scan",
    iterations: 25,
    code: `async () => Object.keys(spec.paths).filter((path) => path.includes("cluster")).length`,
    globals: {
      spec: createOpenApiFixture(250),
    },
  },
  {
    name: "host-callbacks-parallel",
    iterations: 25,
    code: `async () => {
      const values = await Promise.all([
        add(1, 2),
        add(3, 4),
        add(5, 6),
      ]);
      return values.reduce((sum, value) => sum + value, 0);
    }`,
    globals: {
      add: async (left: number, right: number) => left + right,
    },
  },
];

const cliOptions = parseBenchmarkCliArgs(argv.slice(2));
const results: BenchmarkResult[] = [];
const invocationDir = env.INIT_CWD ?? cwd();

for (const engine of engines) {
  for (const scenario of scenarios) {
    // Benchmark scenarios run sequentially to avoid cross-engine interference.
    // oxlint-disable-next-line no-await-in-loop
    const result = await runScenario(engine, scenario);
    results.push(result);
    console.log(JSON.stringify(result));
  }
}

if (cliOptions.jsonPath) {
  await writeTextFile(
    resolveBenchmarkOutputPath(cliOptions.jsonPath, invocationDir),
    `${JSON.stringify(results, null, 2)}\n`,
  );
}

if (cliOptions.reportPath) {
  await writeTextFile(
    resolveBenchmarkOutputPath(cliOptions.reportPath, invocationDir),
    renderBenchmarkMarkdown(results, {
      generatedAt: new Date().toISOString(),
      command: `pnpm benchmark:executors${argv.slice(2).length > 0 ? ` ${argv.slice(2).join(" ")}` : ""}`,
      nodeVersion: version,
      platform,
      arch,
    }),
  );
}

async function runScenario(
  engine: Engine,
  scenario: Scenario,
): Promise<BenchmarkResult> {
  const start = performance.now();
  let errors = 0;
  let firstError: string | undefined;

  for (let index = 0; index < scenario.iterations; index++) {
    const executor = engine.create({
      memoryMB: 64,
      timeoutMs: 5_000,
      wallTimeMs: 5_000,
    });

    try {
      // Each iteration creates and exercises one fresh executor by design.
      // oxlint-disable-next-line no-await-in-loop
      const result = await executor.execute(scenario.code, scenario.globals);
      if (result.error) {
        errors++;
        firstError ??= result.error;
      }
    } catch (error) {
      errors++;
      firstError ??= error instanceof Error ? error.message : String(error);
    } finally {
      executor.dispose?.();
    }
  }

  const totalMs = performance.now() - start;

  return {
    engine: engine.name,
    scenario: scenario.name,
    iterations: scenario.iterations,
    totalMs: round(totalMs),
    meanMs: round(totalMs / scenario.iterations),
    errors,
    ...(firstError ? { firstError } : {}),
  };
}

function createOpenApiFixture(pathCount: number): Record<string, unknown> {
  const paths: Record<string, unknown> = {};

  for (let index = 0; index < pathCount; index++) {
    const resource = index % 5 === 0 ? "clusters" : "products";
    paths[`/v1/${resource}/${index}`] = {
      get: {
        operationId: `get${resource}${index}`,
        responses: {
          "200": {
            description: "OK",
          },
        },
      },
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Benchmark API",
      version: "1.0.0",
    },
    paths,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

async function writeTextFile(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}
