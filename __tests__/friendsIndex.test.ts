/**
 * The friends list's letters (Flow 7 1-A): script-aware heads, so a Devanagari name no longer lands under "#"; the A–Z is the
 * server's name order (admin #998), drawn as it arrives and never re-sorted here; the index and its jumps come from the whole
 * list's `letters`. Negative control: the old `letterOf` (A–Z else "#") fails the first; the old builder (sorted on the phone)
 * fails "keeps the server's order".
 */
import { friendItems, headFor, headIndex, letterOf, lettersFrom, listMode, scrubberLetters, SECTIONS_FROM } from '../lib/friendsIndex'

const f = (name: string, i = 0) => ({ userId: `u${i}`, name, photo: null, since: '2026-01-01T00:00:00Z' })

describe('letterOf', () => {
  it('files a name under its own script’s first letter, never under # for being non-Latin', () => {
    expect(letterOf('प्रियंका शर्मा')).toBe('प')
    expect(letterOf('पूजा')).toBe('प')
    expect(letterOf('தமிழ்செல்வி')).toBe('த')
    expect(letterOf('Ábhi')).toBe('A')
    expect(letterOf('marc-André')).toBe('M')
    expect(letterOf('Ωmega')).toBe('Ω')
  })

  it('files a digit, an emoji or a blank under #', () => {
    for (const name of ['9lives', '🎉 Party', '', '  ', '-dash']) expect(letterOf(name)).toBe('#')
  })
})

describe('listMode', () => {
  it('plain under a screenful or while searching; A–Z at any size past it (no newest-first fallback)', () => {
    expect(listMode(SECTIONS_FROM - 1, false)).toBe('plain')
    expect(listMode(64, true)).toBe('plain')
    expect(listMode(SECTIONS_FROM, false)).toBe('az')
    expect(listMode(12_480, false)).toBe('az')
  })
})

describe('lettersFrom', () => {
  it('reads the server’s letters, dropping anything malformed; none at all is null', () => {
    expect(lettersFrom({ letters: [{ letter: 'A', count: 2 }, { letter: 'प', count: 1 }, { letter: '', count: 1 }, { letter: 'B', count: 0 }, { letter: 'C' }, null] })).toEqual([
      { letter: 'A', count: 2 },
      { letter: 'प', count: 1 },
    ])
    expect(lettersFrom({ friends: [] })).toBeNull()
    expect(lettersFrom(null)).toBeNull()
  })
})

describe('friendItems and the index', () => {
  // The server's order: A–Z, then other scripts, then #.
  const byName = ['Aarav', 'Bea', 'Zoe', 'तनु', 'प्रियंका', '9lives'].map(f)
  const letters = [{ letter: 'A', count: 1 }, { letter: 'B', count: 1 }, { letter: 'Z', count: 1 }, { letter: 'त', count: 1 }, { letter: 'प', count: 1 }, { letter: '#', count: 1 }]

  it('Recently added (the newest, five at most), then a head each time the server’s order changes letter', () => {
    const recent = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'].map(f)
    const items = friendItems(byName, 'az', recent)
    expect(items.flatMap((i) => (i.kind === 'head' ? [i.title] : []))).toEqual(['Recently added', 'A', 'B', 'Z', 'त', 'प', '#'])
    expect(items.filter((i) => i.key.startsWith('r:'))).toHaveLength(5)
  })

  it('keeps the server’s order: nothing is re-sorted on the phone', () => {
    // A page the server ordered by its own collation: drawn exactly so.
    const items = friendItems(['bea', 'Bastian', 'Ben'].map(f), 'az')
    expect(items.flatMap((i) => (i.kind === 'friend' ? [i.friend.name] : []))).toEqual(['bea', 'Bastian', 'Ben'])
    expect(items.filter((i) => i.kind === 'head')).toHaveLength(2)
  })

  it('a short list or a search is one plain run with no heads', () => {
    expect(friendItems(byName, 'plain', byName).every((i) => i.kind === 'friend')).toBe(true)
  })

  it('the index is ★, A–Z, the whole list’s other scripts, then # if any; from `letters`, not the pages read', () => {
    expect(scrubberLetters(letters)).toEqual(['★', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'त', 'प', '#'])
    expect(scrubberLetters([{ letter: 'A', count: 1 }]).at(-1)).toBe('Z')
  })

  it('a letter with no names lands on the next that has some, else the last head; a head not read yet is still known', () => {
    const column = scrubberLetters(letters)
    expect(headFor(column, 'A', letters)).toBe('A')
    expect(headFor(column, 'C', letters)).toBe('Z')
    expect(headFor(column, 'प', letters)).toBe('प')
    expect(headFor(column, '#', [{ letter: 'A', count: 3 }])).toBe('A')
    // Only the first page (A, B) has been read: Z's head is not there yet.
    const firstPage = friendItems(byName.slice(0, 2), 'az')
    expect(headIndex(firstPage, 'B')).toBeGreaterThan(0)
    expect(headIndex(firstPage, 'Z')).toBe(-1)
  })
})
