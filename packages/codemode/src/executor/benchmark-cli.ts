import { isAbsolute, join } from "node:path";

export interface BenchmarkCliOptions {
  reportPath?: string;
  jsonPath?: string;
}

export function parseBenchmarkCliArgs(args: string[]): BenchmarkCliOptions {
  const options: BenchmarkCliOptions = {};

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    }

    if (arg === "--report") {
      options.reportPath = requiredValue(args, ++index, arg);
    } else if (arg === "--json") {
      options.jsonPath = requiredValue(args, ++index, arg);
    } else {
      throw new Error(`Unknown benchmark option: ${arg}`);
    }
  }

  return options;
}

function requiredValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

export function resolveBenchmarkOutputPath(path: string, baseDir: string): string {
  return isAbsolute(path) ? path : join(baseDir, path);
}
