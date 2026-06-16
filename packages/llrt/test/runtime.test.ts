import { afterEach, describe, expect, it } from "vitest";
import { LlrtRuntime } from "../src/index.js";
import { setNativeBindingForTest, type NativeBinding } from "../src/native.js";

const stats = {
  wallTimeMs: 3,
  cpuTimeMs: null,
  memoryUsedBytes: null,
  memoryLimitBytes: null,
  maxStackBytes: null,
};

afterEach(() => {
  setNativeBindingForTest(undefined);
});

describe("LlrtRuntime", () => {
  it("passes JSON input to the native binding and parses JSON output", async () => {
    const calls: unknown[] = [];
    const binding: NativeBinding = {
      nativeSmoke() {
        return "llrt-native-ok";
      },
      callJson(source, inputJson, options) {
        calls.push({ source, inputJson, options });
        return Promise.resolve({
          ok: true,
          valueJson: JSON.stringify({ title: "Petstore" }),
          stats,
        });
      },
      dispose() {},
    };
    setNativeBindingForTest(binding);

    const runtime = new LlrtRuntime({ wallTimeMs: 1000, memoryMB: 64 });

    const result = await runtime.callJson<
      { spec: { info: { title: string } } },
      { title: string }
    >(
      `async ({ input }) => ({ title: input.spec.info.title })`,
      { spec: { info: { title: "Petstore" } } },
      { wallTimeMs: 50 },
    );

    expect(result).toEqual({
      ok: true,
      value: { title: "Petstore" },
      stats,
    });
    expect(calls).toEqual([
      {
        source: `async ({ input }) => ({ title: input.spec.info.title })`,
        inputJson: JSON.stringify({ spec: { info: { title: "Petstore" } } }),
        options: {
          memoryMb: 64,
          wallTimeMs: 50,
          cpuTimeMs: undefined,
          maxStackBytes: undefined,
        },
      },
    ]);
  });

  it("returns a typed serialization failure when input cannot be JSON stringified", async () => {
    const runtime = new LlrtRuntime();
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    const result = await runtime.callJson(`async () => null`, circular);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SERIALIZATION_ERROR");
      expect(result.error.message).toContain("Converting circular structure");
    }
  });

  it("returns a typed native load failure when no native binding can be loaded", async () => {
    setNativeBindingForTest(null);
    const runtime = new LlrtRuntime();

    const result = await runtime.callJson(`async () => 1`, {});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NATIVE_LOAD_ERROR");
    }
  });

  it("returns a typed disposed failure without calling native", async () => {
    const calls: unknown[] = [];
    const binding: NativeBinding = {
      nativeSmoke() {
        return "llrt-native-ok";
      },
      callJson() {
        calls.push("called");
        return Promise.resolve({
          ok: true,
          valueJson: "null",
          stats,
        });
      },
      dispose() {},
    };
    setNativeBindingForTest(binding);
    const runtime = new LlrtRuntime();

    runtime.dispose();
    const result = await runtime.callJson(`async () => 1`, {});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("RUNTIME_DISPOSED");
    }
    expect(calls).toEqual([]);
  });
});
