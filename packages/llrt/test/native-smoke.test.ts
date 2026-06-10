import { describe, expect, it } from "vitest";
import { loadNativeBinding } from "../src/native.js";

describe("native LLRT binding", () => {
  it("loads the native module and exposes a smoke function", () => {
    const binding = loadNativeBinding();

    expect(binding.nativeSmoke()).toBe("llrt-native-ok");
  });
});
