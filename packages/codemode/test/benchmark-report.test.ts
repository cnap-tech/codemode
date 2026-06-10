import { describe, expect, it } from "vitest";
import {
  renderBenchmarkMarkdown,
  summarizeBenchmarkResults,
  type BenchmarkResult,
} from "../src/executor/benchmark-report.js";

const sampleResults: BenchmarkResult[] = [
  {
    engine: "llrt-native",
    scenario: "cold-simple",
    iterations: 25,
    totalMs: 50,
    meanMs: 2,
    errors: 0,
  },
  {
    engine: "isolated-vm",
    scenario: "cold-simple",
    iterations: 25,
    totalMs: 25,
    meanMs: 1,
    errors: 0,
  },
  {
    engine: "quickjs-wasm",
    scenario: "cold-simple",
    iterations: 25,
    totalMs: 100,
    meanMs: 4,
    errors: 1,
    firstError: "boom",
  },
  {
    engine: "llrt-native",
    scenario: "host-callbacks-parallel",
    iterations: 25,
    totalMs: 80,
    meanMs: 3.2,
    errors: 0,
  },
  {
    engine: "isolated-vm",
    scenario: "host-callbacks-parallel",
    iterations: 25,
    totalMs: 120,
    meanMs: 4.8,
    errors: 0,
  },
];

describe("benchmark report helpers", () => {
  it("summarizes the fastest zero-error engine per scenario", () => {
    expect(summarizeBenchmarkResults(sampleResults)).toEqual([
      {
        scenario: "cold-simple",
        fastestEngine: "isolated-vm",
        fastestMeanMs: 1,
        llrtMeanMs: 2,
        llrtRank: 2,
        zeroErrorEngines: ["isolated-vm", "llrt-native"],
      },
      {
        scenario: "host-callbacks-parallel",
        fastestEngine: "llrt-native",
        fastestMeanMs: 3.2,
        llrtMeanMs: 3.2,
        llrtRank: 1,
        zeroErrorEngines: ["llrt-native", "isolated-vm"],
      },
    ]);
  });

  it("renders a markdown report with environment context and error visibility", () => {
    const report = renderBenchmarkMarkdown(sampleResults, {
      generatedAt: "2026-06-10T10:00:00.000Z",
      command: "pnpm benchmark:executors",
      nodeVersion: "v24.0.0",
      platform: "darwin",
      arch: "arm64",
    });

    expect(report).toContain("# Executor Benchmark Report");
    expect(report).toContain("Generated: 2026-06-10T10:00:00.000Z");
    expect(report).toContain("Runtime: Node v24.0.0 on darwin/arm64");
    expect(report).toContain(
      "| cold-simple | isolated-vm | 25 | 25 | 1 | 0 |  |",
    );
    expect(report).toContain(
      "| cold-simple | quickjs-wasm | 25 | 100 | 4 | 1 | boom |",
    );
    expect(report).toContain(
      "| host-callbacks-parallel | llrt-native | 1 | 3.2 | 3.2 | llrt-native, isolated-vm |",
    );
  });
});
