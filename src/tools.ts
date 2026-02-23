import type { ToolDefinition } from "./types.js";

export function createSearchToolDefinition(toolName: string): ToolDefinition {
  return {
    name: toolName,
    description: `Search the API specification to discover available endpoints.

Write an async JavaScript arrow function that filters and explores the \`spec\` object (an OpenAPI 3.x document). The full spec is available as a global variable.

Common patterns:
- Find endpoints by path: \`spec.paths\` is an object keyed by path string
- Each path has HTTP methods (get, post, put, delete, patch) as keys
- Each operation has: summary, description, parameters, requestBody, responses
- Use spec.components.schemas for data models

Examples:
  // Find all cluster-related endpoints
  async () => {
    return Object.entries(spec.paths)
      .filter(([p]) => p.includes('/clusters'))
      .flatMap(([path, methods]) =>
        Object.entries(methods)
          .filter(([m]) => ['get','post','put','delete','patch'].includes(m))
          .map(([method, op]) => ({
            method: method.toUpperCase(), path, summary: op.summary
          }))
      );
  }

  // Get the schema for a specific model
  async () => {
    return spec.components?.schemas?.Product;
  }

Return the matching endpoints/schemas as a structured result the agent can use to plan execute() calls.`,
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description:
            "An async JavaScript arrow function that searches the `spec` object. Must return a value.",
        },
      },
      required: ["code"],
    },
  };
}

export function createExecuteToolDefinition(
  toolName: string,
  namespace: string,
): ToolDefinition {
  return {
    name: toolName,
    description: `Execute API calls by writing JavaScript code.

Write an async JavaScript arrow function that uses \`${namespace}.request()\` to make API calls. The request function handles authentication automatically.

\`${namespace}.request(options)\` takes:
  - method: HTTP method string ("GET", "POST", "PUT", "DELETE", "PATCH")
  - path: API path string (e.g. "/v1/clusters")
  - query: optional object of query parameters
  - body: optional request body (will be JSON-serialized)
  - headers: optional object of additional headers

Returns: { status: number, headers: object, body: unknown }

Examples:
  // List resources
  async () => {
    const res = await ${namespace}.request({ method: "GET", path: "/v1/clusters" });
    return res.body;
  }

  // Create a resource
  async () => {
    return ${namespace}.request({
      method: "POST",
      path: "/v1/products",
      body: { name: "My Product", chart: "nginx" }
    });
  }

  // Chain multiple calls
  async () => {
    const clusters = await ${namespace}.request({ method: "GET", path: "/v1/clusters" });
    const details = await Promise.all(
      clusters.body.map(c =>
        ${namespace}.request({ method: "GET", path: \`/v1/clusters/\${c.id}\` })
      )
    );
    return details.map(d => d.body);
  }

Write clean, focused code. Return the data the user needs.`,
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: `An async JavaScript arrow function that uses \`${namespace}.request()\` to make API calls.`,
        },
      },
      required: ["code"],
    },
  };
}
