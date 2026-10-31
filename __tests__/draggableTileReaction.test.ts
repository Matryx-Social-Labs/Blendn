import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Tiles are keyed by photo, so a saved reorder gives a tile a new `index`. The reaction that follows `positions[index]`
 * must be rebuilt with it, or the dragged tile goes back to its old slot while the Main badge moves (seen on Android).
 * Reanimated's jest shim cannot run a reaction or move a shared value, so this pins the two lines, and the drive proves the behaviour.
 */
const src = readFileSync(join(__dirname, '../components/profile/DraggableTile.tsx'), 'utf8')

it('rebuilds the slot reaction when the tile index changes', () => {
  const reaction = src.slice(src.indexOf('useAnimatedReaction('), src.indexOf('const liftChanged'))
  expect(reaction).toMatch(/\[grid, index, reduceMotion\]/)
})

it('parks a re-indexed tile at its own home, not at positions[index] while positions still holds the old order', () => {
  const effect = src.slice(src.indexOf('useEffect('), src.indexOf('useAnimatedReaction('))
  expect(effect).toMatch(/x\.set\(home\.x\)/)
  expect(effect).not.toMatch(/positions\.get\(\)\[index\]/)
})
