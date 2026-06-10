import { describe, expect, it } from "vitest";
import {
  nativeBindingCandidates,
  nativePackageNameForPlatform,
} from "../src/native.js";

describe("native loader", () => {
  it("uses napi-rs platform package names for optional native installs", () => {
    expect(nativePackageNameForPlatform("darwin", "arm64")).toBe(
      "@robinbraemer/llrt-darwin-arm64",
    );
    expect(nativePackageNameForPlatform("darwin", "x64")).toBe(
      "@robinbraemer/llrt-darwin-x64",
    );
    expect(nativePackageNameForPlatform("linux", "x64")).toBe(
      "@robinbraemer/llrt-linux-x64-gnu",
    );
    expect(nativePackageNameForPlatform("linux", "arm64")).toBe(
      "@robinbraemer/llrt-linux-arm64-gnu",
    );
  });

  it("tries local development binaries before optional platform packages", () => {
    const candidates = nativeBindingCandidates({
      platform: "darwin",
      arch: "arm64",
    });

    const firstPackageCandidate = candidates.findIndex(
      (candidate) => candidate.kind === "package",
    );

    expect(candidates[0]).toMatchObject({ kind: "path" });
    expect(firstPackageCandidate).toBeGreaterThan(0);
    expect(candidates[firstPackageCandidate]).toEqual({
      kind: "package",
      specifier: "@robinbraemer/llrt-darwin-arm64",
    });
  });
});
