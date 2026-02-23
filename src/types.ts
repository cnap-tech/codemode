/**
 * Result from executing sandboxed code.
 */
export interface ExecuteResult {
  result: unknown;
  error?: string;
  logs: string[];
}

/**
 * Sandbox executor interface. Implement this to use a custom sandbox runtime.
 *
 * Built-in implementations:
 * - `IsolatedVMExecutor` (requires `isolated-vm` peer dependency)
 * - `QuickJSExecutor` (requires `quickjs-emscripten` peer dependency)
 */
export interface Executor {
  /**
   * Execute JavaScript code in a sandboxed environment.
   *
   * @param code - An async arrow function as a string, e.g. `async () => { ... }`
   * @param globals - Named globals to inject into the sandbox. Each value is either:
   *   - A plain object/array/primitive (injected as a frozen read-only value)
   *   - A function (injected as a callable host function)
   *   - An object with function values (injected as a namespace with callable methods)
   */
  execute(
    code: string,
    globals: Record<string, unknown>,
  ): Promise<ExecuteResult>;

  /** Clean up resources. */
  dispose?(): void;
}

/**
 * Options for configuring the sandbox executor.
 */
export interface SandboxOptions {
  /** Memory limit in MB (default: 64) */
  memoryMB?: number;
  /** Execution timeout in ms (default: 30000) */
  timeoutMs?: number;
}

/**
 * A fetch-compatible request handler.
 * Works with Hono's `app.request()`, standard `fetch`, or any function
 * that takes a Request and returns a Response.
 */
export type RequestHandler = (
  input: string | URL | Request,
  init?: RequestInit,
) => Response | Promise<Response>;

/**
 * OpenAPI specification object (JSON-parsed OpenAPI 3.x document).
 */
export type OpenAPISpec = {
  openapi?: string;
  info?: { title?: string; version?: string; description?: string };
  paths?: Record<string, unknown>;
  [key: string]: unknown;
};

/**
 * Spec provider: a static spec, a URL to fetch, or an async getter function.
 */
export type SpecProvider = OpenAPISpec | (() => OpenAPISpec | Promise<OpenAPISpec>);

/**
 * Options for creating a CodeMode instance.
 */
export interface CodeModeOptions {
  /**
   * OpenAPI spec or async getter that returns one.
   * The spec is made available inside the `search()` tool as a `spec` global.
   */
  spec: SpecProvider;

  /**
   * Fetch-compatible request handler for API calls from the `execute()` tool.
   *
   * For Hono: `app.request.bind(app)` (in-process, no network hop)
   * For standard fetch: `fetch` or any `(Request) => Response` function
   */
  request: RequestHandler;

  /**
   * Namespace for the client object inside the execute sandbox.
   * Default: `"api"`
   *
   * Example: with namespace "cnap", sandbox code calls `cnap.request(...)`.
   */
  namespace?: string;

  /**
   * Base URL prepended to relative paths in sandbox requests.
   * Default: `"http://localhost"`
   *
   * Only used when the sandbox code provides a relative path like `/v1/clusters`.
   * For Hono app.request(), any base URL works since it doesn't hit the network.
   */
  baseUrl?: string;

  /**
   * Sandbox configuration.
   */
  sandbox?: SandboxOptions;

  /**
   * Custom executor instance. If not provided, auto-detects
   * isolated-vm or quickjs-emscripten from installed peer dependencies.
   */
  executor?: Executor;
}

/**
 * MCP tool definition (compatible with @modelcontextprotocol/sdk).
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * MCP tool call result.
 */
export interface ToolCallResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}
