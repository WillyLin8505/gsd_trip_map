/**
 * Infer the destination city from a list of place names using Claude Haiku.
 * Pure helpers (prompt builder + reply parser) are separated from the network
 * call so they can be unit-tested without an API key.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5";

/** Build the user prompt asking for a single most-likely destination city. */
export function buildInferCityPrompt(inputs: string[]): string {
  const list = inputs.map((s) => `- ${s}`).join("\n");
  return [
    "You are given a list of attraction / restaurant / place names a traveler",
    "wants to visit. Identify the single most likely destination city (or",
    "region) they are all in.",
    "",
    "Reply with ONLY the city name, in the same language as the input.",
    'If you cannot tell, reply exactly "NONE".',
    "",
    "Places:",
    list,
  ].join("\n");
}

/** Parse the model reply into a city string, or null. */
export function parseInferredCity(replyText: string): string | null {
  const first = (replyText ?? "").split("\n")[0]?.trim() ?? "";
  const cleaned = first.replace(/^["'「『]+|["'」』]+$/g, "").trim();
  if (!cleaned) return null;
  if (cleaned.toUpperCase() === "NONE") return null;
  return cleaned;
}

/**
 * Call Claude Haiku to infer the city. Fail-open: returns null on any error,
 * timeout, or missing key — the caller then resolves with no city bias.
 */
export async function inferCity(
  inputs: string[],
  apiKey: string | undefined
): Promise<string | null> {
  if (!apiKey || inputs.length === 0) return null;
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 32,
        messages: [{ role: "user", content: buildInferCityPrompt(inputs) }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    const text = data?.content?.[0]?.text ?? "";
    return parseInferredCity(text);
  } catch {
    return null;
  }
}
