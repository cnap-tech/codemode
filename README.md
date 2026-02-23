# codemode

Two MCP tools that replace hundreds. Give an AI agent your OpenAPI spec and a request handler — it discovers and calls your entire API by writing JavaScript in a sandboxed runtime.

Instead of defining individual MCP tools for every API endpoint (`list-pods`, `create-product`, `get-logs`, ...), CodeMode exposes just **two tools**:

- **`search`** — the agent writes JS to filter your OpenAPI spec and discover endpoints
- **`execute`** — the agent writes JS to call your API via an injected client

This is the same pattern [Cloudflare uses](https://blog.cloudflare.com/code-mode-mcp/) to expose 2,500+ API endpoints through just two MCP tools, reducing context window usage by 99.9%.

## Try It

Requires [mise](https://mise.jdx.dev/) for tooling (Node.js, pnpm, Task):

```bash
git clone https://github.com/cnap-tech/codemode.git
cd codemode
mise install   # installs Node 24, pnpm 10, Task
task install   # installs dependencies
task example   # runs the Petstore demo
```

Fetches the real Petstore OpenAPI spec from the web, then runs search + execute against a local Hono mock — no API keys needed.

## Install

```bash
pnpm add @robinbraemer/codemode

# Install a sandbox runtime (pick one):
pnpm add isolated-vm       # V8 isolates — fastest, recommended
pnpm add quickjs-emscripten # WASM — portable fallback
```

## Quick Start

```typescript
import { CodeMode } from '@robinbraemer/codemode';
import { Hono } from 'hono';

const app = new Hono();
app.get('/v1/clusters', (c) => c.json([{ id: '1', name: 'prod' }]));
app.post('/v1/clusters', async (c) => {
  const body = await c.req.json();
  return c.json({ id: '2', ...body }, 201);
});

const codemode = new CodeMode({
  spec: myOpenAPISpec,              // OpenAPI 3.x spec, or async getter
  request: app.request.bind(app),   // in-process, no network hop
});

// The agent searches the spec to discover endpoints...
const search = await codemode.callTool('search', {
  code: `async () => {
    return Object.entries(spec.paths)
      .filter(([p]) => p.includes('/clusters'))
      .flatMap(([path, methods]) =>
        Object.entries(methods)
          .filter(([m]) => ['get','post','put','delete'].includes(m))
          .map(([method, op]) => ({ method: method.toUpperCase(), path, summary: op.summary }))
      );
  }`
});

// ...then executes API calls
const result = await codemode.callTool('execute', {
  code: `async () => {
    const res = await api.request({ method: "GET", path: "/v1/clusters" });
    return res.body;
  }`
});
```

## MCP Server Integration

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CodeMode } from '@robinbraemer/codemode';
import { registerTools } from 'codemode/mcp';

const codemode = new CodeMode({
  spec: () => fetchOpenAPISpec(),
  request: app.request.bind(app),
});

const server = new McpServer({ name: 'my-api', version: '1.0.0' });
registerTools(codemode, server);

const transport = new StdioServerTransport();
await server.connect(transport);
```

## How It Works

```
AI Agent
  │ writes JavaScript code
  ▼
CodeMode MCP Server
  │
  ├─ search(code) → runs JS with OpenAPI spec as a global
  │   → agent discovers endpoints, schemas, parameters
  │
  └─ execute(code) → runs JS with injected request client
      → api.request() calls your handler in-process
      → no network hop, auth handled automatically
```

All code runs in an isolated sandbox (V8 isolate or QuickJS WASM). The sandbox has zero I/O by default — no `require`, no `process`, no `fetch`, no filesystem. The only way to interact with the outside world is through the injected globals (`spec` for search, `{namespace}.request()` for execute).

Each tool call gets a fresh sandbox with no state carried over between calls.

## API

### `new CodeMode(options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `spec` | `OpenAPISpec \| () => OpenAPISpec \| Promise<OpenAPISpec>` | required | OpenAPI 3.x spec or async getter |
| `request` | `(input, init?) => Response` | required | Fetch-compatible handler (`app.request.bind(app)` for Hono) |
| `namespace` | `string` | `"api"` | Client name in sandbox (`api.request(...)`) |
| `baseUrl` | `string` | `"http://localhost"` | Base URL for relative paths |
| `sandbox` | `{ memoryMB?, timeoutMs? }` | `{ 64, 30000 }` | Sandbox resource limits |
| `executor` | `Executor` | auto-detect | Custom sandbox executor |

### Methods

#### `codemode.tools(): ToolDefinition[]`

Returns MCP-compatible tool definitions for `search` and `execute`.

#### `codemode.callTool(name, { code }): Promise<ToolCallResult>`

Route a tool call. Returns `{ content: [{ type: "text", text }], isError? }`.

#### `codemode.search(code): Promise<ToolCallResult>`

Run search code directly (shorthand for `callTool('search', { code })`).

#### `codemode.execute(code): Promise<ToolCallResult>`

Run execute code directly (shorthand for `callTool('execute', { code })`).

#### `codemode.setToolNames(search, execute): this`

Override default tool names. Useful when running multiple CodeMode instances.

#### `codemode.dispose(): void`

Clean up sandbox resources.

## Sandbox API

### Inside `search`

The `spec` global is the full OpenAPI 3.x document:

```javascript
// Find endpoints by keyword
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

// Get a specific schema
async () => spec.components?.schemas?.Product

// Spec metadata
async () => ({
  title: spec.info.title,
  version: spec.info.version,
  endpoints: Object.keys(spec.paths).length,
})
```

### Inside `execute`

The `{namespace}.request()` function makes API calls through the host handler:

```javascript
// GET with query params
async () => {
  const res = await api.request({
    method: "GET",
    path: "/v1/clusters",
    query: { limit: 10 },
  });
  return res.body;
}

// POST with body
async () => {
  return api.request({
    method: "POST",
    path: "/v1/products",
    body: { name: "Redis", chart: "bitnami/redis" },
  });
}

// Chain calls
async () => {
  const list = await api.request({ method: "GET", path: "/v1/clusters" });
  const details = await Promise.all(
    list.body.map(c =>
      api.request({ method: "GET", path: `/v1/clusters/${c.id}` })
    )
  );
  return details.map(d => d.body);
}
```

**Request options:**

| Field | Type | Description |
|-------|------|-------------|
| `method` | `string` | HTTP method (`"GET"`, `"POST"`, etc.) |
| `path` | `string` | API path (`"/v1/clusters"`) |
| `query` | `Record<string, string \| number \| boolean>` | Query parameters (optional) |
| `body` | `unknown` | Request body, auto-serialized as JSON (optional) |
| `headers` | `Record<string, string>` | Additional headers (optional) |

**Response:** `{ status: number, headers: Record<string, string>, body: unknown }`

## Executors

CodeMode auto-detects your installed sandbox runtime. You can also pass one explicitly:

```typescript
import { CodeMode, IsolatedVMExecutor } from '@robinbraemer/codemode';

const codemode = new CodeMode({
  spec,
  request: handler,
  executor: new IsolatedVMExecutor({ memoryMB: 128, timeoutMs: 60_000 }),
});
```

| Executor | Package | Performance | Portability |
|----------|---------|-------------|-------------|
| `IsolatedVMExecutor` | `isolated-vm` | Native V8 speed | Node.js |
| `QuickJSExecutor` | `quickjs-emscripten` | ~3-5x slower (still fast) | Node.js, Bun, browsers |

Both are optional peer dependencies. Install at least one.

### Custom Executor

Implement the `Executor` interface to use your own sandbox:

```typescript
import { CodeMode, type Executor, type ExecuteResult } from '@robinbraemer/codemode';

class MyExecutor implements Executor {
  async execute(code: string, globals: Record<string, unknown>): Promise<ExecuteResult> {
    // `code` is an async arrow function as a string: "async () => { ... }"
    // `globals` contains named values to inject:
    //   - plain data (objects, arrays, primitives) → read-only values
    //   - functions → callable host functions
    //   - objects with function values → namespace with callable methods
    return { result: ..., logs: [] };
  }

  dispose() { /* clean up */ }
}

const codemode = new CodeMode({
  spec,
  request: handler,
  executor: new MyExecutor(),
});
```

## Token Efficiency

| Approach | Context Tokens |
|----------|---------------|
| Individual MCP tools (15-50+ tools) | ~15,000-50,000+ |
| Full OpenAPI spec in context | ~1,000,000+ |
| **CodeMode (2 tools)** | **~1,000** |

## License

MIT
