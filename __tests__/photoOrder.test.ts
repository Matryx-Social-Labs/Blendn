import { inSlotOrder, moveInto, moveItem, reordered, slotAt, slotXY } from '../lib/photoOrder'

const GRID = { itemSize: 100, gap: 8, columns: 3 }

describe('slots', () => {
  it('lays out row by row', () => {
    expect(slotXY(0, GRID)).toEqual({ x: 0, y: 0 })
    expect(slotXY(2, GRID)).toEqual({ x: 216, y: 0 })
    expect(slotXY(3, GRID)).toEqual({ x: 0, y: 108 })
    expect(slotXY(4, GRID)).toEqual({ x: 108, y: 108 })
  })

  it('finds the slot under a dragged tile’s centre, inside the photos there are', () => {
    expect(slotAt(50, 50, GRID, 5)).toBe(0)
    expect(slotAt(160, 50, GRID, 5)).toBe(1)
    expect(slotAt(160, 160, GRID, 5)).toBe(4)
    // Off the end of the list or the grid: the last photo's slot, the first's.
    expect(slotAt(300, 160, GRID, 4)).toBe(3)
    expect(slotAt(-40, -40, GRID, 4)).toBe(0)
    expect(slotAt(500, 500, GRID, 4)).toBe(3)
  })
})

describe('making room', () => {
  it('moves a tile later and slides the ones it passes back', () => {
    expect(moveInto([0, 1, 2, 3], 0, 2)).toEqual([2, 0, 1, 3])
  })
  it('moves a tile earlier and slides the ones it passes forward', () => {
    expect(moveInto([0, 1, 2, 3], 3, 1)).toEqual([0, 2, 3, 1])
  })
  it('is the same list for the slot it is already in, and never edits its input', () => {
    const before = [0, 1, 2]
    expect(moveInto(before, 1, 1)).toEqual([0, 1, 2])
    moveInto(before, 0, 2)
    expect(before).toEqual([0, 1, 2])
  })
  it('keeps every slot used exactly once', () => {
    const next = moveInto([2, 0, 1, 3, 4], 4, 0)
    expect([...next].sort()).toEqual([0, 1, 2, 3, 4])
  })
})

describe('the order a drag ends in', () => {
  it('puts the photos where the slots say', () => {
    expect(inSlotOrder(['a', 'b', 'c'], [2, 0, 1])).toEqual(['b', 'c', 'a'])
  })
  it('writes nothing when nothing moved', () => {
    expect(reordered([0, 1, 2])).toBe(false)
    expect(reordered([1, 0, 2])).toBe(true)
  })
})

describe('moving one photo', () => {
  it('moves it, keeps the rest in order, and never edits the list', () => {
    const list = ['a', 'b', 'c', 'd']
    expect(moveItem(list, 3, 0)).toEqual(['d', 'a', 'b', 'c'])
    expect(moveItem(list, 0, 1)).toEqual(['b', 'a', 'c', 'd'])
    expect(list).toEqual(['a', 'b', 'c', 'd'])
  })
  it('does nothing for a place that is not there', () => {
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], -1, 0)).toEqual(['a', 'b'])
  })
})
