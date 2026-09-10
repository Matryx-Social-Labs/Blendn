/**
 * The things an organiser wrote about their event that nobody could read.
 *
 * `event_details` holds six fields. The dashboard collects all six, Postgres
 * stores them, `GET /api/mobile/events/{id}` serves them — and until now no
 * screen rendered any of them. `apiClient` even declared five on its type, so
 * the client asked for them and threw them away.
 *
 * The sharp one is accessibility. An organiser writes "step-free entrance,
 * accessible toilet on the ground floor" and the person who needs to know that
 * before deciding whether to come cannot see it. Cancellation policy has the
 * same shape: the answer to a question people actually ask, written down and
 * withheld.
 *
 * ## Why a transform rather than reading the payload in the screen
 *
 * Three different shapes arrive — prose, a question-and-answer list, and
 * key/value pairs — and every one is `unknown` on the wire, because these are
 * JSON columns. A screen that destructures them directly is a screen that
 * breaks on a row written before the dashboard settled on a shape, and there
 * are rows older than the current form.
 *
 * So: parse defensively here, hand the screen a flat ordered list, and let the
 * component do nothing but draw. The same division as `amenityTile.ts`.
 */

/** A prose block — house rules, cancellation policy, health guidance. */
export interface ProseBlock {
  kind: 'prose'
  key: string
  title: string
  body: string
}

/** Key/value pairs — accessibility, and the organiser's own "good to know". */
export interface PairsBlock {
  kind: 'pairs'
  key: string
  title: string
  pairs: { label: string; value: string }[]
}

/** Questions and answers. */
export interface FaqBlock {
  kind: 'faq'
  key: string
  title: string
  items: { question: string; answer: string }[]
}

export type DetailBlock = ProseBlock | PairsBlock | FaqBlock

/** The `details` object as the mobile event payload carries it. */
export interface ServerEventDetails {
  houseRules?: unknown
  cancellationPolicy?: unknown
  covidGuidelines?: unknown
  faq?: unknown
  accessibilityInfo?: unknown
  additionalInfo?: unknown
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/**
 * A JSON column can hold anything, and older rows do.
 *
 * `additional_info` and `accessibility_info` are written by the dashboard as a
 * flat object of strings, but the columns predate that form and the API types
 * both `unknown`. Non-string values are dropped rather than coerced —
 * `String({})` is `"[object Object]"`, and printing that under "Wheelchair
 * access" is worse than printing nothing.
 */
function pairs(v: unknown): { label: string; value: string }[] {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return []
  return Object.entries(v as Record<string, unknown>)
    .map(([label, value]) => ({ label: label.trim(), value: text(value) }))
    .filter((p) => p.label.length > 0 && p.value.length > 0)
}

/**
 * FAQ rows, requiring both halves.
 *
 * The dashboard appends an empty Q&A row the moment "Add Q&A" is pressed, so a
 * half-filled row reaches the column whenever somebody adds one and thinks
 * better of it. A question with no answer is worse than no question at all: it
 * reads as the screen having failed to load the answer.
 */
function faqItems(v: unknown): { question: string; answer: string }[] {
  if (!Array.isArray(v)) return []
  return v
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const r = row as Record<string, unknown>
      return { question: text(r.question), answer: text(r.answer) }
    })
    .filter((r): r is { question: string; answer: string } => !!r && !!r.question && !!r.answer)
}

/**
 * Ordered as somebody deciding whether to go would want them.
 *
 * Accessibility, then house rules, then everything else: the first is whether
 * you *can* come, the second is what is expected of you once there, the third
 * is detail. Cancellation last, because it is the question you ask after you
 * have already decided.
 */
export function eventDetailBlocks(details: ServerEventDetails | null | undefined): DetailBlock[] {
  if (!details) return []
  const out: DetailBlock[] = []

  const access = pairs(details.accessibilityInfo)
  if (access.length)
    out.push({ kind: 'pairs', key: 'accessibility', title: 'Accessibility', pairs: access })

  const extra = pairs(details.additionalInfo)
  if (extra.length) out.push({ kind: 'pairs', key: 'additional', title: 'Good to know', pairs: extra })

  const rules = text(details.houseRules)
  if (rules) out.push({ kind: 'prose', key: 'house-rules', title: 'House rules', body: rules })

  const covid = text(details.covidGuidelines)
  if (covid) out.push({ kind: 'prose', key: 'covid', title: 'Health guidance', body: covid })

  const faq = faqItems(details.faq)
  if (faq.length) out.push({ kind: 'faq', key: 'faq', title: 'Questions', items: faq })

  const cancellation = text(details.cancellationPolicy)
  if (cancellation)
    out.push({ kind: 'prose', key: 'cancellation', title: 'Cancellations', body: cancellation })

  return out
}
