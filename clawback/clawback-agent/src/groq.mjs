// The Clawback AI adjudicator. Evaluates whether a delivered response meets the
// buyer's stated spec, returning a structured verdict. Uses Groq (the AI attester)
// with a deterministic heuristic fallback so it always returns a verdict.
import { CFG, log } from "./config.mjs";

/** Heuristic spec-vs-response check (ported from the original Clawback SDK). */
export function evaluateDelivery(spec, response) {
  const responseText = JSON.stringify(response ?? "").toLowerCase();
  const specText = JSON.stringify(spec ?? "").toLowerCase();
  const terms = [...new Set(specText.match(/[a-z0-9]{4,}/g) ?? [])].slice(0, 12);
  const missingTerms = terms.filter((term) => !responseText.includes(term));
  const junk = /junk|empty|unavailable|error|failed|no requested data/.test(responseText);
  const deliveredOk = Boolean(response) && !junk && missingTerms.length <= Math.max(1, terms.length / 2);
  return {
    deliveredOk,
    verdict: deliveredOk ? "meets-spec" : "does-not-meet-spec",
    missingTerms,
    notes: deliveredOk
      ? ["response covers enough of the stated spec"]
      : ["response misses core spec terms or contains a failure marker"],
    by: "heuristic",
  };
}

async function groqJson(system, user) {
  if (!CFG.groqKey) return null;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${CFG.groqKey}` },
      body: JSON.stringify({
        model: CFG.groqModel,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0,
        max_tokens: 500,
        response_format: { type: "json_object" },
      }),
    });
    const j = await res.json();
    if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
    const txt = j.choices?.[0]?.message?.content;
    return txt ? JSON.parse(txt) : null;
  } catch (e) {
    log(`  · groq adjudicator unavailable (${e.message}); using heuristic`);
    return null;
  }
}

/**
 * Adjudicate a delivery with the AI attester. Returns the same SpecDiff shape as the
 * heuristic, with `by: "groq"` when the model decided. Falls back to the heuristic.
 */
export async function adjudicate(spec, response) {
  const heuristic = evaluateDelivery(spec, response);
  const verdict = await groqJson(
    "You are the Clawback dispute attester. Decide if the DELIVERED response satisfies the buyer's SPEC. " +
      'Reply ONLY as JSON: {"deliveredOk": boolean, "missingTerms": string[], "notes": string[]}. ' +
      "deliveredOk=false if the response is junk/error/empty or omits required content.",
    `SPEC:\n${JSON.stringify(spec)}\n\nDELIVERED:\n${JSON.stringify(response)}`
  );
  if (verdict && typeof verdict.deliveredOk === "boolean") {
    return {
      deliveredOk: verdict.deliveredOk,
      verdict: verdict.deliveredOk ? "meets-spec" : "does-not-meet-spec",
      missingTerms: Array.isArray(verdict.missingTerms) ? verdict.missingTerms : heuristic.missingTerms,
      notes: Array.isArray(verdict.notes) && verdict.notes.length ? verdict.notes : heuristic.notes,
      by: "groq",
    };
  }
  return heuristic;
}
