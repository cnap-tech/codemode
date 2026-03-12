import { Hono } from "hono";
import type { ApprovalStore } from "../approvals.js";

/**
 * Options for creating the platform API router.
 */
export interface PlatformApiOptions {
  approvalStore?: ApprovalStore;
}

/**
 * Create the platform REST API Hono app.
 *
 * Routes:
 *   GET  /v1/approvals                 — list all approvals
 *   POST /v1/approvals/:id/approve     — approve a pending approval
 *   POST /v1/approvals/:id/deny        — deny a pending approval
 */
export function createPlatformApi(options: PlatformApiOptions = {}): Hono {
  const app = new Hono();

  // ── Approvals ───────────────────────────────────────────────────────────────

  app.get("/v1/approvals", (c) => {
    const store = options.approvalStore;
    if (!store) {
      return c.json({ error: "Approval store not configured" }, 503);
    }
    return c.json({ approvals: store.list() });
  });

  app.post("/v1/approvals/:id/approve", (c) => {
    const store = options.approvalStore;
    if (!store) {
      return c.json({ error: "Approval store not configured" }, 503);
    }
    const id = c.req.param("id");
    const approval = store.approve(id);
    if (!approval) {
      return c.json({ error: `Approval ${id} not found or not pending` }, 404);
    }
    return c.json({ approval });
  });

  app.post("/v1/approvals/:id/deny", (c) => {
    const store = options.approvalStore;
    if (!store) {
      return c.json({ error: "Approval store not configured" }, 503);
    }
    const id = c.req.param("id");
    const approval = store.deny(id);
    if (!approval) {
      return c.json({ error: `Approval ${id} not found or not pending` }, 404);
    }
    return c.json({ approval });
  });

  return app;
}
