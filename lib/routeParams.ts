/*
 * A chat route's params come from anybody's link (`blendn://chat/…?…`), so
 * each is checked before use (Flow 5 security review). An id goes into API
 * paths: it must be one segment the server could have minted, never
 * `../anything`. A name is a first paint until the server's row arrives: plain
 * text, bounded, with no control or direction-changing characters.
 */
const ID = /^[A-Za-z0-9_-]{1,64}$/
const NAME_MAX = 80
/*
 * Controls (newlines kept where asked), format characters (\p{Cf}: direction
 * marks, zero-widths, the BOM) and the line/paragraph separators U+2028/9.
 * Never the ZWJ, which joins emoji.
 */
const UNSAFE = /(?!\u200D)[\p{Cc}\p{Cf}\u2028\u2029]/gu
const UNSAFE_KEEP_NEWLINE = /(?!\u200D|\n)[\p{Cc}\p{Cf}\u2028\u2029]/gu

/**
 * Route text with its unsafe characters gone, cut to `max` code points (never
 * through a surrogate pair, and never ending on a dangling joiner); '' when
 * nothing is left, so the caller falls back.
 * ponytail: a cut can still split a ZWJ family into its first members; use
 * Intl.Segmenter when Hermes ships it.
 */
export function plainText(value: unknown, max: number, { newlines = false } = {}): string {
  if (typeof value !== 'string') return ''
  const clean = value.replace(newlines ? UNSAFE_KEEP_NEWLINE : UNSAFE, '').trim()
  return Array.from(clean)
    .slice(0, max)
    .join('')
    .replace(/\u200D+$/u, '')
    .trim()
}

export function idParam(value: unknown): string | null {
  return typeof value === 'string' && ID.test(value) ? value : null
}

export function nameParam(value: unknown): string | undefined {
  return plainText(value, NAME_MAX) || undefined
}
