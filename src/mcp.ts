/**
 * MCP server integration for CodeMode.
 *
 * This module provides helpers for integrating CodeMode with
 * `@modelcontextprotocol/sdk`. Import from `codemode/mcp`.
 *
 * @example
 * ```ts
 * import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
 * import { CodeMode } from 'codemode';
 * import { registerTools } from 'codemode/mcp';
 *
 * const codemode = new CodeMode({ spec, request: app.request.bind(app) });
 * const server = new McpServer({ name: 'my-api', version: '1.0.0' });
 *
 * registerTools(codemode, server);
 * ```
 */

import type { CodeMode } from "./codemode.js";
import { z } from "zod";

/**
 * Register CodeMode's search and execute tools on an MCP server.
 *
 * Uses the `McpServer.registerTool()` API from `@modelcontextprotocol/sdk`.
 */
export function registerTools(
  codemode: CodeMode,
  server: McpServerLike,
): void {
  const toolDefs = codemode.tools();

  for (const def of toolDefs) {
    server.registerTool(
      def.name,
      {
        description: def.description,
        inputSchema: { code: z.string().describe("JavaScript code to execute") },
      },
      async (args) => {
        return codemode.callTool(def.name, { code: args.code as string });
      },
    );
  }
}

/**
 * Minimal interface for MCP server tool registration.
 * Compatible with `McpServer` from `@modelcontextprotocol/sdk`.
 */
interface McpServerLike {
  registerTool(
    name: string,
    config: {
      description?: string;
      inputSchema?: Record<string, z.ZodType>;
    },
    handler: (args: Record<string, unknown>) => Promise<unknown>,
  ): unknown;
}
