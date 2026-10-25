/**
 * Every bar's circle row starts at the safe-area top (Flow 1, 3, 4, 6 and 7 frames: `top: 62` on the 62 pt-inset iPhone). A
 * bar that sat at `insets.top + SPACE.sm` was 8 pt low. Source shape for the bars the render tests do not draw; the DS
 * TopBar and the ProfileBar have render tests beside this one (dsTopBar, profileHero).
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

const CHROME = [
  'components/ds/TopBar.tsx',
  'components/profile/ProfileBar.tsx',
  'components/scene/SceneBar.tsx',
  'components/onboarding/FormHeader.tsx',
  'components/onboarding/OnboardingScreen.tsx',
  'components/ds/ImageViewer.tsx',
  'components/scene/SceneLightbox.tsx',
  'components/ds/MomentRecap.tsx',
  'components/profile/PhotoViewer.tsx',
  'components/offer/OfferSections.tsx',
  'components/plus/PlusSections.tsx',
  'components/banter/BanterParts.tsx',
  'components/chat/ChatHeader.tsx',
  'components/blendn/BlendnScreen.tsx',
  'components/screens/EventDetailScreen.tsx',
  'app/rate/[eventId].tsx',
  'app/chat-info/[id].tsx',
  'app/venue/[id].tsx',
]

it.each(CHROME)('%s lays no chrome row at the inset plus a gap', (file) => {
  expect(read(file)).not.toMatch(/insets\.top\s*\+\s*SPACE\.(sm|xs)\b/)
})

it('the bars take their row top from lib/barGeometry, so there is one place to read', () => {
  // A screen that draws the DS TopBar has its row top from it (dsTopBar pins that), and needs no geometry of its own.
  for (const file of CHROME.filter((f) => !/components\/ds\/TopBar'/.test(read(f)))) {
    expect(read(file)).toMatch(/barTop|barHeight|barCircleBottom|BAR_BOTTOM/)
  }
})

it('Event preferences draws the DS TopBar (a ✕ and no heading) instead of a floating circle', () => {
  expect(read('app/event-preferences/[eventId].tsx')).toMatch(/<TopBar close state=\{bar\.state\}/)
})

it('the floating Pulse capsule and bell start at the top of their band, not centred in it', () => {
  expect(read('components/pulse/PulseTopBar.tsx')).toMatch(/floatingRow:[^\n]*alignItems: 'flex-start'/)
})

it('the Pulse band, the Me column and the hero pips are measured from the circles, not from a gap above them', () => {
  expect(read('app/(tabs)/profile.tsx')).toContain('barCircleBottom(insets.top')
  expect(read('components/profile/ProfileHeroStage.tsx')).toContain('barCircleBottom(insets.top')
})
