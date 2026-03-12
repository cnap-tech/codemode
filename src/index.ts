// Core
export { CodeMode } from "./codemode.js";

// Types
export type {
  CodeModeOptions,
  Executor,
  ExecuteResult,
  ExecuteStats,
  OpenAPISpec,
  RequestHandler,
  SandboxOptions,
  SpecProvider,
  ToolCallResult,
  ToolDefinition,
} from "./types.js";

// Executors (for advanced usage / custom executor selection)
export { IsolatedVMExecutor } from "./executor/isolated-vm.js";
export { createExecutor } from "./executor/auto.js";

// Request bridge (for advanced usage / custom request handling)
export { createRequestBridge } from "./request-bridge.js";
export type { SandboxRequestOptions, SandboxResponse, RequestBridgeFn } from "./request-bridge.js";

// Spec processing
export { resolveRefs, processSpec, extractTags, extractServerBasePath } from "./spec.js";

// Response truncation
export { truncateResponse } from "./truncate.js";

// Errors
export { CodemodeError, ApprovalRequiredError } from "./errors.js";

// Approvals
export { ApprovalStore } from "./approvals.js";
export type { ApprovalStatus, PendingApproval } from "./approvals.js";

// Policy
export { PolicyEngine } from "./policy/engine.js";
export type { Policy, PolicyAction, PolicyRule } from "./policy/types.js";
export type { PolicyEngineOptions } from "./policy/engine.js";

// Platform API
export { createPlatformApi } from "./platform/api.js";
export type { PlatformApiOptions } from "./platform/api.js";
