# codemode

Two MCP tools that replace hundreds. Give an AI agent your OpenAPI spec and a request handler — it discovers and calls your entire API by writing JavaScript in a sandboxed runtime.

Instead of defining individual MCP tools for every API endpoint (`list-pods`, `create-product`, `get-logs`, ...), CodeMode exposes just **two tools**:

- **`search`** — the agent writes JS to filter your OpenAPI spec and discover endpoints
- **`execute`** — the agent writes JS to call your API via an injected client

This is the same pattern [Cloudflare uses](https://blog.cloudflare.com/code-mode-mcp/) to expose 2,500+ API endpoints through just two MCP tools, reducing context window usage by 99.9%.

## Install

```bash
npm install codemode

# Install a sandbox runtime (pick one):
npm install isolated-vm       # V8 isolates — fastest, Node.js only
# or
npm install quickjs-emscripten # WASM — portable, works in Node.js + Bun
```

## Quick Start

```typescript
import { CodeMode } from 'codemode';
import { Hono } from 'hono';

const app = new Hono();
app.get('/v1/clusters', (c) => c.json([{ id: '1', name: 'EU Prod' }]));
app.get('/v1/clusters/:id', (c) => c.json({ id: c.req.param('id'), name: 'EU Prod' }));

const codemode = new CodeMode({
  spec: myOpenAPISpec,              // OpenAPI 3.x spec object, or async getter
  request: app.request.bind(app),   // Hono in-process handler (no network hop)
  namespace: 'api',                 // sandbox calls: api.request(...)
});

// Get MCP tool definitions
const tools = codemode.tools();

// Handle tool calls
const result = await codemode.callTool('search', {
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

const result2 = await codemode.callTool('execute', {
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
import { CodeMode } from 'codemode';
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

## API

### `new CodeMode(options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `spec` | `object \| () => object \| Promise<object>` | **required** | OpenAPI 3.x spec or async getter |
| `request` | `(input, init?) => Response` | **required** | Fetch-compatible handler. Use `app.request.bind(app)` for Hono |
| `namespace` | `string` | `"api"` | Client name in sandbox (e.g., `api.request(...)`) |
| `baseUrl` | `string` | `"http://localhost"` | Base URL for relative paths |
| `sandbox` | `{ memoryMB?, timeoutMs? }` | `{ 64, 30000 }` | Sandbox resource limits |
| `executor` | `Executor` | auto-detect | Custom sandbox executor |

### `codemode.tools(): ToolDefinition[]`

Returns MCP tool definitions for `search` and `execute`.

### `codemode.callTool(name, { code }): Promise<ToolCallResult>`

Execute a tool call. Returns `{ content: [{ type: "text", text }], isError? }`.

### `codemode.search(code): Promise<ToolCallResult>`

Run search code directly.

### `codemode.execute(code): Promise<ToolCallResult>`

Run execute code directly.

## Sandbox API

### Inside `search` tool

```javascript
// `spec` is the full OpenAPI 3.x document
async () => {
  return Object.entries(spec.paths)
    .filter(([p]) => p.includes('/clusters'))
    .map(([path, methods]) => ({ path, methods: Object.keys(methods) }));
}
```

### Inside `execute` tool

```javascript
// `{namespace}.request(options)` makes API calls
async () => {
  const res = await api.request({
    method: "GET",
    path: "/v1/clusters",
    query: { limit: 10 },        // optional query params
    body: { name: "test" },       // optional JSON body
    headers: { "x-custom": "1" }, // optional headers
  });
  // res = { status: 200, headers: {...}, body: [...] }
  return res.body;
}
```

## Executors

CodeMode auto-detects your installed sandbox runtime. You can also choose explicitly:

```typescript
import { IsolatedVMExecutor } from 'codemode';

const codemode = new CodeMode({
  spec,
  request: handler,
  executor: new IsolatedVMExecutor({ memoryMB: 128, timeoutMs: 60_000 }),
});
```

| Executor | Package | Startup | Portability |
|----------|---------|---------|-------------|
| `IsolatedVMExecutor` | `isolated-vm` | <1ms | Node.js only |
| `QuickJSExecutor` | `quickjs-emscripten` | <1ms (after WASM load) | Node.js, Bun, browsers |

## Token Cost

| Approach | Context Tokens |
|----------|---------------|
| Individual MCP tools (15-50+ tools) | ~15,000-50,000+ |
| Full OpenAPI spec in context | ~1,000,000+ |
| **CodeMode (2 tools)** | **~1,000** |

## How It Works

```
AI Agent
  │ writes JavaScript code
  ▼
CodeMode MCP Server
  │
  ├─ search(code) → runs JS against OpenAPI spec in sandbox
  │   → agent discovers endpoints, schemas, parameters
  │
  └─ execute(code) → runs JS in sandbox with injected client
      → api.request() calls your Hono app in-process
      → no network hop, auth handled automatically
```

## License

MIT
