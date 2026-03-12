/**
 * Policy action — what to do when a rule matches.
 */
export type PolicyAction = "allow" | "deny" | "approval";

/**
 * A single policy rule that matches requests by method/path pattern.
 */
export interface PolicyRule {
  /** HTTP method to match (case-insensitive). Use "*" to match any method. */
  method: string;
  /** Path pattern to match. Supports wildcards: "*" matches a single segment, "**" matches any suffix. */
  path: string;
  /** Action to take when this rule matches. */
  action: PolicyAction;
  /** Optional human-readable message to include in errors. */
  message?: string;
}

/**
 * A policy is a named set of rules evaluated in order.
 * The first matching rule wins. If no rule matches, the default is "allow".
 */
export interface Policy {
  /** Unique identifier for this policy. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Ordered list of rules — first match wins. */
  rules: PolicyRule[];
}
