export interface BenchmarkResult {
  engine: string;
  scenario: string;
  iterations: number;
  totalMs: number;
  meanMs: number;
  errors: number;
  firstError?: string;
}

export interface BenchmarkScenarioSummary {
  scenario: string;
  fastestEngine: string | null;
  fastestMeanMs: number | null;
  llrtMeanMs: number | null;
  llrtRank: number | null;
  zeroErrorEngines: string[];
}

export interface BenchmarkReportContext {
  generatedAt: string;
  command: string;
  nodeVersion: string;
  platform: string;
  arch: string;
}

export function summarizeBenchmarkResults(
  results: BenchmarkResult[],
): BenchmarkScenarioSummary[] {
  return scenarioNames(results).map((scenario) => {
    const zeroErrorResults = results
      .filter((result) => result.scenario === scenario && result.errors === 0)
      .toSorted(compareMeanThenEngine);
    const llrtIndex = zeroErrorResults.findIndex((result) => result.engine === "llrt-native");
    const fastest = zeroErrorResults[0];
    const llrt = llrtIndex >= 0 ? zeroErrorResults[llrtIndex] : undefined;

    return {
      scenario,
      fastestEngine: fastest?.engine ?? null,
      fastestMeanMs: fastest?.meanMs ?? null,
      llrtMeanMs: llrt?.meanMs ?? null,
      llrtRank: llrt ? llrtIndex + 1 : null,
      zeroErrorEngines: zeroErrorResults.map((result) => result.engine),
    };
  });
}

export function renderBenchmarkMarkdown(
  results: BenchmarkResult[],
  context: BenchmarkReportContext,
): string {
  const summaries = summarizeBenchmarkResults(results);
  const lines = [
    "# Executor Benchmark Report",
    "",
    `Generated: ${context.generatedAt}`,
    `Command: \`${context.command}\``,
    `Runtime: Node ${context.nodeVersion} on ${context.platform}/${context.arch}`,
    "",
    "## Raw Results",
    "",
    "| Scenario | Engine | Iterations | Total ms | Mean ms | Errors | First error |",
    "| --- | --- | ---: | ---: | ---: | ---: | --- |",
    ...results
      .toSorted(compareScenarioThenEngine)
      .map(
        (result) =>
          `| ${escapeCell(result.scenario)} | ${escapeCell(result.engine)} | ${result.iterations} | ${formatNumber(result.totalMs)} | ${formatNumber(result.meanMs)} | ${result.errors} | ${escapeCell(result.firstError ?? "")} |`,
      ),
    "",
    "## Scenario Summary",
    "",
    "| Scenario | Fastest zero-error engine | LLRT rank | LLRT mean ms | Fastest mean ms | Zero-error engines |",
    "| --- | --- | ---: | ---: | ---: | --- |",
    ...summaries.map(
      (summary) =>
        `| ${escapeCell(summary.scenario)} | ${escapeCell(summary.fastestEngine ?? "none")} | ${summary.llrtRank ?? "n/a"} | ${formatNullableNumber(summary.llrtMeanMs)} | ${formatNullableNumber(summary.fastestMeanMs)} | ${escapeCell(summary.zeroErrorEngines.join(", "))} |`,
    ),
    "",
    "## Interpretation",
    "",
    "These numbers are a local signal, not a universal performance claim. LLRT should become the default only when the native package is reproducibly installable, executor contract tests pass, stress tests stay green, and representative codemode snippets are inside the accepted performance envelope.",
    "",
  ];

  return lines.join("\n");
}

function scenarioNames(results: BenchmarkResult[]): string[] {
  return [...new Set(results.map((result) => result.scenario))].toSorted();
}

function compareMeanThenEngine(left: BenchmarkResult, right: BenchmarkResult): number {
  return left.meanMs - right.meanMs || left.engine.localeCompare(right.engine);
}

function compareScenarioThenEngine(left: BenchmarkResult, right: BenchmarkResult): number {
  return (
    left.scenario.localeCompare(right.scenario) ||
    left.engine.localeCompare(right.engine)
  );
}

function formatNullableNumber(value: number | null): string {
  return value === null ? "n/a" : formatNumber(value);
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}
