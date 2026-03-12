import type { ApprovalStore } from "../approvals.js";
import { ApprovalRequiredError } from "../errors.js";
import type { Policy, PolicyRule } from "./types.js";

/**
 * Convert a glob-style pattern to a RegExp.
 * Supports:
 * - `*`  — matches any single path segment (no slashes)
 * - `**` — matches any suffix (including slashes)
 */
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // escape regex specials (not * ?)
    .replace(/\*\*/g, "__DOUBLE_STAR__")
    .replace(/\*/g, "[^/]*")
    .replace(/__DOUBLE_STAR__/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

/**
 * Find the first matching rule for a given method + path pair.
 */
function findMatchingRule(
  rules: PolicyRule[],
  method: string,
  path: string,
): PolicyRule | undefined {
  const upperMethod = method.toUpperCase();
  for (const rule of rules) {
    const methodMatches =
      rule.method === "*" || rule.method.toUpperCase() === upperMethod;
    if (!methodMatches) continue;

    const pathRegex = patternToRegex(rule.path);
    if (pathRegex.test(path)) {
      return rule;
    }
  }
  return undefined;
}

/**
 * Options for constructing a PolicyEngine.
 */
export interface PolicyEngineOptions {
  /** Policies to evaluate in order. First matching rule across all policies wins. */
  policies: Policy[];
  /** Optional approval store — required to support `action: "approval"` rules. */
  approvalStore?: ApprovalStore;
  /** Base URL used to construct approvalUrl in ApprovalRequiredError. */
  approvalBaseUrl?: string;
}

/**
 * PolicyEngine evaluates request policies and enforces allow/deny/approval rules.
 */
export class PolicyEngine {
  private policies: Policy[];
  private approvalStore: ApprovalStore | undefined;
  private approvalBaseUrl: string;

  constructor(options: PolicyEngineOptions) {
    this.policies = options.policies;
    this.approvalStore = options.approvalStore;
    this.approvalBaseUrl = options.approvalBaseUrl ?? "http://localhost";
  }

  /**
   * Evaluate a request against all policies.
   *
   * - "allow" → returns normally
   * - "deny"  → throws Error
   * - "approval" → checks ApprovalStore; if approved passes through; if not, creates pending approval and throws ApprovalRequiredError
   *
   * If no rule matches, the request is allowed by default.
   */
  evaluate(params: {
    namespace: string;
    method: string;
    path: string;
  }): void {
    const { namespace, method, path } = params;

    let matchedRule: PolicyRule | undefined;

    for (const policy of this.policies) {
      const rule = findMatchingRule(policy.rules, method, path);
      if (rule) {
        matchedRule = rule;
        break;
      }
    }

    if (!matchedRule) {
      // Default: allow
      return;
    }

    if (matchedRule.action === "allow") {
      return;
    }

    if (matchedRule.action === "deny") {
      const msg = matchedRule.message
        ? `Request denied: ${matchedRule.message}`
        : `Request denied: ${method} ${path} is not allowed.`;
      throw new Error(msg);
    }

    if (matchedRule.action === "approval") {
      if (!this.approvalStore) {
        throw new Error(
          "Policy requires approval but no ApprovalStore is configured.",
        );
      }

      // Check if already approved
      if (
        this.approvalStore.isApproved({ namespace, method, path, rule: matchedRule })
      ) {
        return;
      }

      // Create a pending approval record
      const approval = this.approvalStore.create({
        namespace,
        method,
        path,
        rule: matchedRule,
      });

      const approvalUrl = `${this.approvalBaseUrl}/v1/approvals/${approval.id}/approve`;

      throw new ApprovalRequiredError({
        namespace,
        method,
        path,
        rule: matchedRule,
        approvalId: approval.id,
        approvalUrl,
      });
    }
  }
}
