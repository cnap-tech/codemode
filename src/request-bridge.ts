import type { RequestHandler } from "./types.js";

/**
 * Options for a sandbox request call.
 * This is what the LLM-generated code passes to `{namespace}.request()`.
 */
export interface SandboxRequestOptions {
  method: string;
  path: string;
  query?: Record<string, string | number | boolean>;
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Response returned to the sandbox from a request call.
 */
export interface SandboxResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Options for configuring the request bridge.
 */
export interface RequestBridgeOptions {
  /** Maximum number of requests per bridge instance. Default: 50. */
  maxRequests?: number;
  /** Maximum response body size in bytes. Default: 10MB. */
  maxResponseBytes?: number;
  /** Allowed headers whitelist. When undefined, uses default blocklist. */
  allowedHeaders?: string[];
}

const ALLOWED_METHODS = new Set([
  "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS",
]);

const BLOCKED_HEADER_PATTERNS = [
  /^authorization$/i,
  /^cookie$/i,
  /^host$/i,
  /^x-forwarded-/i,
  /^proxy-/i,
];

const DEFAULT_MAX_REQUESTS = 50;
const DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * Validate that a path is safe (no SSRF via absolute URL injection).
 * Rejects paths containing "://", not starting with "/", or starting with "//".
 */
function validatePath(path: string): void {
  if (path.includes("://")) {
    throw new Error(`Invalid path: must not contain "://" — got "${path}"`);
  }
  if (!path.startsWith("/")) {
    throw new Error(`Invalid path: must start with "/" — got "${path}"`);
  }
  if (path.startsWith("//")) {
    throw new Error(`Invalid path: must not start with "//" — got "${path}"`);
  }
}

/**
 * Filter headers based on allowedHeaders whitelist or default blocklist.
 */
function filterHeaders(
  headers: Record<string, string> | undefined,
  allowedHeaders: string[] | undefined,
): Record<string, string> {
  if (!headers) return {};

  if (allowedHeaders) {
    // Whitelist mode: only forward explicitly allowed headers
    const allowed = new Set(allowedHeaders.map((h) => h.toLowerCase()));
    const filtered: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (allowed.has(key.toLowerCase())) {
        filtered[key] = value;
      }
    }
    return filtered;
  }

  // Blocklist mode: strip dangerous headers
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const blocked = BLOCKED_HEADER_PATTERNS.some((p) => p.test(key));
    if (!blocked) {
      filtered[key] = value;
    }
  }
  return filtered;
}

/**
 * Creates the `request()` function that gets injected into the execute sandbox.
 * Bridges sandbox API calls to the host request handler (Hono app.request, fetch, etc.).
 */
export function createRequestBridge(
  handler: RequestHandler,
  baseUrl: string,
  options: RequestBridgeOptions = {},
): (options: SandboxRequestOptions) => Promise<SandboxResponse> {
  const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const allowedHeaders = options.allowedHeaders;

  let requestCount = 0;

  return async (opts: SandboxRequestOptions): Promise<SandboxResponse> => {
    const { method, path, query, body, headers } = opts;

    // Validate request count
    if (++requestCount > maxRequests) {
      throw new Error(
        `Request limit exceeded: max ${maxRequests} requests per execution`,
      );
    }

    // Validate HTTP method
    const upperMethod = method.toUpperCase();
    if (!ALLOWED_METHODS.has(upperMethod)) {
      throw new Error(
        `Invalid HTTP method: "${method}". Allowed: ${[...ALLOWED_METHODS].join(", ")}`,
      );
    }

    // Validate path (SSRF prevention)
    validatePath(path);

    // Build URL
    const url = new URL(path, baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, String(value));
      }
    }

    // Filter headers
    const filteredHeaders = filterHeaders(headers, allowedHeaders);

    // Build request init
    const init: RequestInit = {
      method: upperMethod,
      headers: { ...filteredHeaders },
    };

    if (body !== undefined && body !== null) {
      init.body = JSON.stringify(body);
      (init.headers as Record<string, string>)["content-type"] =
        (init.headers as Record<string, string>)["content-type"] ?? "application/json";
    }

    // Call the host handler
    const response = await handler(url.toString(), init);

    // Parse response with size limit
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const contentType = response.headers.get("content-type") ?? "";
    let responseBody: unknown;

    const text = await response.text();
    if (text.length > maxResponseBytes) {
      throw new Error(
        `Response too large: ${text.length} bytes exceeds limit of ${maxResponseBytes} bytes`,
      );
    }

    if (contentType.includes("application/json")) {
      try {
        responseBody = JSON.parse(text);
      } catch {
        responseBody = text;
      }
    } else {
      responseBody = text;
    }

    return {
      status: response.status,
      headers: responseHeaders,
      body: responseBody,
    };
  };
}
