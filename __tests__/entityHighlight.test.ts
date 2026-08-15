import { highlightEntities } from '../lib/entityHighlight'

/**
 * The entity accenting in an event description.
 *
 * These are real behaviour tests rather than source greps — the module is pure
 * string work, so unlike the layout in this repo it can actually be asserted.
 */

const join = (segs: { text: string }[]) => segs.map((s) => s.text).join('')
const accented = (segs: { text: string; entity: boolean }[]) =>
  segs.filter((s) => s.entity).map((s) => s.text)

describe('highlightEntities', () => {
  it('is lossless — the segments rebuild the input exactly', () => {
    // Everything else is cosmetic; this one being wrong silently deletes an
    // organiser's words from their own description.
    const text = 'The Scene is at The Obsidian Vault, doors 21:00 — late.'
    expect(join(highlightEntities(text, ['The Scene', 'The Obsidian Vault']))).toBe(text)
  })

  it('accents the entities it was given', () => {
    const segs = highlightEntities('A night at The Obsidian Vault.', ['The Obsidian Vault'])
    expect(accented(segs)).toEqual(['The Obsidian Vault'])
  })

  it('prefers the longest entity when one contains another', () => {
    // "Vault" alone would otherwise claim the tail of "The Obsidian Vault" and
    // the accent would start mid-name.
    const segs = highlightEntities('Inside The Obsidian Vault tonight.', [
      'Vault',
      'The Obsidian Vault',
    ])
    expect(accented(segs)).toEqual(['The Obsidian Vault'])
  })

  it('does not accent a fragment inside a longer word', () => {
    // The failure this prevents: a venue called "The Vault" lighting up the
    // first syllable of "vaulted", which reads as a rendering fault.
    const segs = highlightEntities('Under the vaulted ceiling.', ['Vault'])
    expect(accented(segs)).toEqual([])
  })

  it('matches case-insensitively but keeps the original casing', () => {
    // Rewriting the organiser's capitalisation would be editing their copy.
    const segs = highlightEntities('the scene starts late.', ['The Scene'])
    expect(accented(segs)).toEqual(['the scene'])
  })

  it('ignores entities too short to be meaningful', () => {
    // A category named "Art" would otherwise accent a syllable of "party".
    const segs = highlightEntities('A great party at the bar.', ['Art', 'bar'])
    expect(accented(segs)).toEqual([])
  })

  it('survives regex metacharacters in an entity', () => {
    // A venue is free text. "C++ Bar" or "Bar (Downtown)" must not throw.
    const text = 'Tonight at Bar (Downtown) with friends.'
    const segs = highlightEntities(text, ['Bar (Downtown)'])
    expect(accented(segs)).toEqual(['Bar (Downtown)'])
    expect(join(segs)).toBe(text)
  })

  it('handles an entity ending in a non-word character', () => {
    // `\b` against a full stop asserts the opposite of what is wanted, so the
    // entity would silently never match.
    const segs = highlightEntities('Playing at Studio 22. Doors at nine.', ['Studio 22.'])
    expect(accented(segs)).toEqual(['Studio 22.'])
  })

  it('returns the text unchanged when there is nothing to match', () => {
    expect(highlightEntities('Just a description.', [])).toEqual([
      { text: 'Just a description.', entity: false },
    ])
    expect(highlightEntities('Just a description.', [null, undefined, '  '])).toEqual([
      { text: 'Just a description.', entity: false },
    ])
  })

  it('returns nothing for empty text', () => {
    expect(highlightEntities('', ['The Scene'])).toEqual([])
  })

  it('accents every occurrence, not just the first', () => {
    const segs = highlightEntities('The Scene returns. The Scene is back.', ['The Scene'])
    expect(accented(segs)).toEqual(['The Scene', 'The Scene'])
  })
})
