import { readFileSync } from 'fs'
import { join } from 'path'

/** C0: Discovery's files draw from the design tokens, not the Liquid Ember palette or the deprecated MOTION_* names. */
const FILES = [
  'components/home/HomeShell.tsx',
  'components/pulse/PulseTopBar.tsx',
  'components/pulse/NotificationBell.tsx',
  'components/EventCover.tsx',
  'components/pulse/FeedMedia.tsx',
  'app/(tabs)/events.tsx',
  'app/(tabs)/going.tsx',
  'components/home/PlacesList.tsx',
  'components/scene/SceneSections.tsx',
  'app/rate/[eventId].tsx',
]

it.each(FILES)('%s has no EMBER and no MOTION_* name', (file) => {
  const code = readFileSync(join(__dirname, '..', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  expect(code).not.toMatch(/\bEMBER(_RADIUS)?\b/)
  expect(code).not.toMatch(/\bMOTION_(DURATION|EASING|STAGGER|SPRING)\b/)
})
