/*
 * Distances set in Geist Mono go through MonoRun (DS-09 leftover, the merge report): a Geist Mono space is a full cell, so
 * "1.2 km" set bare read "1.2  km". Through MonoRun the space is the brand face.
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { render, screen } from '@testing-library/react-native'

import { EventCard } from '../components/ds/EventCard'
import { SetList } from '../components/pulse/SetList'
import type { BlendnEvent } from '../lib/api'
import { FONT_FAMILY } from '../lib/design/tokens'
import { monoRunSpaces } from './helpers/ax'

const BRAND_SPACE = [FONT_FAMILY.brand[500]]

it('a Nearby row’s distance column', async () => {
  await render(<EventCard kind="row" lead="distance" title="Vinyl Night" time="9 PM" venue="Toit" distance="1.2 km" testID="e" />)
  expect(monoRunSpaces(screen.toJSON() as never, '1.2 km', FONT_FAMILY.mono[700])).toEqual(BRAND_SPACE)
})

it('a set list row’s distance', async () => {
  const start = new Date(Date.now() + 3_600_000).toISOString()
  const event = { id: 'a', title: 'Vinyl Night', venue_name: 'Toit', start_time: start, end_time: start, distance: 2.9, going_count: 0 } as unknown as BlendnEvent
  await render(<SetList events={[event]} now={Date.now()} withDistance onPress={jest.fn()} />)
  expect(monoRunSpaces(screen.toJSON() as never, '2.9 km', FONT_FAMILY.mono[500])).toEqual(BRAND_SPACE)
})

/** Every .tsx under a folder. */
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? sources(path) : path.endsWith('.tsx') ? [path] : []
  })

it('no Geist Mono text anywhere draws a distance bare (Places, the venue page and hero, the cards)', () => {
  const root = join(__dirname, '..')
  const bare = ['app', 'components']
    .flatMap((dir) => sources(join(root, dir)))
    .filter((file) => /FONT_FAMILY\.mono\[\d+\][^<]*>\s*\{distance\}\s*<\/Text>/.test(readFileSync(file, 'utf8')))
    .map((file) => file.slice(root.length + 1))
  expect(bare).toEqual([])
})
