import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Tiles are keyed by photo, so a saved reorder gives a tile a new `index`. The reaction that follows `positions[index]`
 * must be rebuilt with it, or the dragged tile goes back to its old slot while the Main badge moves (seen on Android).
 * Reanimated's jest shim cannot run a reaction, so this pins the dependency list, and the drive proves the behaviour.
 */
it('rebuilds the slot reaction when the tile index changes', () => {
  const src = readFileSync(join(__dirname, '../components/profile/DraggableTile.tsx'), 'utf8')
  const reaction = src.slice(src.indexOf('useAnimatedReaction('), src.indexOf('const liftChanged'))
  expect(reaction).toMatch(/\[grid, index, reduceMotion\]/)
})
