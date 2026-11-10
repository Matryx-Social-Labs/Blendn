/**
 * A screen that draws a skeleton crosses to its content (DS #17, motion audit M8): `useSkeletonCrossfade` with its
 * result on the loaded body's `entering` (or a cell's, where the skeleton is a list's empty slot), or an arrival of the
 * screen's own that the audit read as one. A skeleton that is swapped for content in one frame is a hard cut.
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..')
const files = (dir: string): string[] =>
  readdirSync(join(ROOT, dir)).flatMap((f) => {
    const p = join(dir, f)
    return statSync(join(ROOT, p)).isDirectory() ? files(p) : /\.tsx$/.test(f) ? [p] : []
  })
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/** Screens whose content already arrives its own way after the skeleton: the token that does it. */
const OWN_ARRIVAL: Record<string, string> = {
  'app/(tabs)/chat.tsx': 'FadeInUp',
  'app/(tabs)/events.tsx': 'FadeInUp',
  'app/(tabs)/going.tsx': 'FadeInUp',
  'app/(tabs)/profile.tsx': 'FadeInUp',
  'app/board/[eventId].tsx': 'riseIn',
  'app/f/[token].tsx': 'FadeInUp',
  'app/rate/[eventId].tsx': 'riseIn',
  'app/offer/[id].tsx': 'SKELETON_OUT',
}

/** A spinner or a "Loading…" line rather than a skeleton, the audit's M8 all the same. */
const NOT_A_SKELETON = ['app/plus-manage.tsx', 'app/crews/invite/[crewId].tsx']

/** The crossfade is computed and put on an `entering`: a hook whose result goes nowhere fades nothing. */
const crossfades = (s: string) => {
  const name = /const (\w+) = useSkeletonCrossfade\(/.exec(s)?.[1]
  return !!name && new RegExp(`entering=\\{[^}]*\\b${name}\\b`).test(s)
}

it('every screen that draws a skeleton crosses to its content', () => {
  const cut = files('app')
    .filter((p) => /<[A-Za-z]*Skeleton[A-Za-z]*[\s/>]/.test(src(p)))
    .filter((p) => (OWN_ARRIVAL[p] ? !src(p).includes(OWN_ARRIVAL[p]) : !crossfades(src(p))))
  expect(cut).toEqual([])
})

it('the spinner and loading-line screens the audit named cross too', () => {
  expect(NOT_A_SKELETON.filter((p) => !crossfades(src(p)))).toEqual([])
})
