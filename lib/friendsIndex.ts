/**
 * The friends list's shape (Flow 7 1-A): which mode it is drawn in, its items under their letter heads, and the scrubber's
 * letters. Pure, so every rule is tested without a render.
 */
import type { Friend } from './friends'

/** D7: "Recently added" holds this many (the server's newest first). */
export const RECENTLY_ADDED = 5
/** Below this many friends the list is a screenful and visibly all of itself: no sections. */
export const SECTIONS_FROM = 12
/** The scrubber is drawn past this many letter heads (the board: "an A–Z scrubber past 12 heads"). */
export const SCRUBBER_FROM = 12

/**
 * `plain`: one run as the server sent it (newest first, or a search's answer). `az`: Recently added, then the server's A–Z
 * (`GET /friends?order=name`, admin #998), read a page at a time at any size: its order is final, so a later page only adds
 * names below and nothing on screen reshuffles.
 */
export type ListMode = 'plain' | 'az'

export function listMode(total: number, searched: boolean): ListMode {
  return searched || total < SECTIONS_FROM ? 'plain' : 'az'
}

/** One of the server's `letters`: a head of the whole list (after `q`) and how many names file under it. */
export type Letter = { letter: string; count: number }

/** The `letters` of a `GET /friends?order=name` answer; null when it has none (a failure, or an older server). */
export function lettersFrom(data: unknown): Letter[] | null {
  const raw = (data as { letters?: unknown } | null)?.letters
  if (!Array.isArray(raw)) return null
  return raw.filter((l): l is Letter => typeof l?.letter === 'string' && l.letter.length > 0 && Number.isInteger(l?.count) && l.count > 0)
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
 * with its vowel signs and virama dropped), "#" for a name that starts with no letter. The server files by the same rule (admin
 * `lib/friends-by-name.ts` copies it), so the heads drawn here are the server's `letters`.
 */
export function letterOf(name: string): string {
  const first = [...name.trim().normalize('NFD').replace(MARKS, '')][0] ?? ''
  const upper = first.toLocaleUpperCase('en')
  if (LATIN.test(upper)) return upper
  return LETTER.test(first) ? upper : OTHER
}

/**
 * The items the list draws. `az`: "Recently added" (`recent`, the server's newest, up to `RECENTLY_ADDED`), then `friends` in the
 * server's name order, never re-sorted here, with a head each time the letter changes. Any other mode is one plain run.
 */
export function friendItems(friends: readonly Friend[], mode: ListMode, recent: readonly Friend[] = []): FriendItem[] {
  const row = (prefix: string) => (friend: Friend): FriendItem => ({ kind: 'friend', key: `${prefix}${friend.userId}`, friend })
  if (mode !== 'az') return friends.map(row(''))
  const items: FriendItem[] = [{ kind: 'head', key: 'h:recent', title: RECENT }, ...recent.slice(0, RECENTLY_ADDED).map(row('r:'))]
  let head = ''
  for (const friend of friends) {
    const next = letterOf(friend.name)
    if (next !== head) items.push({ kind: 'head', key: `h:${next}`, title: next })
    head = next
    items.push(row('a:')(friend))
  }
  return items
}

/** The scrubber's column: ★ (Recently added), A–Z always, then the whole list's other-script heads in its order, then "#" if any. */
export function scrubberLetters(letters: readonly Letter[]): string[] {
  const heads = letters.map((l) => l.letter)
  const extra = heads.filter((h) => !LATIN.test(h) && h !== OTHER)
  return ['★', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', ...extra, ...(heads.includes(OTHER) ? [OTHER] : [])]
}

/**
 * The head a scrubber letter lands on: its own when it has names, else the next in the column that has some (iOS Contacts does
 * the same), else the last head. Read from the whole list's `letters`, so a head on a page not read yet is still known.
 */
export function headFor(column: readonly string[], letter: string, letters: readonly Letter[]): string | null {
  const has = new Set(letters.map((l) => l.letter))
  return column.slice(Math.max(0, column.indexOf(letter))).find((l) => has.has(l)) ?? letters.at(-1)?.letter ?? null
}

/** Where a letter's head is in the items read so far; -1 while its page has not been read. */
export const headIndex = (items: readonly FriendItem[], title: string): number =>
  items.findIndex((i) => i.kind === 'head' && i.key === `h:${title}`)
