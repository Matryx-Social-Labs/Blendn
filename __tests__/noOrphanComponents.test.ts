import { readFileSync, readdirSync, statSync } from 'fs'
import { join, basename, dirname } from 'path'

/**
 * Every component reaches a real screen.
 *
 * ## Why this exists
 *
 * Five times in this codebase something was built, reviewed, merged — and never
 * called:
 *
 *   `renderFeaturedRow`   the frame-accurate Featured row, no caller, while six
 *                         older sections that were not in any frame still ran
 *   `likeAtEvent`         the like API with a queue and three retries, no caller
 *   `handleCheckOut`      optimistic, rolled back, deduped, no caller
 *   `RoomVisibilityBanner` one of three safeguards making named rooms safe at
 *                         all, rendered nowhere
 *   `components/scene/*`  the entire Scene rebuild, reachable only from the
 *                         dev-only preview harness while `/event/[id]` kept
 *                         rendering the old screen
 *
 * The last one is the reason this file exists. It is invisible to every other
 * check: the code compiles, the tests pass, the harness screenshot looks right,
 * and the app ships the old screen. Someone opened the preview, saw the new
 * design, and reasonably concluded it had shipped.
 *
 * ## What counts as reachable
 *
 * An importer that is **not** the preview harness. `app/preview/` is dev-only
 * and allow-listed behind `__DEV__` in `app/_layout.tsx`, so being imported
 * there is exactly the state this test is looking for, not a defence against it.
 */

const ROOT = join(__dirname, '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) out.push(full)
  }
  return out
}

/**
 * Components that are knowingly unreachable, and why.
 *
 * **An entry here is a debt, not a dispensation.** It says "this is built and
 * not wired, and somebody decided that on purpose today" — which is the state
 * the Scene was in for a week while nobody knew.
 */
const KNOWN_ORPHANS: Record<string, string> = {
  /*
   * It held the three Scene files while the event route still rendered
   * the old screen. The render swap closed that, so the entries went with it —
   * which is the lifecycle an entry here is supposed to have.
   *
   * The redesign's primitives, below, are built ahead of their screens on
   * purpose (Phase 1, the foundation: no screen changes). Each entry goes with
   * the first screen that adopts it.
   */
  'Material.tsx': 'redesign Phase 1 foundation; the tab bar adopts it first (DESIGN-BRIEF §5.3), after the native rebuild that adds expo-glass-effect',
  'GradientFill.tsx': 'redesign Phase 1 foundation; the primary button and the centre disc adopt it with their redesign (§4.3, §11)',
  'Creature.tsx': 'redesign P5 set (ROUND3 B7); the pseudonym discs (Face, ChatBubble, Banter, Room info, the profile hero) move to it from the emoji with their redesign',
  'VenuePlate.tsx': 'redesign P5 set; the art for a place with no next event (Places tiles and rows, the venue hero) adopts it with the Places redesign',
  'Disc.tsx': 'the redesign centre button (§11), built ahead of its slot; Flow 4 swaps it in for RoomButton in app/(tabs)/_layout.tsx',
  'DiscMark.tsx': 'the monogram drawn from its vector; on a screen with the disc (Flow 4), later the splash and the Live Activity (§11.6)',
  /* The P0 system components (ROUND3 B4), built ahead of their flows; each goes with the first flow that adopts it. */
  'Avatar.tsx': 'redesign P0 component; adopted with the Room and People flows (ROUND3 B4, D · 4)',
  'Banner.tsx': 'redesign P0 component; adopted with the Room (VisibilityBanner) and the system banners (ROUND3 B4)',
  'Button.tsx': 'redesign P0 component; every redesigned flow adopts it for its actions (ROUND3 B4, §12)',
  'IconButton.tsx': 'redesign P0 component; adopted with the first redesigned top bar (ROUND3 B4)',
  'Loader.tsx': 'redesign P0 component; the morphing loader replaces the spinners flow by flow (ROUND3 B4, motion #24)',
  'Sheet.tsx': 'redesign P0 component; replaces ActionTray flow by flow (ROUND3 B4)',
  'SettingsRow.tsx': 'redesign P0 component; adopted with the Settings flow (ROUND3 B4, D · 7)',
  'StateScreen.tsx': 'redesign P0 component; replaces LoadError and the empty states flow by flow (ROUND3 B4)',
  'ds/Toast.tsx': 'redesign P0 component; the toast provider (components/Toast.tsx) moves to it with its first redesigned flow (ROUND3 B4)',
  /* The P1 inputs (ROUND3 B4), built ahead of their flows; each goes with the first flow that adopts it. */
  'TextField.tsx': 'redesign P1 input (TextField, TextArea); adopted with sign-in and onboarding (Flows 1–2), then every form (ROUND3 B4)',
  'DateField.tsx': 'redesign P1 input; the onboarding basics step (date of birth) adopts it (Flow 2, ROUND3 B4)',
  'SearchField.tsx': 'redesign P1 input; adopted with the Pulse, the city sheet and the Banter (Flows 3, 5)',
  'Chip.tsx': 'redesign P1 input (Chip, InterestChip); adopted with onboarding interests, the Pulse filters and the profile (Flows 2, 3, 6)',
  'Toggle.tsx': 'redesign P1 input; drawn by SettingsRow (itself on this ledger), so it reaches a screen with the Settings flow (D · 7)',
  'SegmentedControl.tsx': 'redesign P1 input; the sign-in screen adopts it (Flow 1, ROUND3 B4)',
  'RadioCard.tsx': 'redesign P1 input; adopted with event preferences (Anonymous / Named) and the Board composer (Flows 3, 4)',
  'LookingForCard.tsx': 'redesign P1 input; the onboarding preferences step adopts it in place of LookingForCards (Flow 2)',
  'Stepper.tsx': 'redesign P1 input; the Board composer’s Spaces adopts it (Flow 4)',
  'ProgressBar.tsx': 'redesign P1 input; the onboarding header adopts it (Flow 2)',
  'TabBar.tsx': 'redesign P1 chrome; replaces the tab bar in app/(tabs)/_layout.tsx with the disc in Flow 4 (§11, §13)',
  'TopBar.tsx': 'redesign P1 chrome; every pushed screen adopts it with its redesign (Flows 6, 7, 10)',
  'MonoFamily.tsx': 'redesign P1 marks (Badge, PresenceDot, LivePill, TimeBadge, Price); adopted with the Pulse, the Banter and Blend’n+ (Flows 3, 5, 12)',
  /* P5, sets and moments (ROUND3 B4), built ahead of their flows; each goes with the first flow that adopts it. */
  'Orbs.tsx': 'redesign L0 backdrop (§4, motion #22, #53); the brand screens (landing, onboarding, the Blend’n overlay) and the feeds adopt it with their redesign',
  'Grain.tsx': 'redesign L0 grain tile; laid over the orbs wherever a redesigned screen draws them',
  'CrewEmblem.tsx': 'redesign P5 crew emblem (§21.3); replaces CrewParts’ emoji tile with the Crews redesign (Flow 10)',
  'MomentStage.tsx': 'the stage the P5 moments share; goes with the first of them a flow adopts',
  'MomentMatch.tsx': 'redesign P5 moment (#11, D · 4.4); replaces components/blendn/MatchMoment.tsx with the Room redesign (Flow 4)',
  'MomentBlend.tsx': 'redesign P5 moment (Flow 10.8); the crew like that makes a Blend opens it with the Crews redesign',
  'MomentReady.tsx': 'redesign P5 moment (Flow 2); /onboarding/ready plays it on the server’s yes with the onboarding redesign',
  'MomentPour.tsx': 'redesign P5 moment (#9); the check-in success in the Blend’n overlay, with the VenuePass redesign (Flow 4)',
  'MomentRecap.tsx': 'redesign P5 moment (#43); replaces components/blendn/RoomRecap.tsx with the Room redesign (Flow 4)',
}

const sources = walk(join(ROOT, 'app'))
  .concat(walk(join(ROOT, 'components')))
  .concat(walk(join(ROOT, 'lib')))

const componentFiles = walk(join(ROOT, 'components')).filter((f) => f.endsWith('.tsx'))

/**
 * A component's ledger key, and the tail an import of it ends with: its file
 * name, or `dir/file` when another component shares the name
 * (`components/Toast.tsx` and `components/ds/Toast.tsx`), so an import of one
 * does not count as wiring the other.
 */
function key(full: string) {
  const file = basename(full)
  return componentFiles.filter((f) => basename(f) === file).length > 1 ? `${basename(dirname(full))}/${file}` : file
}
const importsOf = (file: string) => new RegExp(`['"][^'"]*/${file.replace(/\.tsx$/, '')}['"]`)

/*
 * Importers that are not a screen: the preview harness, and a component on the
 * ledger — `VenuePlate` drawing an `<Icon>` puts no Icon on a screen, and
 * counting it would read Icon's entry as stale while nothing ships either.
 */
const nonPreview = sources.filter((f) => !f.includes(`${'app'}/preview/`) && !Object.hasOwn(KNOWN_ORPHANS, key(f)))

describe('no component is reachable only from the preview harness', () => {
  it.each(componentFiles.map((f) => [f.replace(`${ROOT}/`, ''), f]))(
    '%s reaches a real screen',
    (rel, full) => {
      const importers = nonPreview.filter((f) => f !== full && importsOf(key(full)).test(readFileSync(f, 'utf8')))

      if (importers.length > 0) return

      const reason = KNOWN_ORPHANS[key(full)]
      if (reason) {
        // Recorded debt. The message is the ledger entry, so a reader who hits
        // this sees the decision rather than an unexplained allowance.
        expect(reason.length).toBeGreaterThan(20)
        return
      }

      throw new Error(
        `${rel} has no importer outside app/preview/.\n\n` +
          `Either wire it to a real screen, delete it, or add it to KNOWN_ORPHANS ` +
          `with the reason and the plan. A component reachable only from the ` +
          `harness ships as a design nobody sees.`
      )
    }
  )
})

describe('the orphan ledger stays honest', () => {
  it('lists nothing that is actually wired', () => {
    /*
     * An entry that has quietly become reachable is worse than no entry: it
     * reads as "still not wired" to anybody skimming, so the real work looks
     * undone and gets done twice.
     */
    for (const file of Object.keys(KNOWN_ORPHANS)) {
      const importers = nonPreview.filter((f) => !f.endsWith(`/${file}`) && importsOf(file).test(readFileSync(f, 'utf8')))
      expect({ file, importers: importers.map((f) => f.replace(`${ROOT}/`, '')) }).toEqual({
        file,
        importers: [],
      })
    }
  })

  it('names a file that exists', () => {
    // A stale entry silently disables the check for a name nothing matches.
    const present = new Set(componentFiles.map(key))
    for (const file of Object.keys(KNOWN_ORPHANS)) expect(present.has(file)).toBe(true)
  })
})

describe('docs a comment points at actually exist', () => {
  /*
   * `docs/SCENE.md` was cited in four places for a week before it existed.
   * Every reference sent a designer to a 404, which is worse than no reference:
   * it reads as "the decision is written down somewhere" when it is not.
   */
  const sources = walk(join(ROOT, 'app'))
    .concat(walk(join(ROOT, 'components')))
    .concat(walk(join(ROOT, 'lib')))
    .concat(walk(join(ROOT, '__tests__')))

  it('every docs/*.md named in the codebase is a real file', () => {
    const missing = new Set<string>()
    for (const file of sources) {
      const src = readFileSync(file, 'utf8')
      /*
       * `blendn-admin/docs/…` is skipped, not resolved.
       *
       * Three docs a comment here points at -- CHECKIN, MEDIA, DESIGN_HANDOFF
       * -- live in the API repo, and the reference was bare `docs/…` so it read
       * as a file in *this* repo. Qualifying them is the fix; checking them
       * from here is not, because the sibling checkout may not exist on a given
       * machine and a test that depends on that is a flake.
       */
      for (const m of src.matchAll(/(?<!blendn-admin\/)docs\/([A-Za-z0-9_.-]+\.md)/g)) {
        try {
          readFileSync(join(ROOT, 'docs', m[1]), 'utf8')
        } catch {
          missing.add(`${m[1]} (cited in ${file.replace(`${ROOT}/`, '')})`)
        }
      }
    }
    expect([...missing]).toEqual([])
  })
})
