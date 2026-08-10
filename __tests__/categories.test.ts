import { flattenToLeaves, type CategoryNode } from '../lib/categories'

/**
 * The function whose absence emptied `user_interests` in production.
 *
 * `GET /categories` returns a tree — top-level rows with their leaves in
 * `children`. The interests screen read the response as a flat list and kept
 * rows with a non-null `parent_id`, which is every row the endpoint does *not*
 * return. It discarded 100% of the response, showed "Couldn't load interests",
 * and left Continue disabled with nothing selectable. Onboarding could not be
 * completed at all, so the structured interest graph stayed empty across every
 * account for weeks while every screen looked fine.
 *
 * Nothing could have caught that but a test of this shape, and there was no
 * runner to put one in.
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

describe('flattenToLeaves', () => {
  it('returns the leaves, not the groupings', () => {
    // The whole point: "Music" is something half the room would tick and an
    // overlap on it says nothing, whereas "Techno" says a great deal.
    expect(flattenToLeaves(tree).map((c) => c.id)).toEqual(['techno', 'jazz', 'football'])
  })

  it('does not include a parent that has children', () => {
    expect(flattenToLeaves(tree).map((c) => c.id)).not.toContain('music')
  })

  it('keeps a childless parent rather than dropping it', () => {
    // Dropping it would silently remove a whole branch of the taxonomy from the
    // picker, and a coarse interest beats a missing one.
    const withLoner: CategoryNode[] = [{ id: 'chess', name: 'Chess' }]
    expect(flattenToLeaves(withLoner)).toEqual([{ id: 'chess', name: 'Chess', icon: null }])
  })

  it('treats an empty children array as no children', () => {
    const empty: CategoryNode[] = [{ id: 'solo', name: 'Solo', children: [] }]
    expect(flattenToLeaves(empty).map((c) => c.id)).toEqual(['solo'])
  })

  it('coerces ids to strings, because this is parsing a network response', () => {
    // A numeric id would otherwise be compared against a string id in the
    // selection set and never match — the selection would silently do nothing.
    const numeric: CategoryNode[] = [{ id: 1, name: 'One', children: [{ id: 2, name: 'Two' }] }]
    const [leaf] = flattenToLeaves(numeric)
    expect(leaf.id).toBe('2')
    expect(typeof leaf.id).toBe('string')
  })

  it('normalises a missing icon to null rather than undefined', () => {
    // The chip renderer branches on the icon; `undefined` and `null` reading
    // differently is a difference nobody wants to debug on a device.
    expect(flattenToLeaves([{ id: 'a', name: 'A' }])[0].icon).toBeNull()
  })

  it('returns an empty list for an empty tree rather than throwing', () => {
    // This is the response an unseeded database gives, and the screen has to
    // render something honest instead of crashing.
    expect(flattenToLeaves([])).toEqual([])
  })

  it('survives a malformed node without children', () => {
    const junk = [{ id: null, name: 'nameless' }] as unknown as CategoryNode[]
    expect(flattenToLeaves(junk)).toEqual([])
  })
})
