import type { PolicyRule } from "./policy/types.js";

export type ApprovalStatus = "pending" | "approved" | "denied";

export interface PendingApproval {
  id: string;
  namespace: string;
  method: string;
  path: string;
  rule: PolicyRule;
  requestedAt: number;
  status: ApprovalStatus;
  resolvedAt?: number;
  ttlMs: number; // approval valid for this many ms after grant
}

export class ApprovalStore {
  private approvals = new Map<string, PendingApproval>();
  private ttlMs: number;

  constructor(ttlMs = 3600_000) {
    this.ttlMs = ttlMs;
  }

  create(params: {
    namespace: string;
    method: string;
    path: string;
    rule: PolicyRule;
  }): PendingApproval {
    const approval: PendingApproval = {
      id: globalThis.crypto.randomUUID(),
      ...params,
      requestedAt: Date.now(),
      status: "pending",
      ttlMs: this.ttlMs,
    };
    this.approvals.set(approval.id, approval);
    return approval;
  }

  get(id: string): PendingApproval | undefined {
    return this.approvals.get(id);
  }

  list(): PendingApproval[] {
    return [...this.approvals.values()];
  }

  approve(id: string): PendingApproval | undefined {
    const a = this.approvals.get(id);
    if (!a || a.status !== "pending") return undefined;
    a.status = "approved";
    a.resolvedAt = Date.now();
    return a;
  }

  deny(id: string): PendingApproval | undefined {
    const a = this.approvals.get(id);
    if (!a || a.status !== "pending") return undefined;
    a.status = "denied";
    a.resolvedAt = Date.now();
    return a;
  }

  /** Returns true if there's an approved (non-expired) approval for this request */
  isApproved(params: {
    namespace: string;
    method: string;
    path: string;
    rule: PolicyRule;
  }): boolean {
    const now = Date.now();
    for (const a of this.approvals.values()) {
      if (
        a.status === "approved" &&
        a.namespace === params.namespace &&
        a.method === params.method &&
        a.path === params.path &&
        a.rule.message === params.rule.message &&
        a.resolvedAt !== undefined &&
        now - a.resolvedAt < a.ttlMs
      ) {
        return true;
      }
    }
    return false;
  }
}
