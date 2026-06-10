# Executor Benchmark Report

Generated: 2026-06-10T10:53:10.729Z
Command: `pnpm benchmark:executors -- --report internal/superpowers/reports/2026-06-10-llrt-executor-benchmark.md --json internal/superpowers/reports/2026-06-10-llrt-executor-benchmark.json`
Runtime: Node v24.13.1 on darwin/arm64

## Raw Results

| Scenario | Engine | Iterations | Total ms | Mean ms | Errors | First error |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| cold-simple | isolated-vm | 25 | 22.58 | 0.9 | 0 |  |
| cold-simple | llrt-native | 25 | 22.67 | 0.91 | 0 |  |
| cold-simple | quickjs-wasm | 25 | 128.84 | 5.15 | 0 |  |
| host-callbacks-parallel | isolated-vm | 25 | 20.4 | 0.82 | 0 |  |
| host-callbacks-parallel | llrt-native | 25 | 17.74 | 0.71 | 0 |  |
| host-callbacks-parallel | quickjs-wasm | 25 | 98.13 | 3.93 | 0 |  |
| openapi-json-scan | isolated-vm | 25 | 29.72 | 1.19 | 0 |  |
| openapi-json-scan | llrt-native | 25 | 22.93 | 0.92 | 0 |  |
| openapi-json-scan | quickjs-wasm | 25 | 126.12 | 5.04 | 0 |  |

## Scenario Summary

| Scenario | Fastest zero-error engine | LLRT rank | LLRT mean ms | Fastest mean ms | Zero-error engines |
| --- | --- | ---: | ---: | ---: | --- |
| cold-simple | isolated-vm | 2 | 0.91 | 0.9 | isolated-vm, llrt-native, quickjs-wasm |
| host-callbacks-parallel | llrt-native | 1 | 0.71 | 0.71 | llrt-native, isolated-vm, quickjs-wasm |
| openapi-json-scan | llrt-native | 1 | 0.92 | 0.92 | llrt-native, isolated-vm, quickjs-wasm |

## Interpretation

These numbers are a local signal, not a universal performance claim. LLRT should become the default only when the native package is reproducibly installable, executor contract tests pass, stress tests stay green, and representative codemode snippets are inside the accepted performance envelope.
