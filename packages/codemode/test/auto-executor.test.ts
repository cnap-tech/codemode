import { afterEach, describe, expect, it, vi } from "vitest";
import { LlrtNativeExecutor } from "../src/executor/llrt-native.js";
import { isMissingOptionalDependency } from "../src/executor/auto.js";

afterEach(() => {
  vi.doUnmock("@robinbraemer/llrt");
  vi.resetModules();
});

describe("createExecutor", () => {
  it("prefers native LLRT when the optional package is installed", async () => {
    const { createExecutor } = await import("../src/executor/auto.js");

    const executor = await createExecutor();

    expect(executor).toBeInstanceOf(LlrtNativeExecutor);
  });

  it("only treats the selected optional dependency itself as safely missing", () => {
    const missingLlrt = Object.assign(
      new Error("Cannot find package '@robinbraemer/llrt' imported from auto.ts"),
      { code: "ERR_MODULE_NOT_FOUND" },
    );
    const missingNestedDependency = Object.assign(
      new Error("Cannot find package 'nested-native-helper' imported from @robinbraemer/llrt"),
      { code: "ERR_MODULE_NOT_FOUND" },
    );

    expect(isMissingOptionalDependency(missingLlrt, "@robinbraemer/llrt")).toBe(true);
    expect(
      isMissingOptionalDependency(missingNestedDependency, "@robinbraemer/llrt"),
    ).toBe(false);
    expect(
      isMissingOptionalDependency(new Error("broken llrt package"), "@robinbraemer/llrt"),
    ).toBe(false);
  });
});
