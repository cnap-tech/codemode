import { describe, expect, it, vi } from "vitest";
import { ApprovalStore } from "../src/approvals.js";
import { ApprovalRequiredError } from "../src/errors.js";
import { PolicyEngine } from "../src/policy/engine.js";
import type { Policy } from "../src/policy/types.js";

// ── ApprovalStore ─────────────────────────────────────────────────────────────

describe("ApprovalStore", () => {
  const rule = { method: "POST", path: "/v1/clusters", action: "approval" as const, message: "Requires admin approval" };

  it("creates a pending approval", () => {
    const store = new ApprovalStore();
    const approval = store.create({ namespace: "k8s", method: "POST", path: "/v1/clusters", rule });
    expect(approval.id).toBeTruthy();
    expect(approval.status).toBe("pending");
    expect(approval.namespace).toBe("k8s");
    expect(approval.method).toBe("POST");
    expect(approval.path).toBe("/v1/clusters");
    expect(approval.rule).toBe(rule);
  });

  it("get returns the created approval", () => {
    const store = new ApprovalStore();
    const a = store.create({ namespace: "k8s", method: "POST", path: "/v1/clusters", rule });
    expect(store.get(a.id)).toBe(a);
  });

  it("get returns undefined for unknown id", () => {
    const store = new ApprovalStore();
    expect(store.get("nonexistent")).toBeUndefined();
  });

  it("list returns all approvals", () => {
    const store = new ApprovalStore();
    store.create({ namespace: "k8s", method: "POST", path: "/v1/clusters", rule });
    store.create({ namespace: "k8s", method: "DELETE", path: "/v1/clusters/abc", rule });
    expect(store.list()).toHaveLength(2);
  });

  it("approve transitions status to approved", () => {
    const store = new ApprovalStore();
    const a = store.create({ namespace: "k8s", method: "POST", path: "/v1/clusters", rule });
    const approved = store.approve(a.id);
    expect(approved?.status).toBe("approved");
    expect(approved?.resolvedAt).toBeDefined();
  });

  it("approve returns undefined for already-approved approval", () => {
    const store = new ApprovalStore();
    const a = store.create({ namespace: "k8s", method: "POST", path: "/v1/clusters", rule });
    store.approve(a.id);
    expect(store.approve(a.id)).toBeUndefined();
  });

  it("deny transitions status to denied", () => {
    const store = new ApprovalStore();
    const a = store.create({ namespace: "k8s", method: "POST", path: "/v1/clusters", rule });
    const denied = store.deny(a.id);
    expect(denied?.status).toBe("denied");
    expect(denied?.resolvedAt).toBeDefined();
  });

  it("deny returns undefined for already-denied approval", () => {
    const store = new ApprovalStore();
    const a = store.create({ namespace: "k8s", method: "POST", path: "/v1/clusters", rule });
    store.deny(a.id);
    expect(store.deny(a.id)).toBeUndefined();
  });

  describe("isApproved", () => {
    it("returns false when no approval exists", () => {
      const store = new ApprovalStore();
      expect(store.isApproved({ namespace: "k8s", method: "POST", path: "/v1/clusters", rule })).toBe(false);
    });

    it("returns false when approval is still pending", () => {
      const store = new ApprovalStore();
      store.create({ namespace: "k8s", method: "POST", path: "/v1/clusters", rule });
      expect(store.isApproved({ namespace: "k8s", method: "POST", path: "/v1/clusters", rule })).toBe(false);
    });

    it("returns true when approval is approved and within TTL", () => {
      const store = new ApprovalStore(3600_000);
      const a = store.create({ namespace: "k8s", method: "POST", path: "/v1/clusters", rule });
      store.approve(a.id);
      expect(store.isApproved({ namespace: "k8s", method: "POST", path: "/v1/clusters", rule })).toBe(true);
    });

    it("returns false when approval is approved but TTL has expired", () => {
      vi.useFakeTimers();
      const store = new ApprovalStore(1000); // 1 second TTL
      const a = store.create({ namespace: "k8s", method: "POST", path: "/v1/clusters", rule });
      store.approve(a.id);

      // Advance time past TTL
      vi.advanceTimersByTime(2000);

      expect(store.isApproved({ namespace: "k8s", method: "POST", path: "/v1/clusters", rule })).toBe(false);
      vi.useRealTimers();
    });

    it("returns false when approval is denied", () => {
      const store = new ApprovalStore();
      const a = store.create({ namespace: "k8s", method: "POST", path: "/v1/clusters", rule });
      store.deny(a.id);
      expect(store.isApproved({ namespace: "k8s", method: "POST", path: "/v1/clusters", rule })).toBe(false);
    });

    it("does not match different namespace", () => {
      const store = new ApprovalStore();
      const a = store.create({ namespace: "k8s", method: "POST", path: "/v1/clusters", rule });
      store.approve(a.id);
      expect(store.isApproved({ namespace: "other", method: "POST", path: "/v1/clusters", rule })).toBe(false);
    });

    it("does not match different method", () => {
      const store = new ApprovalStore();
      const a = store.create({ namespace: "k8s", method: "POST", path: "/v1/clusters", rule });
      store.approve(a.id);
      expect(store.isApproved({ namespace: "k8s", method: "DELETE", path: "/v1/clusters", rule })).toBe(false);
    });

    it("does not match different path", () => {
      const store = new ApprovalStore();
      const a = store.create({ namespace: "k8s", method: "POST", path: "/v1/clusters", rule });
      store.approve(a.id);
      expect(store.isApproved({ namespace: "k8s", method: "POST", path: "/v1/nodes", rule })).toBe(false);
    });
  });
});

// ── ApprovalRequiredError ─────────────────────────────────────────────────────

describe("ApprovalRequiredError", () => {
  const rule = { method: "POST", path: "/v1/clusters", action: "approval" as const, message: "Requires admin approval" };

  it("has correct code", () => {
    const err = new ApprovalRequiredError({
      namespace: "k8s",
      method: "POST",
      path: "/v1/clusters",
      rule,
      approvalId: "abc-123",
    });
    expect(err.code).toBe("APPROVAL_REQUIRED");
  });

  it("contains namespace, method, path in message", () => {
    const err = new ApprovalRequiredError({
      namespace: "k8s",
      method: "POST",
      path: "/v1/clusters",
      rule,
      approvalId: "abc-123",
    });
    expect(err.message).toContain("POST");
    expect(err.message).toContain("/v1/clusters");
    expect(err.message).toContain('"k8s"');
  });

  it("includes rule message when present", () => {
    const err = new ApprovalRequiredError({
      namespace: "k8s",
      method: "POST",
      path: "/v1/clusters",
      rule,
      approvalId: "abc-123",
    });
    expect(err.message).toContain("Requires admin approval");
  });

  it("includes approvalUrl when provided", () => {
    const err = new ApprovalRequiredError({
      namespace: "k8s",
      method: "POST",
      path: "/v1/clusters",
      rule,
      approvalId: "abc-123",
      approvalUrl: "http://localhost/v1/approvals/abc-123/approve",
    });
    expect(err.message).toContain("http://localhost/v1/approvals/abc-123/approve");
  });

  it("includes retry instruction", () => {
    const err = new ApprovalRequiredError({
      namespace: "k8s",
      method: "POST",
      path: "/v1/clusters",
      rule,
      approvalId: "abc-123",
    });
    expect(err.message).toContain("retry the same request");
  });

  it("is an instance of Error", () => {
    const err = new ApprovalRequiredError({
      namespace: "k8s",
      method: "POST",
      path: "/v1/clusters",
      rule,
      approvalId: "abc-123",
    });
    expect(err).toBeInstanceOf(Error);
  });

  it("stores all fields", () => {
    const err = new ApprovalRequiredError({
      namespace: "k8s",
      method: "POST",
      path: "/v1/clusters",
      rule,
      approvalId: "abc-123",
      approvalUrl: "http://localhost/v1/approvals/abc-123/approve",
    });
    expect(err.namespace).toBe("k8s");
    expect(err.method).toBe("POST");
    expect(err.path).toBe("/v1/clusters");
    expect(err.rule).toBe(rule);
    expect(err.approvalId).toBe("abc-123");
    expect(err.approvalUrl).toBe("http://localhost/v1/approvals/abc-123/approve");
  });
});

// ── PolicyEngine ──────────────────────────────────────────────────────────────

describe("PolicyEngine", () => {
  const approvalRule = {
    method: "POST",
    path: "/v1/clusters",
    action: "approval" as const,
    message: "Requires admin approval",
  };

  const denyRule = {
    method: "DELETE",
    path: "/v1/clusters/**",
    action: "deny" as const,
    message: "Deletions are not allowed",
  };

  const allowRule = {
    method: "GET",
    path: "/v1/**",
    action: "allow" as const,
  };

  const policy: Policy = {
    id: "test-policy",
    name: "Test Policy",
    rules: [approvalRule, denyRule, allowRule],
  };

  it("allows requests when no rule matches (default allow)", () => {
    const engine = new PolicyEngine({ policies: [policy] });
    expect(() => engine.evaluate({ namespace: "k8s", method: "PATCH", path: "/v1/other" })).not.toThrow();
  });

  it("allows requests matching an allow rule", () => {
    const engine = new PolicyEngine({ policies: [policy] });
    expect(() => engine.evaluate({ namespace: "k8s", method: "GET", path: "/v1/clusters" })).not.toThrow();
  });

  it("throws Error for deny rules", () => {
    const engine = new PolicyEngine({ policies: [policy] });
    expect(() => engine.evaluate({ namespace: "k8s", method: "DELETE", path: "/v1/clusters/abc" })).toThrow("Deletions are not allowed");
  });

  it("throws ApprovalRequiredError when approval rule matches and no store", () => {
    const engine = new PolicyEngine({ policies: [policy] });
    expect(() => engine.evaluate({ namespace: "k8s", method: "POST", path: "/v1/clusters" })).toThrow(
      "Policy requires approval but no ApprovalStore is configured.",
    );
  });

  it("throws ApprovalRequiredError when approval rule matches (with store, no approval yet)", () => {
    const store = new ApprovalStore();
    const engine = new PolicyEngine({ policies: [policy], approvalStore: store });

    expect(() => engine.evaluate({ namespace: "k8s", method: "POST", path: "/v1/clusters" })).toThrow(
      ApprovalRequiredError,
    );
  });

  it("creates a pending approval in store when throwing ApprovalRequiredError", () => {
    const store = new ApprovalStore();
    const engine = new PolicyEngine({ policies: [policy], approvalStore: store });

    try {
      engine.evaluate({ namespace: "k8s", method: "POST", path: "/v1/clusters" });
    } catch {
      // expected
    }

    const approvals = store.list();
    expect(approvals).toHaveLength(1);
    expect(approvals[0]?.status).toBe("pending");
    expect(approvals[0]?.method).toBe("POST");
    expect(approvals[0]?.path).toBe("/v1/clusters");
  });

  it("ApprovalRequiredError contains approvalUrl", () => {
    const store = new ApprovalStore();
    const engine = new PolicyEngine({
      policies: [policy],
      approvalStore: store,
      approvalBaseUrl: "http://platform.example.com",
    });

    let caught: ApprovalRequiredError | undefined;
    try {
      engine.evaluate({ namespace: "k8s", method: "POST", path: "/v1/clusters" });
    } catch (err) {
      if (err instanceof ApprovalRequiredError) caught = err;
    }

    expect(caught).toBeDefined();
    expect(caught?.approvalUrl).toContain("http://platform.example.com/v1/approvals/");
    expect(caught?.approvalUrl).toContain("/approve");
  });

  it("allows request after approval is granted (retry scenario)", () => {
    const store = new ApprovalStore();
    const engine = new PolicyEngine({ policies: [policy], approvalStore: store });

    // First call — should throw
    let approvalId: string | undefined;
    try {
      engine.evaluate({ namespace: "k8s", method: "POST", path: "/v1/clusters" });
    } catch (err) {
      if (err instanceof ApprovalRequiredError) {
        approvalId = err.approvalId;
      }
    }

    expect(approvalId).toBeDefined();

    // Approve it
    store.approve(approvalId!);

    // Retry — should pass through
    expect(() => engine.evaluate({ namespace: "k8s", method: "POST", path: "/v1/clusters" })).not.toThrow();
  });

  it("does not allow request from a different namespace after approval", () => {
    const store = new ApprovalStore();
    const engine = new PolicyEngine({ policies: [policy], approvalStore: store });

    // First call for namespace "k8s"
    let approvalId: string | undefined;
    try {
      engine.evaluate({ namespace: "k8s", method: "POST", path: "/v1/clusters" });
    } catch (err) {
      if (err instanceof ApprovalRequiredError) approvalId = err.approvalId;
    }

    store.approve(approvalId!);

    // Different namespace — should still require approval
    expect(() => engine.evaluate({ namespace: "other", method: "POST", path: "/v1/clusters" })).toThrow(
      ApprovalRequiredError,
    );
  });

  describe("path pattern matching", () => {
    it("matches wildcard * in path", () => {
      const p: Policy = {
        id: "p",
        name: "P",
        rules: [{ method: "DELETE", path: "/v1/clusters/*", action: "deny" }],
      };
      const engine = new PolicyEngine({ policies: [p] });
      expect(() => engine.evaluate({ namespace: "k8s", method: "DELETE", path: "/v1/clusters/my-cluster" })).toThrow();
      expect(() => engine.evaluate({ namespace: "k8s", method: "DELETE", path: "/v1/clusters/a/b" })).not.toThrow();
    });

    it("matches double wildcard ** in path", () => {
      const p: Policy = {
        id: "p",
        name: "P",
        rules: [{ method: "DELETE", path: "/v1/**", action: "deny" }],
      };
      const engine = new PolicyEngine({ policies: [p] });
      expect(() => engine.evaluate({ namespace: "k8s", method: "DELETE", path: "/v1/clusters/abc" })).toThrow();
      expect(() => engine.evaluate({ namespace: "k8s", method: "DELETE", path: "/v1/nodes" })).toThrow();
    });

    it("matches wildcard method *", () => {
      const p: Policy = {
        id: "p",
        name: "P",
        rules: [{ method: "*", path: "/admin/**", action: "deny" }],
      };
      const engine = new PolicyEngine({ policies: [p] });
      expect(() => engine.evaluate({ namespace: "k8s", method: "GET", path: "/admin/settings" })).toThrow();
      expect(() => engine.evaluate({ namespace: "k8s", method: "POST", path: "/admin/users" })).toThrow();
    });
  });
});
