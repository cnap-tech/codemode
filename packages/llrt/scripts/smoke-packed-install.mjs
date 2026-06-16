import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const packageRoot = resolve(import.meta.dirname, "..");

function platformArchAbi() {
  if (process.platform === "darwin" && process.arch === "arm64") return "darwin-arm64";
  if (process.platform === "darwin" && process.arch === "x64") return "darwin-x64";
  if (process.platform === "linux" && process.arch === "x64") return "linux-x64-gnu";
  if (process.platform === "linux" && process.arch === "arm64") return "linux-arm64-gnu";

  throw new Error(`Unsupported LLRT smoke platform: ${process.platform}/${process.arch}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: packageRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });

  if (result.status !== 0) {
    throw new Error([
      `Command failed: ${command} ${args.join(" ")}`,
      result.stdout,
      result.stderr,
    ].join("\n"));
  }

  return result.stdout;
}

function pack(cwd) {
  const stdout = run("npm", ["pack", "--json", "--pack-destination", packDir], { cwd });
  const [packed] = JSON.parse(stdout);
  if (!packed?.filename) {
    throw new Error(`npm pack did not return a filename for ${cwd}`);
  }

  return join(packDir, packed.filename);
}

const nativePackageDir = join(packageRoot, "npm", platformArchAbi());
const consumerDir = mkdtempSync(join(tmpdir(), "llrt-packed-install-"));
const packDir = join(consumerDir, "packs");
mkdirSync(packDir);
const mainTarball = pack(packageRoot);
const nativeTarball = pack(nativePackageDir);

try {
  writeFileSync(
    join(consumerDir, "package.json"),
    JSON.stringify({ type: "module", private: true }, null, 2),
  );
  run("npm", ["install", "--ignore-scripts", mainTarball, nativeTarball], {
    cwd: consumerDir,
  });
  run(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `
        import { LlrtRuntime } from "@robinbraemer/llrt";
        const runtime = new LlrtRuntime({ memoryMB: 8, wallTimeMs: 1000 });
        const result = await runtime.callJson(
          "async ({ input }) => ({ ok: true, value: input.value * 2 })",
          { value: 21 }
        );
        if (!result.ok || result.value.value !== 42) {
          throw new Error("Packed LLRT execution failed: " + JSON.stringify(result));
        }
      `,
    ],
    { cwd: consumerDir },
  );
} finally {
  rmSync(consumerDir, { recursive: true, force: true });
}
