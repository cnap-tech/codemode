import { describe, expect, it } from "vitest";
import {
  parseBenchmarkCliArgs,
  resolveBenchmarkOutputPath,
} from "../src/executor/benchmark-cli.js";

describe("benchmark CLI args", () => {
  it("parses report and json output paths", () => {
    expect(parseBenchmarkCliArgs(["--report", "report.md", "--json", "report.json"])).toEqual({
      reportPath: "report.md",
      jsonPath: "report.json",
    });
  });

  it("ignores a package-manager argument separator", () => {
    expect(
      parseBenchmarkCliArgs(["--", "--report", "report.md", "--json", "report.json"]),
    ).toEqual({
      reportPath: "report.md",
      jsonPath: "report.json",
    });
  });

  it("rejects unknown options", () => {
    expect(() => parseBenchmarkCliArgs(["--wat"])).toThrow("Unknown benchmark option: --wat");
  });

  it("resolves relative output paths from the invocation directory", () => {
    expect(resolveBenchmarkOutputPath("reports/bench.md", "/repo")).toBe(
      "/repo/reports/bench.md",
    );
    expect(resolveBenchmarkOutputPath("/tmp/bench.md", "/repo")).toBe("/tmp/bench.md");
  });
});
