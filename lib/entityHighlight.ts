/**
 * Accenting the entities inside an event's description.
 *
 * The frame writes the event's own name in `#FF906D` mid-paragraph. This is how
 * that is produced from an arbitrary organiser's prose.
 *
 * ## Why this is not NER
 *
 * Named-entity recognition means finding entities you do not already know.
 * **We already know them.** The title, venue, city, category and organiser are
 * all on the payload the screen has just rendered, so the job is not
 * *recognition* — it is locating strings we were handed. Exact matching is
 * deterministic, costs a regex, cannot invent an entity that is not there, and
 * cannot miss one that is.
 *
 * A real model would only add the entities we *cannot* enumerate: an artist
 * mentioned in the copy, a brand, a support act. That is worth doing and it
 * belongs on the server — run once when the event is saved, with the spans
 * stored beside the description — not in a phone's render path, where it would
 * cost a model download and re-run on every scroll. Nothing here forecloses it:
 * a server that starts returning spans can feed this same segmenter.
 *
 * ## What it will not do
 *
 * Highlight a fragment. Matching is whole-word and longest-first, so a venue
 * called "The Vault" does not light up the word "vault" in "vaulted ceiling",
 * and "The Obsidian Vault" wins over the "Vault" inside it. Short entities are
 * dropped entirely — a category named "Art" would otherwise accent a syllable
 * of "party" on some other event and read as a rendering fault.
 */

/** Below this, a match is more likely to be a coincidence than a reference. */
const MIN_ENTITY_LENGTH = 4

export interface TextSegment {
  text: string
  /** Whether this segment is one of the known entities. */
  entity: boolean
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Split `text` into plain and entity segments.
 *
 * Always returns at least one segment for non-empty input, and concatenating
 * every `text` reproduces the input exactly — the renderer relies on that, so
 * no whitespace or punctuation is dropped on the way through.
 */
export function highlightEntities(
  text: string,
  entities: readonly (string | null | undefined)[],
): TextSegment[] {
  if (!text) return []

  const cleaned = Array.from(
    new Set(
      entities
        .map((e) => (e ?? '').trim())
        .filter((e) => e.length >= MIN_ENTITY_LENGTH),
    ),
  )
    // Longest first, so a contained entity never claims a span its container
    // should have had. Sorting by length is enough; alternation in a RegExp is
    // first-match-wins, not longest-wins.
    .sort((a, b) => b.length - a.length)

  if (cleaned.length === 0) return [{ text, entity: false }]

  /*
   * `\b` on both sides, so a match is a word rather than a substring.
   *
   * Guarded for entities that begin or end with a non-word character — "Blend'n"
   * ends in a letter so it is fine, but a venue like "Bar 22." would put `\b`
   * against a full stop, where it asserts the opposite of what is wanted and
   * the entity would silently never match.
   */
  const pattern = cleaned
    .map((e) => {
      const body = escapeRegExp(e)
      const left = /^\w/.test(e) ? '\\b' : ''
      const right = /\w$/.test(e) ? '\\b' : ''
      return `${left}${body}${right}`
    })
    .join('|')

  const re = new RegExp(`(${pattern})`, 'gi')
  const segments: TextSegment[] = []
  let last = 0

  for (const match of text.matchAll(re)) {
    const start = match.index ?? 0
    if (start > last) segments.push({ text: text.slice(last, start), entity: false })
    // `match[0]`, not the entity — so the organiser's own capitalisation
    // survives and "the scene" mid-sentence is not rewritten to "The Scene".
    segments.push({ text: match[0], entity: true })
    last = start + match[0].length
  }

  if (last < text.length) segments.push({ text: text.slice(last), entity: false })
  return segments
}
