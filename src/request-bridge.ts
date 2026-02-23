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
 * Creates the `request()` function that gets injected into the execute sandbox.
 * Bridges sandbox API calls to the host request handler (Hono app.request, fetch, etc.).
 */
export function createRequestBridge(
  handler: RequestHandler,
  baseUrl: string,
): (options: SandboxRequestOptions) => Promise<SandboxResponse> {
  return async (options: SandboxRequestOptions): Promise<SandboxResponse> => {
    const { method, path, query, body, headers } = options;

    // Build URL
    const url = new URL(path, baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, String(value));
      }
    }

    // Build request init
    const init: RequestInit = {
      method: method.toUpperCase(),
      headers: {
        ...headers,
      },
    };

    if (body !== undefined && body !== null) {
      init.body = JSON.stringify(body);
      (init.headers as Record<string, string>)["content-type"] =
        (init.headers as Record<string, string>)["content-type"] ?? "application/json";
    }

    // Call the host handler
    const response = await handler(url.toString(), init);

    // Parse response
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const contentType = response.headers.get("content-type") ?? "";
    let responseBody: unknown;
    if (contentType.includes("application/json")) {
      try {
        responseBody = await response.json();
      } catch {
        responseBody = await response.text();
      }
    } else {
      responseBody = await response.text();
    }

    return {
      status: response.status,
      headers: responseHeaders,
      body: responseBody,
    };
  };
}
