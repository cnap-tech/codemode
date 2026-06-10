# Standalone LLRT Runtime Adoption Plan

**Date:** 2026-06-10

**Status:** Prototype implemented; release and promotion gates remain.

**Working directory:** `/Users/robin/Developer/cnap-tech/codemode`

## Objective

Move codemode toward LLRT as the preferred JavaScript execution engine by building a standalone `@robinbraemer/llrt` package, wiring codemode to use it experimentally, and proving the safety/performance properties needed before CNAP adopts it as the default.

## Completed Prototype Work

- [x] Created `packages/llrt` as a standalone TypeScript package.
- [x] Added a Rust `napi-rs` native crate in `packages/llrt/native`.
- [x] Built a native smoke export.
- [x] Implemented `LlrtRuntime.callJson<TInput, TOutput>()`.
- [x] Added structured result/error types.
- [x] Added JSON input serialization and output parsing.
- [x] Added fresh LLRT VM per call.
- [x] Added wall-time timeout with rquickjs interrupt handler plus outer Tokio timeout.
- [x] Added memory limit via LLRT/rquickjs runtime memory limit.
- [x] Added async host callbacks through a JSON-safe N-API dispatcher.
- [x] Added standalone tests for execution, errors, isolation, timeout, memory pressure, and host callbacks.
- [x] Added LLRT stress tests for per-call memory overrides, repeated isolation, concurrent host callbacks, and concurrent stalled callback timeouts.
- [x] Made root `pnpm test` run both `@robinbraemer/llrt` and `@robinbraemer/codemode`.
- [x] Added `LlrtNativeExecutor` in codemode.
- [x] Ran the shared codemode executor contract against `LlrtNativeExecutor`.
- [x] Made `createExecutor()` prefer LLRT when `@robinbraemer/llrt` is installed.
- [x] Kept fallback executors available.
- [x] Tightened fallback policy so broken installed LLRT does not silently fall back.
- [x] Added `benchmark:executors` to collect local LLRT vs `isolated-vm` vs QuickJS WASM evidence.
- [x] Replaced absolute local LLRT Rust paths with a package-local `prepare:llrt-source` step and relative Cargo paths.
- [x] Added napi-rs optional platform package manifests for darwin arm64/x64 and linux glibc arm64/x64.
- [x] Taught the native loader to try the current platform's optional native package.
- [x] Verified `npm pack --dry-run` keeps the main package JS/types-only and puts the current platform native artifact in its optional package.
- [x] Added `.github/workflows/llrt-native.yml` to build every declared native target, dry-run-pack optional packages, assemble artifacts, and publish the LLRT package family on releases.
- [x] Added a workflow/manifest guard test so LLRT tests fail if the native target matrix or main package prepublish hook regresses.
- [x] Added an explicit `LLRT_TARGET` native build script so CI passes native targets directly to napi-rs instead of relying on package-manager argument forwarding.
- [x] Added `smoke:packed-install` to pack the main and current optional native package, install them into a temporary consumer project, and execute LLRT from that install.

## Current Known Rough Edges

- [ ] Source builds still need network access, `yarn install`, and upstream `make js` until native prebuilds or upstream crates exist.
- [ ] Native prebuild CI is implemented but not yet proven by a GitHub Actions run across all target runners.
- [ ] Cross-platform package artifact strategy is specified and locally smoke-tested for the current platform, but full target tarballs still need GitHub matrix evidence.
- [ ] Stress coverage exists for core LLRT safety properties; representative CNAP/codemode workload stress still needs a larger report.
- [ ] The standalone runtime security policy is not final; codemode masks `require`, `process`, and `fetch` in its adapter.
- [ ] `LlrtProcessExecutor` remains as a proof-of-concept fallback; decide later whether to keep, hide, or remove it.
- [ ] Full repo lint/preflight has not been run for this branch.

## Next Engineering Steps

1. **Make the native dependency reproducible**
   - Status: implemented for local/source builds.
   - `prepare:llrt-source` shallow-fetches `awslabs/llrt` at `80c113ddee03ff1926068193f50fe35f41ca2105`.
   - The script runs upstream `yarn install --immutable` and `make js` so `llrt_core` has the generated `bundle/js` assets its build script requires.
   - Cargo now uses relative paths under `packages/llrt/vendor/llrt`.
   - Remaining release question: whether source builds are acceptable, or whether npm should rely only on prebuilt native artifacts.

2. **Add benchmark and stress evidence**
   - Status: baseline benchmarks and core LLRT stress tests implemented.
   - Measured cold simple execution.
   - Measured JSON-heavy OpenAPI-spec execution.
   - Measured async host callback chains.
   - Stress-tested repeated fresh VM execution.
   - Stress-tested concurrent host callback traffic.
   - Stress-tested stalled host callback timeouts.
   - Stress-tested per-call memory overrides.
   - Compare native LLRT, `isolated-vm`, and QuickJS WASM.
   - Remaining: run/report representative CNAP/codemode workloads, preferably in CI.

3. **Harden the native package release path**
   - Status: local package layout implemented; native prebuild workflow added.
   - Generated napi-rs platform packages under `packages/llrt/npm`.
   - Main package ships JS/types only.
   - Platform packages ship `.node` binaries with OS/CPU/libc gates.
   - Loader tries local development binaries first, then the current optional platform package.
   - Prebuild matrix covers darwin arm64/x64 and linux glibc arm64/x64.
   - Workflow dry-run-packs the main package and every optional package before release publishing.
   - Targeted native builds require `LLRT_TARGET` and fail fast when it is missing.
   - Packed-install smoke test imports and executes LLRT from a temporary consumer project.
   - Document supported Node/platform combinations.
   - Publish with `napi pre-publish` so optional dependencies are injected at the release version.
   - Remaining: run the workflow on GitHub and inspect artifacts/logs from all runners.

4. **Finalize codemode default behavior**
   - Keep LLRT first in `createExecutor()` when installed.
   - Keep explicit fallback engine classes exported.
   - Add user-facing docs for selecting a non-default engine if needed.
   - Keep installed-but-broken LLRT failures loud.

5. **Prepare CNAP adoption**
   - Release or locally link the codemode package.
   - Update CNAP dependency.
   - Run CNAP-specific codemode flows against LLRT.
   - Keep rollback path to `isolated-vm` or QuickJS.

## Verification Commands

Use Node 24 and pnpm 10:

```bash
PATH=/Users/robin/.local/share/mise/installs/node/24/bin:$PATH \
/Users/robin/.local/share/mise/installs/pnpm/10.25.0/pnpm \
  --filter @robinbraemer/llrt run dev:native
```

```bash
PATH=/Users/robin/.local/share/mise/installs/node/24/bin:$PATH \
/Users/robin/.local/share/mise/installs/pnpm/10.25.0/pnpm \
  --filter @robinbraemer/llrt exec vitest run test/native-loader.test.ts --pool=forks --maxWorkers=1 --testTimeout=15000
```

```bash
PATH=/Users/robin/.local/share/mise/installs/node/24/bin:$PATH \
/Users/robin/.local/share/mise/installs/pnpm/10.25.0/pnpm \
  --filter @robinbraemer/llrt exec vitest run test/call-json.test.ts test/runtime.test.ts test/native-smoke.test.ts test/stress.test.ts --pool=forks --maxWorkers=1 --testTimeout=20000
```

```bash
cd /Users/robin/Developer/cnap-tech/codemode/packages/llrt && npm pack --dry-run
cd /Users/robin/Developer/cnap-tech/codemode/packages/llrt/npm/darwin-arm64 && npm pack --dry-run
cd /Users/robin/Developer/cnap-tech/codemode && mise exec -- pnpm --filter @robinbraemer/llrt run smoke:packed-install
```

```bash
cd /Users/robin/Developer/cnap-tech/codemode && mise exec actionlint -- actionlint .github/workflows/*.yml
cd /Users/robin/Developer/cnap-tech/codemode && mise exec -- task ci
```

```bash
PATH=/Users/robin/.local/share/mise/installs/node/24/bin:$PATH \
/Users/robin/.local/share/mise/installs/pnpm/10.25.0/pnpm \
  test
```

```bash
PATH=/Users/robin/.local/share/mise/installs/node/24/bin:$PATH \
/Users/robin/.local/share/mise/installs/pnpm/10.25.0/pnpm \
  --filter @robinbraemer/llrt run typecheck
```

```bash
PATH=/Users/robin/.local/share/mise/installs/node/24/bin:$PATH \
/Users/robin/.local/share/mise/installs/pnpm/10.25.0/pnpm \
  --filter @robinbraemer/codemode run typecheck
```

```bash
PATH=/Users/robin/.local/share/mise/installs/node/24/bin:$PATH \
/Users/robin/.local/share/mise/installs/pnpm/10.25.0/pnpm \
  --filter @robinbraemer/codemode run benchmark:executors
```

Latest local sample on 2026-06-10:

| Engine | Scenario | Mean ms | Errors |
| --- | --- | ---: | ---: |
| `llrt-native` | `cold-simple` | 2.47 | 0 |
| `llrt-native` | `openapi-json-scan` | 3.74 | 0 |
| `llrt-native` | `host-callbacks-parallel` | 2.24 | 0 |
| `isolated-vm` | `cold-simple` | 1.01 | 0 |
| `isolated-vm` | `openapi-json-scan` | 1.32 | 0 |
| `isolated-vm` | `host-callbacks-parallel` | 0.83 | 0 |
| `quickjs-wasm` | `cold-simple` | 5.50 | 0 |
| `quickjs-wasm` | `openapi-json-scan` | 4.92 | 0 |
| `quickjs-wasm` | `host-callbacks-parallel` | 3.61 | 0 |

## Promotion Standard

Promote LLRT from default candidate to production default only when the evidence proves:

- fresh install can build or install `@robinbraemer/llrt`;
- supported platform native artifacts are available;
- codemode executor contract passes in CI;
- safety stress tests cover memory, timeout, callback stalls, and isolation;
- performance is materially better or operationally simpler than the current default for representative codemode workloads;
- fallback engine selection is documented and tested.
