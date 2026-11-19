import { gridHeight, inSlotOrder, moveInto, moveItem, reordered, slotAt, slotRect, slotXY } from '../lib/photoOrder'

/* Board A 03 (Me + settings, owner approved 2026-11-18): the main photo 2fr wide over two rows, two slots 1fr beside it, gap 8; slots 4–6 under them. */
const GRID = { width: 308, gap: 8 }
// S = (308 − 8) / 3 = 100 wide; the board's top block is 240 tall, so a row is (240 − 8) / 2 = 116 (not square).

describe('slots', () => {
  it('the main spans two rows at 2fr, two slots stand beside it at 1fr', () => {
    expect(slotRect(0, GRID)).toEqual({ x: 0, y: 0, w: 200, h: 240 })
    expect(slotRect(1, GRID)).toEqual({ x: 208, y: 0, w: 100, h: 116 })
    expect(slotRect(2, GRID)).toEqual({ x: 208, y: 124, w: 100, h: 116 })
  })

  it('slots 4–6 sit under them, the first two halving the main’s width so every edge lines up', () => {
    expect(slotRect(3, GRID)).toEqual({ x: 0, y: 248, w: 96, h: 116 })
    expect(slotRect(4, GRID)).toEqual({ x: 104, y: 248, w: 96, h: 116 })
    expect(slotRect(5, GRID)).toEqual({ x: 208, y: 248, w: 100, h: 116 })
    expect(slotXY(5, GRID)).toEqual({ x: 208, y: 248 })
  })

  it('is two rows tall until a fourth slot shows, then three', () => {
    expect(gridHeight(3, GRID)).toBe(240)
    expect(gridHeight(4, GRID)).toBe(364)
  })

  it('finds the slot under a dragged tile’s centre, inside the photos there are', () => {
    expect(slotAt(100, 100, GRID, 5)).toBe(0)
    expect(slotAt(250, 50, GRID, 5)).toBe(1)
    expect(slotAt(250, 150, GRID, 5)).toBe(2)
    expect(slotAt(150, 300, GRID, 5)).toBe(4)
    // Over an empty slot or off the grid: the photo slot whose centre is nearest.
    expect(slotAt(250, 260, GRID, 4)).toBe(2)
    expect(slotAt(-40, -40, GRID, 4)).toBe(0)
    expect(slotAt(20, 400, GRID, 4)).toBe(3)
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
