/**
 * Search-text normalization — the single source of truth shared by the
 * server (to build the persisted `nameNormalized` index field) and the web
 * client (to normalize the live query and power local MiniSearch filtering).
 *
 * Both sides MUST use this exact function. If the server indexed with one
 * transform and the client queried with another, matches would silently
 * diverge — which is the class of bug ADR 0028 §3.2 calls out.
 *
 * Transform pipeline (order matters):
 *   1. NFKD — canonical decomposition. Splits precomposed characters into a
 *      base letter + combining marks. This turns most Arabic alef variants
 *      (آ أ إ) into `alef + <mark>` and Latin accents (é) into `e + <acute>`.
 *   2. Strip \p{M} (all Unicode combining marks). Removes Arabic tashkeel
 *      (harakat), the marks produced by step 1, superscript alef (U+0670),
 *      and Latin diacritics — in one uniform pass. This is why we do NOT
 *      hand-maintain a tashkeel codepoint range.
 *   3. Alef wasla (U+0671, ٱ) has no NFKD decomposition, so fold it to bare
 *      alef (U+0627) explicitly. All other common alef forms are already
 *      handled by steps 1–2.
 *   4. Strip tatweel / kashida (U+0640, ـ) — a purely cosmetic elongation
 *      character ("محمـــد" === "محمد").
 *   5. Lowercase + trim.
 *
 * Deliberate non-goals:
 *   - No full case folding (e.g. German ß → ss). That is a substitution, not
 *     a diacritic, and browsers do not fold it in search either.
 *   - No stemming, stop-word removal, or transliteration. MiniSearch layers
 *     tokenization on top of this; the server does substring CONTAINS.
 */
export function normalizeSearchText(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/\u0671/g, "\u0627")
    .replace(/\u0640/g, "")
    .toLowerCase()
    .trim();
}
