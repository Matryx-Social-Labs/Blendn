/*
 * A sync keeps what the reader has scrolled back through.
 *
 * Every socket message — theirs, and the echo of your own send — and every
 * reconnect re-read a chat's newest page and put it in place of the list. The
 * older pages the reader had loaded went with it, the list shrank under them,
 * and the view jumped: on build 121 a reply sent from a little way up landed
 * out of sight, and a DM reopened after the background jumped a dozen rows
 * (driven 2026-09-28). Both chat screens merge now.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { mergeNewestPage } from '../lib/mergeNewestPage'

type M = { id: string; local?: boolean }
const m = (id: string, local = false): M => ({ id, local })
const merge = (held: M[], page: M[]) => mergeNewestPage(held, page, (x) => x.id, (x) => !!x.local)
const ids = (xs: M[]) => xs.map((x) => x.id)

describe('mergeNewestPage', () => {
  it('keeps the older pages above a page that overlaps them', () => {
    const held = [m('1'), m('2'), m('3'), m('4')]
    const out = merge(held, [m('3'), m('4'), m('5')])
    expect(ids(out.items)).toEqual(['1', '2', '3', '4', '5'])
    expect(out.keptOlder).toBe(true)
  })

  it("takes the page's copy of a message it carries — ticks and edits change", () => {
    const held = [m('1'), { id: '2', local: false, stale: true } as M]
    const out = merge(held, [m('2')])
    expect(out.items[1]).not.toHaveProperty('stale')
  })

  it('keeps a send still in flight or failed below the page, once', () => {
    const out = merge([m('1'), m('2'), m('tmp', true)], [m('2'), m('3')])
    expect(ids(out.items)).toEqual(['1', '2', '3', 'tmp'])
  })

  it('drops the local copy when the page already has it', () => {
    const out = merge([m('1'), m('tmp', true)], [m('1'), m('tmp')])
    expect(ids(out.items)).toEqual(['1', 'tmp'])
  })

  it('replaces the list when a whole page arrived in between — a gap nobody loaded', () => {
    const out = merge([m('1'), m('2')], [m('60'), m('61')])
    expect(ids(out.items)).toEqual(['60', '61'])
    expect(out.keptOlder).toBe(false)
  })

  it('is the page on first load', () => {
    const out = merge([], [m('1'), m('2')])
    expect(ids(out.items)).toEqual(['1', '2'])
    expect(out.keptOlder).toBe(false)
  })
})

describe('both chat screens merge a refresh', () => {
  const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')
  it.each([
    ['app', 'private-chat', '[conversationId].tsx'],
    ['app', 'chat', '[id].tsx'],
  ])('%s/%s/%s', (...p) => {
    expect(read(...p)).toMatch(/mergeNewestPage\(/)
  })
})
