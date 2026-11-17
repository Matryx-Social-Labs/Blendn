/**
 * The friends list's shape (Flow 7 1-A): which mode it is drawn in, its items under their letter heads, and the scrubber's
 * letters. Pure, so every rule is tested without a render.
 */
import type { Friend } from './friends'

/** D7: "Recently added" holds this many (the server's newest first). */
export const RECENTLY_ADDED = 5
/** Below this many friends the list is a screenful and visibly all of itself: no sections. */
export const SECTIONS_FROM = 12
/**
 * Up to this many friends, every page is read before the A–Z is drawn (at most five pages of 100), so a letter never gains a
 * name under your finger as a later page arrives.
 *
 * ponytail: the server pages newest first, so A–Z needs the whole list on the phone. Past this many the list stays newest
 * first with no heads and no scrubber (search finds a name), which never reshuffles either. Upgrade path: `GET /friends?order=name`
 * with a name cursor plus `letters` (ROADMAP § Backend later); then A–Z pages by letter at any size and this cap goes.
 */
export const ALL_AT_ONCE = 500
/** The scrubber is drawn past this many letter heads (the board: "an A–Z scrubber past 12 heads"). */
export const SCRUBBER_FROM = 12

/** `plain`: one run as the server sent it. `az`: Recently added, then A–Z. `newest`: newest first, too many to sort here. */
export type ListMode = 'plain' | 'az' | 'newest'

export function listMode(total: number, searched: boolean): ListMode {
  if (searched || total < SECTIONS_FROM) return 'plain'
  return total <= ALL_AT_ONCE ? 'az' : 'newest'
}

export type FriendItem = { kind: 'head'; key: string; title: string } | { kind: 'friend'; key: string; friend: Friend }

/** The head for anything that starts with no letter at all: a digit, an emoji, punctuation. */
export const OTHER = '#'
export const RECENT = 'Recently added'

const LATIN = /^[A-Z]$/
const LETTER = /^\p{L}$/u
const MARKS = /\p{M}/gu

/**
 * The letter a name files under, script-aware: "A" for Aarav and Ábhi, "प" for प्रियंका (the first character of its own script,
 * with its vowel signs and virama dropped), "#" for a name that starts with no letter. Devanagari used to land under "#".
 */
export function letterOf(name: string): string {
  const first = [...name.trim().normalize('NFD').replace(MARKS, '')][0] ?? ''
  const upper = first.toLocaleUpperCase('en')
  if (LATIN.test(upper)) return upper
  return LETTER.test(first) ? upper : OTHER
}

/** Latin A–Z first, then each other script's letters in their own order, then "#". */
function compareHeads(a: string, b: string): number {
  const rank = (h: string) => (h === OTHER ? 2 : LATIN.test(h) ? 0 : 1)
  return rank(a) - rank(b) || a.localeCompare(b)
}

/**
 * The items the list draws. `az`: "Recently added" (the server's newest, up to `RECENTLY_ADDED`), then a head per letter in
 * `compareHeads` order with its names in locale order. Any other mode is one plain run in the server's order.
 */
export function friendItems(friends: readonly Friend[], mode: ListMode): FriendItem[] {
  const row = (prefix: string) => (friend: Friend): FriendItem => ({ kind: 'friend', key: `${prefix}${friend.userId}`, friend })
  if (mode !== 'az') return friends.map(row(''))
  const filed = friends.map((friend) => ({ friend, head: letterOf(friend.name) }))
  filed.sort((a, b) => compareHeads(a.head, b.head) || a.friend.name.localeCompare(b.friend.name, undefined, { sensitivity: 'base' }))
  const items: FriendItem[] = [{ kind: 'head', key: 'h:recent', title: RECENT }, ...friends.slice(0, RECENTLY_ADDED).map(row('r:'))]
  let head = ''
  for (const { friend, head: next } of filed) {
    if (next !== head) items.push({ kind: 'head', key: `h:${next}`, title: next })
    head = next
    items.push(row('a:')(friend))
  }
  return items
}

/** The scrubber's column: ★ (Recently added), A–Z always, then any other script's heads in the list, then "#" if present. */
export function scrubberLetters(items: readonly FriendItem[]): string[] {
  const heads = items.flatMap((i) => (i.kind === 'head' && i.title !== RECENT ? [i.title] : []))
  const extra = heads.filter((h) => !LATIN.test(h) && h !== OTHER)
  return ['★', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', ...extra, ...(heads.includes(OTHER) ? [OTHER] : [])]
}

/** How many letter heads the list has (Recently added is not one). */
export const letterHeads = (items: readonly FriendItem[]) => items.filter((i) => i.kind === 'head' && i.title !== RECENT).length

/**
 * The item a scrubber letter jumps to: its head, or the next head after it in the column when that letter has no names (iOS
 * Contacts does the same), else the last head. ★ is the top.
 */
export function indexForLetter(items: readonly FriendItem[], letters: readonly string[], letter: string): number {
  if (letter === '★') return 0
  const heads = new Map(items.flatMap((item, i) => (item.kind === 'head' ? [[item.title, i] as const] : [])))
  for (const l of letters.slice(letters.indexOf(letter))) {
    const at = heads.get(l)
    if (at !== undefined) return at
  }
  return Math.max(0, ...heads.values())
}
