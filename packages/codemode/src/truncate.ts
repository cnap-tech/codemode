const CHARS_PER_TOKEN = 4;
const DEFAULT_MAX_TOKENS = 6_000;

/**
 * Truncate a response to fit within a token budget.
 * Uses a ~4 chars/token estimate.
 */
export function truncateResponse(
  content: unknown,
  maxTokens: number = DEFAULT_MAX_TOKENS,
): string {
  const text =
    typeof content === "string"
      ? content
      : JSON.stringify(content, null, 2);

  const maxChars = maxTokens * CHARS_PER_TOKEN;

  if (text.length <= maxChars) {
    return text;
  }

  const truncated = text.slice(0, maxChars);
  const estimatedTokens = Math.ceil(text.length / CHARS_PER_TOKEN);

  return `${truncated}\n\n--- TRUNCATED ---\nResponse was ~${estimatedTokens.toLocaleString()} tokens (limit: ${maxTokens.toLocaleString()}). Use more specific queries to reduce response size.`;
}
