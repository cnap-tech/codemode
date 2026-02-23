import { createExecutor } from "./executor/auto.js";
import { createRequestBridge } from "./request-bridge.js";
import { createExecuteToolDefinition, createSearchToolDefinition } from "./tools.js";
import type {
  CodeModeOptions,
  Executor,
  OpenAPISpec,
  SpecProvider,
  ToolCallResult,
  ToolDefinition,
} from "./types.js";

/**
 * CodeMode provides `search` and `execute` MCP tools that let an AI agent
 * discover and call your API by writing JavaScript code in a sandboxed runtime.
 *
 * Instead of defining hundreds of individual MCP tools (one per API endpoint),
 * CodeMode exposes just two tools:
 * - `search` — the agent writes JS to filter your OpenAPI spec
 * - `execute` — the agent writes JS to call your API via a typed client
 *
 * @example
 * ```ts
 * import { CodeMode } from 'codemode';
 * import { Hono } from 'hono';
 *
 * const app = new Hono();
 * // ... define routes ...
 *
 * const codemode = new CodeMode({
 *   spec: () => generateOpenAPISpec(app),
 *   request: app.request.bind(app),
 *   namespace: 'cnap',
 * });
 *
 * // Get MCP tool definitions
 * const tools = codemode.tools();
 *
 * // Handle a tool call
 * const result = await codemode.callTool('search', { code: 'async () => ...' });
 * ```
 */
export class CodeMode {
  private specProvider: SpecProvider;
  private requestBridge: (...args: unknown[]) => Promise<unknown>;
  private namespace: string;
  private executor: Executor | null;
  private executorPromise: Promise<Executor> | null = null;
  private options: CodeModeOptions;
  private searchToolName: string;
  private executeToolName: string;

  constructor(options: CodeModeOptions) {
    this.options = options;
    this.specProvider = options.spec;
    this.namespace = options.namespace ?? "api";
    this.executor = options.executor ?? null;
    this.searchToolName = "search";
    this.executeToolName = "execute";

    const baseUrl = options.baseUrl ?? "http://localhost";
    const bridge = createRequestBridge(options.request, baseUrl);
    this.requestBridge = (...args: unknown[]) => bridge(args[0] as any);
  }

  /**
   * Override the default tool names.
   */
  setToolNames(search: string, execute: string): this {
    this.searchToolName = search;
    this.executeToolName = execute;
    return this;
  }

  /**
   * Returns MCP tool definitions for search and execute.
   */
  tools(): ToolDefinition[] {
    return [
      createSearchToolDefinition(this.searchToolName),
      createExecuteToolDefinition(this.executeToolName, this.namespace),
    ];
  }

  /**
   * Handle an MCP tool call.
   */
  async callTool(
    toolName: string,
    args: { code: string },
  ): Promise<ToolCallResult> {
    if (toolName === this.searchToolName) {
      return this.search(args.code);
    }
    if (toolName === this.executeToolName) {
      return this.execute(args.code);
    }
    return {
      content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
      isError: true,
    };
  }

  /**
   * Execute a search against the OpenAPI spec.
   * The code runs in a sandbox with `spec` available as a global.
   */
  async search(code: string): Promise<ToolCallResult> {
    const executor = await this.getExecutor();
    const spec = await this.resolveSpec();

    const result = await executor.execute(code, { spec });

    return formatResult(result);
  }

  /**
   * Execute API calls in the sandbox.
   * The code runs with `{namespace}.request()` available as a global.
   */
  async execute(code: string): Promise<ToolCallResult> {
    const executor = await this.getExecutor();

    const client = {
      request: this.requestBridge,
    };

    const result = await executor.execute(code, {
      [this.namespace]: client,
    });

    return formatResult(result);
  }

  /**
   * Clean up sandbox resources.
   */
  dispose(): void {
    this.executor?.dispose?.();
  }

  private async resolveSpec(): Promise<OpenAPISpec> {
    if (typeof this.specProvider === "function") {
      return await this.specProvider();
    }
    return this.specProvider;
  }

  private async getExecutor(): Promise<Executor> {
    if (this.executor) return this.executor;

    // Lazy-init with deduplication
    if (!this.executorPromise) {
      this.executorPromise = createExecutor(this.options.sandbox).then(
        (executor) => {
          this.executor = executor;
          return executor;
        },
      );
    }
    return this.executorPromise;
  }
}

function formatResult(result: {
  result: unknown;
  error?: string;
  logs: string[];
}): ToolCallResult {
  if (result.error) {
    const parts: string[] = [];
    if (result.logs.length > 0) {
      parts.push(`Console output:\n${result.logs.join("\n")}`);
    }
    parts.push(`Error: ${result.error}`);
    return {
      content: [{ type: "text", text: parts.join("\n\n") }],
      isError: true,
    };
  }

  const parts: string[] = [];
  if (result.logs.length > 0) {
    parts.push(`Console output:\n${result.logs.join("\n")}`);
  }

  const resultText =
    typeof result.result === "string"
      ? result.result
      : JSON.stringify(result.result, null, 2);
  parts.push(resultText);

  return {
    content: [{ type: "text", text: parts.join("\n\n") }],
  };
}
