import type {
  LlrtExecutionErrorCode,
  LlrtExecutionErrorInfo,
  LlrtStats,
} from "./types.js";

export const emptyStats: LlrtStats = {
  wallTimeMs: 0,
  cpuTimeMs: null,
  memoryUsedBytes: null,
  memoryLimitBytes: null,
  maxStackBytes: null,
};

export function errorInfo(
  code: LlrtExecutionErrorCode,
  error: unknown,
): LlrtExecutionErrorInfo {
  if (error instanceof Error) {
    return {
      code,
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    code,
    name: "Error",
    message: String(error),
  };
}
