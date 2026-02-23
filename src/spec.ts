import type { OpenAPISpec } from "./types.js";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

/**
 * Recursively resolve all `$ref` pointers in an OpenAPI spec inline.
 * Circular references are replaced with `{ $circular: ref }`.
 */
export function resolveRefs(
  obj: unknown,
  root: Record<string, unknown>,
  seen = new Set<string>(),
): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj))
    return obj.map((item) => resolveRefs(item, root, seen));

  const record = obj as Record<string, unknown>;

  if ("$ref" in record && typeof record.$ref === "string") {
    const ref = record.$ref;
    if (seen.has(ref)) return { $circular: ref };
    seen.add(ref);

    const parts = ref.replace("#/", "").split("/");
    let resolved: unknown = root;
    for (const part of parts) {
      resolved = (resolved as Record<string, unknown>)?.[part];
    }
    return resolveRefs(resolved, root, seen);
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = resolveRefs(value, root, seen);
  }
  return result;
}

interface OperationObject {
  summary?: string;
  description?: string;
  tags?: string[];
  operationId?: string;
  parameters?: unknown;
  requestBody?: unknown;
  responses?: unknown;
}

/**
 * Extract the base path from the first server URL in the spec.
 * e.g. "https://petstore.io/api/v3" → "/api/v3"
 * e.g. "/api/v3" → "/api/v3"
 * e.g. "https://api.example.com" → ""
 */
export function extractServerBasePath(spec: OpenAPISpec): string {
  const servers = (spec as Record<string, unknown>).servers as
    | Array<{ url: string }>
    | undefined;
  if (!servers?.length) return "";

  const url = servers[0].url;
  try {
    // Full URL like "https://petstore.io/api/v3"
    const parsed = new URL(url);
    return parsed.pathname.replace(/\/+$/, "");
  } catch {
    // Relative path like "/api/v3"
    return url.replace(/\/+$/, "");
  }
}

/**
 * Process an OpenAPI spec into a simplified format for the search tool.
 * Resolves all $refs inline and extracts only the fields needed for search.
 * Prepends the server base path to all path keys so they're directly usable.
 * Preserves info and components.schemas alongside processed paths.
 */
export function processSpec(spec: OpenAPISpec): Record<string, unknown> {
  const rawPaths = (spec.paths ?? {}) as Record<
    string,
    Record<string, OperationObject>
  >;
  const basePath = extractServerBasePath(spec);
  const paths: Record<string, Record<string, unknown>> = {};

  for (const [path, pathItem] of Object.entries(rawPaths)) {
    if (!pathItem) continue;
    const fullPath = basePath ? basePath + path : path;
    paths[fullPath] = {};

    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (op) {
        paths[fullPath][method] = {
          summary: op.summary,
          description: op.description,
          tags: op.tags,
          operationId: op.operationId,
          parameters: resolveRefs(
            op.parameters,
            spec as Record<string, unknown>,
          ),
          requestBody: resolveRefs(
            op.requestBody,
            spec as Record<string, unknown>,
          ),
          responses: resolveRefs(
            op.responses,
            spec as Record<string, unknown>,
          ),
        };
      }
    }
  }

  const result: Record<string, unknown> = { paths };

  if (spec.info) result.info = spec.info;
  // servers is omitted — the base path is already prepended to all path keys
  if ((spec as Record<string, unknown>).components) {
    result.components = resolveRefs(
      (spec as Record<string, unknown>).components,
      spec as Record<string, unknown>,
    );
  }

  return result;
}

/**
 * Extract unique tags from the spec, sorted by frequency (most common first).
 */
export function extractTags(spec: OpenAPISpec): string[] {
  const rawPaths = spec.paths as
    | Record<string, Record<string, OperationObject>>
    | undefined;
  if (!rawPaths) return [];

  const tags = new Map<string, number>();
  for (const pathItem of Object.values(rawPaths)) {
    if (!pathItem) continue;
    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (op?.tags) {
        for (const tag of op.tags) {
          tags.set(tag, (tags.get(tag) ?? 0) + 1);
        }
      }
    }
  }

  return [...tags.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}
