#!/usr/bin/env node
/*
 * Writes assets/galaxy/remnant.json: the landing's last frame (variant B at END_AT), which Reduce Motion and the form
 * screens draw instead of running the physics. Rerun after any change to lib/galaxySim.ts:
 *   node scripts/galaxy-remnant.mjs
 * `__tests__/galaxySim.test.ts` fails when the committed file and the physics disagree.
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// Node 23.6+ strips the types and runs the module as is.
const { GALAXY_B, filmRemnant } = await import(join(root, 'lib/galaxySim.ts'))
const xy = filmRemnant()
writeFileSync(join(root, 'assets/galaxy/remnant.json'), `${JSON.stringify({ n: GALAXY_B.physics.stars, xy })}\n`)
console.log(`remnant: ${GALAXY_B.physics.stars} stars + 2 cores, ${xy.length} floats`)
