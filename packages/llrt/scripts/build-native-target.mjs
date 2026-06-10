import { spawn } from "node:child_process";

const target = process.env.LLRT_TARGET;

if (!target) {
  throw new Error("LLRT_TARGET is required, for example LLRT_TARGET=aarch64-apple-darwin");
}

const args = [
  "build",
  "--manifest-path",
  "native/Cargo.toml",
  "--platform",
  "--release",
  "--target",
  target,
];

const child = spawn("napi", args, {
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
