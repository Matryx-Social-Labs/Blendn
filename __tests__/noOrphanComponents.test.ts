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
  'CrewEmblem.tsx': 'redesign P5 crew emblem (§21.3); replaces CrewParts’ emoji tile with the Crews redesign (Flow 10)',
  'MomentMatch.tsx': 'redesign P5 moment (#11, D · 4.4); replaces components/blendn/MatchMoment.tsx with the Room redesign (Flow 4)',
  'MomentBlend.tsx': 'redesign P5 moment (Flow 10.8); the crew like that makes a Blend opens it with the Crews redesign',
  'MomentReady.tsx': 'redesign P5 moment (Flow 2); /onboarding/ready plays it on the server’s yes with the onboarding redesign',
  'MomentRecap.tsx': 'redesign P5 moment (#43); replaces components/blendn/RoomRecap.tsx with the Room redesign (Flow 4)',
  /* The P3 chat and gesture components (ROUND3 B4), built ahead of Flow 5; the room and the DM adopt them, the Banter takes SwipeRow. */
  'ds/ChatBubble.tsx': 'redesign P3 component; replaces components/chat/ChatBubble.tsx (and SwipeToReply) in the room and the DM with Flow 5 (ROUND3 B4, D 5.1–5.2)',
  'ds/BroadcastNotice.tsx': 'redesign P3 component; replaces components/chat/BroadcastNotice.tsx in the room with Flow 5, sponsored video included (ROUND3 D 5.5)',
  'ds/SystemNotice.tsx': 'redesign P3 component; SystemLine and SystemNotice replace components/chat/SystemNotice.tsx and the guidelines banner with Flow 5 (ROUND3 B4)',
  'ds/TypingIndicator.tsx': 'redesign P3 component; replaces components/chat/TypingIndicator.tsx in the room and the DM with Flow 5 (motion #14)',
  'Composer.tsx': 'redesign P3 component; replaces components/chat/ChatComposer.tsx and ReplyBar with Flow 5, every lock in server copy (ROUND3 C2–C4, D 5.3–5.4)',
  'ContextMenu.tsx': 'redesign P3 component; the long-press menu replaces the room and DM message sheets with Flow 5 (ROUND3 D 5.2, motion #36)',
  'ReactionBar.tsx': 'redesign P3 component; replaces components/chat/ReactionPicker.tsx and the bubble reaction chips with Flow 5 (motion #37)',
  'ReplyPreview.tsx': 'redesign P3 component; the quote in a bubble and above the composer, adopted with ChatBubble and Composer in Flow 5',
  'ReceiptMark.tsx': 'redesign P3 component; the DM receipt, adopted with ChatBubble in the DM (Flow 5)',
  'UnreadDivider.tsx': 'redesign P3 component; UnreadDivider and DayPill replace the DM divider and the day separators with Flow 5',
  'PollBubble.tsx': 'redesign P3 component; the organiser poll in the room, adopted when the room renders polls (Flow 15 #8)',
  'SwipeRow.tsx': 'redesign P3 component; the Banter rows adopt it with the Banter redesign (ROUND3 D 5.11)',
  'ImageViewer.tsx': 'redesign P3 component; opens DM photos once they ship (ROUND3 D 5.9, motion #33)',
  'CoachMark.tsx': 'redesign P3 component; the first coach mark (the centre button, the reveal bar, the swipe) adopts it (ROUND3 B4)',
  /* The P2 events and people (ROUND3 B4), built ahead of their flows; each goes with the first flow that adopts it. */
  'AmenityTile.tsx': 'redesign P2 (AmenityTile, AmenityGrid); the Scene bento and the venue page’s Good to know adopt it in place of SceneAmenity (Flow 3)',
  'EventCard.tsx': 'redesign P2 (hero, compact, row); the Pulse, Going, search and the Scene’s related events adopt it (Flow 3)',
  'ds/DayHeading.tsx': 'redesign P2; replaces components/ui/DayHeading on the Pulse’s Upcoming and Going (Flow 3)',
  'Facepile.tsx': 'redesign P2 (Facepile, FaceMark); the Room’s hero stack adopts it (Flow 4)',
  'GridFace.tsx': 'redesign P2; the Room’s Everyone here grid and People from tonight adopt it in place of RoomSections’ GridFace (Flow 4)',
  'ds/HoldToConfirm.tsx': 'redesign P2; replaces components/blendn/HoldToConfirm with the VenuePass and the Go Live hold (Flows 4, 11)',
  'MeetNextCard.tsx': 'redesign P2; the Room’s Meet next row adopts it (Flow 4)',
  'MapCard.tsx': 'redesign P2 (MapCard, MapPin, MapCluster); the Scene and venue page’s map band, then the home map’s pins (Flows 3, 11)',
  'ds/PersonCard.tsx': 'redesign P2; replaces components/blendn/PersonCard from every entry point (Flow 4, R3-D4)',
  'ds/RollingNumber.tsx': 'redesign P2; the Room’s count and the recap tiles adopt it in place of components/profile/RollingNumber (Flow 4)',
  'RevealBar.tsx': 'redesign P2; the anonymous DM adopts it (Flow 5)',
  'ds/SectionHeader.tsx': 'redesign P2; replaces components/pulse/SectionHeader and the Room’s and profile’s heading rows (Flows 3, 4, 6, 10)',
  'ds/TimeRing.tsx': 'redesign P2; replaces components/blendn/TimeRing on your face in the Room (Flow 4)',
  'TonightCard.tsx': 'redesign P2; Tonight’s deck adopts it in place of TonightView’s EventDeck (Flow 4)',
  'VenuePass.tsx': 'redesign P2 (VenuePass, DoorCode); Tonight’s pass (Flow 4) and the offer’s door pass (Flow 13, ROUND3 G3) adopt it',
  /* P4, the rest of R2-D0 (ROUND3 B4), built ahead of Flows 9–16; each goes with the first flow that adopts it. */
  'NotificationRow.tsx': 'redesign P4 component (NotificationRow, NotificationVisual); replaces the bell rows in app/notifications with the Notifications redesign (Flow 9)',
  'InAppBanner.tsx': 'redesign P4 component; the in-app push banner and the wave banner (R3 D 9.1) adopt it with Flow 9 and the Room redesign (Flow 4)',
  'CountTicks.tsx': 'redesign P4 component; drawn by CrewCard and CrewStrip (both on this ledger), so it reaches a screen with the Crews redesign (Flow 10)',
  'CrewCard.tsx': 'redesign P4 component (CrewCard, CrewRow); replaces CrewParts’ CrewCardView and the crew rows with the Crews redesign (Flow 10)',
  'CrewStrip.tsx': 'redesign P4 component; the pass success and the Room adopt it with the Crews redesign (Flow 10 · 10.6)',
  'LikingAsChip.tsx': 'redesign P4 component; beside “Crews here” in the Room with the Crews redesign (Flow 10 · 10.7)',
  'RevealSheet.tsx': 'redesign P4 component (RevealSheet, RevealSide); the Blend room adopts it with the Crews redesign (Flow 10 · 10.9)',
  'GoLiveSheet.tsx': 'redesign P4 component; replaces the Go Live sheet on the venue page with the Places-live redesign (Flow 11 · 11.2)',
  'SessionSheet.tsx': 'redesign P4 component; opens from the live pill with the Places-live redesign (Flow 11 · 11.3)',
  'ExpiryPrompt.tsx': 'redesign P4 component (ExpiryPrompt, NotLiveNotice); replaces LiveAtVenue’s expiry prompt with the Places-live redesign (Flow 11 · 11.4)',
  'OverlapLine.tsx': 'redesign P4 component; the PersonCard and crew card face line adopt it with Matching v2 in the Room (Flow 14 · 14.1)',
  'AchievementBadge.tsx': 'redesign P4 component; Me’s badges card and the room cards adopt it with Matching v2 (Flow 14 · 14.5)',
  'TonightSheet.tsx': 'redesign P4 component; the contextual Blend’n+ sheet the client builds next (ROUND3 G2, Flow 12 · 12.1)',
  'PlanCard.tsx': 'redesign P4 component (PlanCard, NightPassRow, PlanList); replaces the plan rows in app/plus.tsx with the Blend’n+ redesign (Flow 12)',
  'NeverForSalePanel.tsx': 'redesign P4 component; the Blend’n+ page adopts it before the plans (Flow 12 · 12.2)',
  'ManageStatusRow.tsx': 'redesign P4 component; Manage (Settings › Blend’n+) adopts it with the Blend’n+ redesign (Flow 12 · 12.3)',
  'OfferCard.tsx': 'redesign P4 component; replaces the offer screen’s card with the Regulars redesign and the Passes & offers list (Flow 13, ROUND3 G3)',
  'ShareSheet.tsx': 'redesign P4 component; replaces the plain-text share with the share tray once links ship (Flow 16 · 16.1)',
  'LinkPreviewCard.tsx': 'redesign P4 component; drawn by ShareSheet (on this ledger); the OG image itself is the server’s (Flow 16 · 16.2)',
  'StoryCard.tsx': 'redesign P4 component; the Instagram Story share adopts it with a view-capture module (Flow 16 · 16.3)',
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
/**
 * Whether `importer` imports the component keyed `file`. A `dir/File` key also
 * matches a bare `./File` from a file in that same directory: `TonightView`'s
 * `./HoldToConfirm` is `blendn/HoldToConfirm`, not `ds/HoldToConfirm`.
 */
function imports(importer: string, file: string) {
  const src = readFileSync(importer, 'utf8')
  const name = file.replace(/\.tsx$/, '')
  if (new RegExp(`['"][^'"]*/${name}['"]`).test(src)) return true
  const [dir, base] = name.split('/')
  return !!base && basename(dirname(importer)) === dir && new RegExp(`['"]\\./${base}['"]`).test(src)
}

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
      const importers = nonPreview.filter((f) => f !== full && imports(f, key(full)))

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
      const importers = nonPreview.filter((f) => !f.endsWith(`/${file}`) && imports(f, file))
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
