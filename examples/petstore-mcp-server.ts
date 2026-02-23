/**
 * Petstore MCP Server — connect to Claude Desktop or any MCP client.
 *
 * This is a minimal example of wiring CodeMode into a proper MCP server.
 * It fetches the real Petstore OpenAPI spec and proxies requests to a
 * local Hono mock (swap with `fetch` + real baseUrl to hit a live API).
 *
 * Run:
 *   pnpm tsx examples/petstore-mcp-server.ts
 *   # or: task example:mcp
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CodeMode } from "@robinbraemer/codemode";
import { registerTools } from "@robinbraemer/codemode/mcp";
import { Hono } from "hono";

// ── Simple Petstore mock ────────────────────────────────────────────

const pets = new Map<number, Record<string, unknown>>([
  [1, { id: 1, name: "Rex", status: "available", category: { id: 1, name: "Dogs" }, photoUrls: [], tags: [] }],
  [2, { id: 2, name: "Whiskers", status: "available", category: { id: 2, name: "Cats" }, photoUrls: [], tags: [] }],
]);
let nextId = 100;

const app = new Hono();
app.get("/api/v3/pet/findByStatus", (c) => {
  const status = c.req.query("status") ?? "available";
  return c.json([...pets.values()].filter((p) => p.status === status));
});
app.get("/api/v3/pet/:petId", (c) => {
  const pet = pets.get(Number(c.req.param("petId")));
  return pet ? c.json(pet) : c.json({ message: "Pet not found" }, 404);
});
app.post("/api/v3/pet", async (c) => {
  const body = await c.req.json();
  const id = body.id ?? nextId++;
  const pet = { id, ...body };
  pets.set(id, pet);
  return c.json(pet, 201);
});
app.get("/api/v3/store/inventory", (c) => {
  const counts: Record<string, number> = {};
  for (const p of pets.values()) counts[p.status as string] = (counts[p.status as string] ?? 0) + 1;
  return c.json(counts);
});

// ── CodeMode + MCP ──────────────────────────────────────────────────

const SPEC_URL = "https://petstore3.swagger.io/api/v3/openapi.json";

const codemode = new CodeMode({
  spec: async () => {
    const res = await fetch(SPEC_URL);
    return res.json();
  },
  request: app.request.bind(app),
  baseUrl: "http://localhost",
  namespace: "petstore",
});

const server = new McpServer({
  name: "petstore",
  version: "1.0.0",
});

registerTools(codemode, server);

const transport = new StdioServerTransport();
await server.connect(transport);
