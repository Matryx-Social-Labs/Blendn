/*
 * SCRUM-1001 M17 and M34: motion values written as numbers beside the tokens they stand for. Each row is a site the
 * audit named and the literal it had; the token is what it uses now. RED on dev at every row.
 *
 * Left alone on purpose (the audit says feel them on a device first): SwipeDeck's deal (250 ms delay + 620 ms, every
 * Tonight open) and the DM reveal's `REVEAL_MS = 700`.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const code = (path: string) =>
  readFileSync(join(__dirname, '..', path), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const SITES: ReadonlyArray<readonly [path: string, literal: RegExp, use: string]> = [
  ['components/motion/presence.ts', /duration\((?:150|120)\)|duration: (?:150|120)\b/, 'DURATION.quick'],
  ['components/motion/SwipeDeck.tsx', /duration: 550\b|dampingRatio/, 'SPRING.settle'],
  ['components/motion/SwipeDeck.tsx', /duration: 120\b/, 'DURATION.press'],
  ['components/motion/SwipeToDismiss.tsx', /duration: 220\b/, 'DURATION.base'],
  ['components/motion/SwipeToDismiss.tsx', /dampingRatio/, 'SPRING.fling'],
  ['components/motion/ZoomableImage.tsx', /dampingRatio/, 'SPRING.settle'],
  ['components/ds/CrewCard.tsx', /duration: 180\b/, 'DURATION.quick'],
  ['components/notifications/NewPill.tsx', /FADE_IN_MS = 120\b/, 'DURATION.quick'],
  ['components/blendn/BlendnScreen.tsx', /reduceMotion \? FadeIn :/, 'FadeIn.duration(REDUCE_MOTION.duration.base)'],
  ['components/crews/stepMotion.ts', /reduceMotion \? 200\b/, 'REDUCE_MOTION.duration.base'],
  ['components/profile/ProfileHeroPager.tsx', /PIP_MS = 160\b/, 'DURATION.quick'],
  ['components/profile/PhotoGridTile.tsx', /transition=\{200\}/, 'DURATION.base'],
  ['components/cityArt/CityArtCard.tsx', /pressedScale=\{0\.97\}/, 'PRESS.scale'],
]

it.each(SITES)('%s has no %s: it uses %s', (path, literal, use) => {
  const src = code(path)
  expect(src).not.toMatch(literal)
  expect(src).toContain(use)
})
