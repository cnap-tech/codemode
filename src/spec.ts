import type { OpenAPISpec } from "./types.js";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

const DEFAULT_MAX_REF_DEPTH = 50;

/** Keys that must never be traversed or copied during $ref resolution. */
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Recursively resolve all `$ref` pointers in an OpenAPI spec inline.
 * Circular references are replaced with `{ $circular: ref }`.
 *
 * The `seen` set tracks the current ancestor chain only (not globally),
 * so the same $ref used in sibling positions resolves correctly.
 * A memoization cache avoids re-resolving the same $ref multiple times.
 *
 * @param maxDepth - Maximum $ref resolution depth (default: 50)
 */
export function resolveRefs(
  obj: unknown,
  root: Record<string, unknown>,
  seen = new Set<string>(),
  maxDepth = DEFAULT_MAX_REF_DEPTH,
  _cache = new Map<string, unknown>(),
): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj))
    return obj.map((item) => resolveRefs(item, root, seen, maxDepth, _cache));

  const record = obj as Record<string, unknown>;

  if ("$ref" in record && typeof record.$ref === "string") {
    const ref = record.$ref;

    // Circular: this $ref is already in the current ancestor chain
    if (seen.has(ref)) return { $circular: ref };

    // Depth limit
    if (seen.size >= maxDepth) {
      return { $circular: ref, $reason: "max depth exceeded" };
    }

    // Memoization: return cached result if available
    if (_cache.has(ref)) return _cache.get(ref);

    const parts = ref.replace("#/", "").split("/");
    let resolved: unknown = root;
    for (const part of parts) {
      if (DANGEROUS_KEYS.has(part)) return { $ref: ref, $error: "unsafe ref path" };
      resolved = (resolved as Record<string, unknown>)?.[part];
    }

    // Clone seen for this branch so siblings don't share state
    const branchSeen = new Set(seen);
    branchSeen.add(ref);

    const result = resolveRefs(resolved, root, branchSeen, maxDepth, _cache);
    _cache.set(ref, result);
    return result;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    result[key] = resolveRefs(value, root, seen, maxDepth, _cache);
  }
  return result;
}

interface OperationObject {
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: unknown;
  requestBody?: unknown;
  responses?: Record<string, unknown>;
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

  const url = servers[0]!.url;
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
 * Only paths are returned — info and components are omitted since refs are resolved inline.
 *
 * @param maxRefDepth - Maximum $ref resolution depth (default: 50)
 */
export function processSpec(
  spec: OpenAPISpec,
  maxRefDepth = DEFAULT_MAX_REF_DEPTH,
): Record<string, unknown> {
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
        // Only keep success responses (2xx) — error schemas are redundant noise
        const successResponses: Record<string, unknown> = {};
        if (op.responses) {
          for (const [status, resp] of Object.entries(op.responses)) {
            if (status.startsWith("2") || status === "default") {
              successResponses[status] = resp;
            }
          }
        }

        paths[fullPath][method] = {
          summary: op.summary,
          description: op.description,
          tags: op.tags,
          parameters: resolveRefs(
            op.parameters,
            spec as Record<string, unknown>,
            undefined,
            maxRefDepth,
          ),
          requestBody: resolveRefs(
            op.requestBody,
            spec as Record<string, unknown>,
            undefined,
            maxRefDepth,
          ),
          responses: resolveRefs(
            Object.keys(successResponses).length > 0 ? successResponses : op.responses,
            spec as Record<string, unknown>,
            undefined,
            maxRefDepth,
          ),
        };
      }
    }
  }

  // Only paths — info and components are omitted since all $refs are resolved inline.
  return { paths };
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

  return [...tags.entries()].toSorted((a, b) => b[1] - a[1]).map(([t]) => t);
}
