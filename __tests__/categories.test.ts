import { pickableItems, toPickerTree, type CategoryNode } from '../lib/categories'

/**
 * Parsing the taxonomy, and the production bug that made these tests exist.
 *
 * `GET /categories` returns a tree — top-level rows with their leaves in
 * `children`. The interests screen once read the response as a flat list and
 * kept rows with a non-null `parent_id`, which is every row the endpoint does
 * *not* return. It discarded 100% of the response, showed "Couldn't load
 * interests", and left Continue disabled with nothing selectable. Onboarding
 * could not be completed at all, so the structured interest graph stayed empty
 * across every account for weeks while every screen looked fine.
 *
 * The fix then was `flattenToLeaves`, which threw the 13 parents away and
 * rendered 67 chips in one wall. `toPickerTree` replaces it: the parents come
 * back as **headings**, and what gets stored is still a leaf.
 *
 * Most of what is asserted below is unchanged, because it was never really
 * about flattening — it is about parsing a network response defensively. The
 * two tests that *were* about flattening are inverted rather than deleted, so
 * the behaviour change itself is pinned.
 */

const tree: CategoryNode[] = [
  {
    id: 'music',
    name: 'Music',
    icon: '🎵',
    children: [
      { id: 'techno', name: 'Techno', icon: '🔊' },
      { id: 'jazz', name: 'Jazz', icon: '🎷' },
    ],
  },
  {
    id: 'sports',
    name: 'Sports',
    children: [{ id: 'football', name: 'Football' }],
  },
]

describe('toPickerTree', () => {
  it('groups the leaves under their parent', () => {
    expect(toPickerTree(tree).map((g) => [g.name, g.items.map((i) => i.id)])).toEqual([
      ['Music', ['techno', 'jazz']],
      ['Sports', ['football']],
    ])
  })

  it('keeps the parent as a heading — inverted from "does not include a parent"', () => {
    /*
     * The old behaviour discarded "Music" entirely. It is back, as a group
     * name, and deliberately NOT among the selectable items: a heading is
     * somewhere to look, and what gets stored is a leaf. The ranking still
     * gets the parent, because `matches.ts` expands a stored leaf upward.
     */
    const [music] = toPickerTree(tree)
    expect(music.name).toBe('Music')
    expect(pickableItems(toPickerTree(tree)).map((c) => c.id)).not.toContain('music')
  })

  it('still selects leaves, never groupings', () => {
    // Unchanged in substance: "Music" is something half the room would tick and
    // an overlap on it says little, whereas "Techno" says a great deal.
    expect(pickableItems(toPickerTree(tree)).map((c) => c.id)).toEqual([
      'techno',
      'jazz',
      'football',
    ])
  })

  it('makes a childless parent its own selectable item rather than dropping it', () => {
    // Dropping it would silently remove a whole branch of the taxonomy from the
    // picker, and a coarse interest beats a missing one.
    const withLoner: CategoryNode[] = [{ id: 'chess', name: 'Chess' }]
    expect(toPickerTree(withLoner)).toEqual([
      { id: 'chess', name: 'Chess', items: [{ id: 'chess', name: 'Chess', icon: null }] },
    ])
  })

  it('treats an empty children array as no children', () => {
    const empty: CategoryNode[] = [{ id: 'solo', name: 'Solo', children: [] }]
    expect(pickableItems(toPickerTree(empty)).map((c) => c.id)).toEqual(['solo'])
  })

  it('coerces ids to strings, because this is parsing a network response', () => {
    // A numeric id would otherwise be compared against a string id in the
    // selection set and never match — the selection would silently do nothing.
    const numeric: CategoryNode[] = [{ id: 1, name: 'One', children: [{ id: 2, name: 'Two' }] }]
    const [group] = toPickerTree(numeric)
    expect(group.id).toBe('1')
    expect(group.items[0].id).toBe('2')
    expect(typeof group.items[0].id).toBe('string')
  })

  it('normalises a missing icon to null rather than undefined', () => {
    // The chip renderer branches on the icon; `undefined` and `null` reading
    // differently is a difference nobody wants to debug on a device.
    expect(toPickerTree([{ id: 'a', name: 'A' }])[0].items[0].icon).toBeNull()
  })

  it('returns an empty list for an empty tree rather than throwing', () => {
    // This is the response an unseeded database gives, and the screen has to
    // render something honest instead of crashing.
    expect(toPickerTree([])).toEqual([])
  })

  it('survives a malformed node without children', () => {
    const junk = [{ id: null, name: 'nameless' }] as unknown as CategoryNode[]
    expect(toPickerTree(junk)).toEqual([])
  })

  it('drops a malformed child without dropping its siblings', () => {
    // New: a flat list could skip a bad row and carry on. A grouped one has to
    // decide whether one broken child takes the whole section with it.
    const partial = [
      { id: 'music', name: 'Music', children: [{ id: null, name: 'broken' }, { id: 'jazz', name: 'Jazz' }] },
    ] as unknown as CategoryNode[]
    expect(pickableItems(toPickerTree(partial)).map((c) => c.id)).toEqual(['jazz'])
  })
})

describe('pickableItems', () => {
  it('flattens the groups back to what can actually be selected', () => {
    expect(pickableItems(toPickerTree(tree))).toHaveLength(3)
  })

  it('is empty for an empty tree', () => {
    expect(pickableItems([])).toEqual([])
  })
})
