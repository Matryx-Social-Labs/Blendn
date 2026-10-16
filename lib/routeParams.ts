/*
 * A chat route's params come from anybody's link (`blendn://chat/…?…`), so
 * each is checked before use (Flow 5 security review). An id goes into API
 * paths: it must be one segment the server could have minted, never
 * `../anything`. A name is a first paint until the server's row arrives: plain
 * text, bounded, with no control or direction-changing characters.
 */
const ID = /^[A-Za-z0-9_-]{1,64}$/
const NAME_MAX = 80
/* Controls (newlines kept where asked) and the marks that reorder text; never a ZWJ, which joins emoji. */
const DIRECTION_MARKS = '\\u061C\\u200E\\u200F\\u202A-\\u202E\\u2066-\\u2069'
const UNSAFE = new RegExp(`[\\u0000-\\u001F\\u007F-\\u009F${DIRECTION_MARKS}]`, 'g')
const UNSAFE_KEEP_NEWLINE = new RegExp(`[\\u0000-\\u0009\\u000B-\\u001F\\u007F-\\u009F${DIRECTION_MARKS}]`, 'g')

/** Route text with its unsafe characters gone, bounded; '' when nothing is left. */
export function plainText(value: unknown, max: number, { newlines = false } = {}): string {
  if (typeof value !== 'string') return ''
  return value.replace(newlines ? UNSAFE_KEEP_NEWLINE : UNSAFE, '').trim().slice(0, max)
}

export function idParam(value: unknown): string | null {
  return typeof value === 'string' && ID.test(value) ? value : null
}

export function nameParam(value: unknown): string | undefined {
  return plainText(value, NAME_MAX) || undefined
}
