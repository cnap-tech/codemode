import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  expectedNativePackages,
  verifyNativeArtifacts,
} from "../scripts/verify-native-artifacts.mjs";

describe("native artifact verifier", () => {
  it("derives the expected optional native packages from napi targets", () => {
    expect(expectedNativePackages(["aarch64-apple-darwin", "x86_64-unknown-linux-gnu"])).toEqual([
      {
        cpu: "arm64",
        dir: "darwin-arm64",
        libc: undefined,
        nodeFile: "llrt_node.darwin-arm64.node",
        os: "darwin",
        packageName: "@robinbraemer/llrt-darwin-arm64",
        target: "aarch64-apple-darwin",
      },
      {
        cpu: "x64",
        dir: "linux-x64-gnu",
        libc: "glibc",
        nodeFile: "llrt_node.linux-x64-gnu.node",
        os: "linux",
        packageName: "@robinbraemer/llrt-linux-x64-gnu",
        target: "x86_64-unknown-linux-gnu",
      },
    ]);
  });

  it("passes manifest verification for the checked-in native package layout", async () => {
    await expect(verifyNativeArtifacts({ requireBinaries: false })).resolves.toEqual([
      "darwin-arm64",
      "darwin-x64",
      "linux-arm64-gnu",
      "linux-x64-gnu",
    ]);
  });

  it("fails strict verification when a native binary artifact is missing", async () => {
    const root = mkdtempSync(join(tmpdir(), "llrt-artifact-verify-"));
    try {
      writeJson(join(root, "package.json"), {
        license: "MIT",
        publishConfig: { access: "public" },
        version: "0.0.0",
        napi: {
          targets: ["aarch64-apple-darwin"],
        },
      });
      const packageDir = join(root, "npm", "darwin-arm64");
      mkdirSync(packageDir, { recursive: true });
      writeJson(join(packageDir, "package.json"), {
        name: "@robinbraemer/llrt-darwin-arm64",
        version: "0.0.0",
        cpu: ["arm64"],
        os: ["darwin"],
        main: "llrt_node.darwin-arm64.node",
        files: ["llrt_node.darwin-arm64.node"],
        license: "MIT",
        publishConfig: { access: "public" },
      });

      await expect(
        verifyNativeArtifacts({ packageRoot: root, requireBinaries: true }),
      ).rejects.toThrow("Missing native artifact: npm/darwin-arm64/llrt_node.darwin-arm64.node");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

});

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
