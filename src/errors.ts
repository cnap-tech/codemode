import type { PolicyRule } from "./policy/types.js";

export class CodemodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ApprovalRequiredError extends CodemodeError {
  code = "APPROVAL_REQUIRED" as const;
  namespace: string;
  method: string;
  path: string;
  rule: PolicyRule;
  approvalId: string;
  approvalUrl?: string;

  constructor(params: {
    namespace: string;
    method: string;
    path: string;
    rule: PolicyRule;
    approvalId: string;
    approvalUrl?: string;
  }) {
    const msg = [
      `APPROVAL_REQUIRED: ${params.method} ${params.path} in namespace "${params.namespace}" requires approval.`,
      params.rule.message ? `Rule: "${params.rule.message}"` : null,
      params.approvalUrl ? `Request approval at: ${params.approvalUrl}` : null,
      `After approval is granted, retry the same request.`,
    ].filter(Boolean).join("\n");
    super(msg);
    this.namespace = params.namespace;
    this.method = params.method;
    this.path = params.path;
    this.rule = params.rule;
    this.approvalId = params.approvalId;
    this.approvalUrl = params.approvalUrl;
  }
}
