import { namedList } from '../lib/namedList'

/**
 * Reading a list that the server renamed under it.
 *
 * `/categories` and `/conversations` used to answer a bare array as `data`.
 * They now answer `data.categories` / `data.conversations`, matching the other
 * eleven mobile list endpoints and giving `/conversations` — the surface most
 * likely to need paging — somewhere to put a cursor.
 *
 * ## Why both shapes are read, rather than just the new one
 *
 * A client build does not travel with a server version. Production and staging
 * run different releases, so a build can meet either shape, and the wrong guess
 * does not throw — it yields an empty array. `__tests__/categories.test.ts`
 * records what that costs: the interests screen once discarded 100% of this
 * exact response, showed "Couldn't load interests", and left onboarding
 * uncompletable for weeks while every screen looked fine.
 *
 * An empty list is the worst failure to ship because it reads as an answer.
 */
describe('namedList', () => {
  const rows = [{ id: 'a' }, { id: 'b' }]

  it('reads the wrapped shape', () => {
    expect(namedList({ success: true, data: { categories: rows } }, 'categories').data).toEqual(rows)
  })

  it('still reads a bare array from an older server', () => {
    expect(namedList({ success: true, data: rows }, 'categories').data).toEqual(rows)
  })

  it('does not invent a list when the key is missing', () => {
    // undefined, not []: the screens distinguish "no data" from "none yet",
    // and an empty array here would render "no conversations" over a failure.
    expect(namedList({ success: true, data: { other: rows } } as never, 'conversations').data)
      .toBeUndefined()
  })

  it('carries a failure through untouched', () => {
    const failed = { success: false, error: 'Unauthorized', errorCode: 'UNAUTHORIZED' }
    expect(namedList(failed, 'conversations')).toMatchObject({
      success: false,
      error: 'Unauthorized',
      errorCode: 'UNAUTHORIZED',
      data: undefined,
    })
  })
})
