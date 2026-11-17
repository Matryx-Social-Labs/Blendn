/**
 * The friends list's letters (Flow 7 1-A): script-aware heads, so a Devanagari name no longer lands under "#", and the modes that
 * keep the A–Z from reshuffling. Negative control: the old `letterOf` (A–Z else "#") fails the first.
 */
import { ALL_AT_ONCE, friendItems, indexForLetter, letterOf, listMode, scrubberLetters, SECTIONS_FROM } from '../lib/friendsIndex'

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
  it('plain under a screenful or while searching; A–Z up to ALL_AT_ONCE; newest first past it', () => {
    expect(listMode(SECTIONS_FROM - 1, false)).toBe('plain')
    expect(listMode(64, true)).toBe('plain')
    expect(listMode(64, false)).toBe('az')
    expect(listMode(ALL_AT_ONCE, false)).toBe('az')
    expect(listMode(ALL_AT_ONCE + 1, false)).toBe('newest')
  })
})

describe('friendItems and the index', () => {
  const people = ['Zoe', 'प्रियंका', 'Aarav', '9lives', 'तनु', 'Bea'].map(f)

  it('A–Z, then other scripts in their own order, then #', () => {
    const heads = friendItems(people, 'az').flatMap((i) => (i.kind === 'head' ? [i.title] : []))
    expect(heads).toEqual(['Recently added', 'A', 'B', 'Z', 'त', 'प', '#'])
  })

  it('the index is ★, A–Z, the other scripts present, then # if present', () => {
    expect(scrubberLetters(friendItems(people, 'az'))).toEqual(['★', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'त', 'प', '#'])
    expect(scrubberLetters(friendItems([f('Ann')], 'az')).at(-1)).toBe('Z')
  })

  it('a letter with no names jumps to the next one that has some; ★ is the top', () => {
    const items = friendItems(people, 'az')
    const letters = scrubberLetters(items)
    const at = (t: string) => items.findIndex((i) => i.kind === 'head' && i.title === t)
    expect(indexForLetter(items, letters, '★')).toBe(0)
    expect(indexForLetter(items, letters, 'C')).toBe(at('Z'))
    expect(indexForLetter(items, letters, 'प')).toBe(at('प'))
  })
})
