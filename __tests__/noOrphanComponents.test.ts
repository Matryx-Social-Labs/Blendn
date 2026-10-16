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
  'VenuePlate.tsx': 'redesign P5 set; the art for a place with no next event (Places tiles and rows, the venue hero) adopts it with the Places redesign',
  /* The P0 system components (ROUND3 B4), built ahead of their flows; each goes with the first flow that adopts it. */
  'SettingsRow.tsx': 'redesign P0 component; adopted with the Settings flow (ROUND3 B4, D · 7)',
  /* The P1 inputs (ROUND3 B4), built ahead of their flows; each goes with the first flow that adopts it. */
  'DateField.tsx': 'redesign P1 input; the onboarding basics step (date of birth) adopts it (Flow 2, ROUND3 B4)',
  'SearchField.tsx': 'redesign P1 input; adopted with the Pulse, the city sheet and the Banter (Flows 3, 5)',
  'LookingForCard.tsx': 'redesign P1 input; the onboarding preferences step adopts it in place of LookingForCards (Flow 2)',
  'ProgressBar.tsx': 'redesign P1 input; the onboarding header adopts it (Flow 2)',
  /* P5, sets and moments (ROUND3 B4), built ahead of their flows; each goes with the first flow that adopts it. */
  'MomentReady.tsx': 'redesign P5 moment (Flow 2); /onboarding/ready plays it on the server’s yes with the onboarding redesign',
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
  'MapCard.tsx': 'redesign P2 (MapCard, MapPin, MapCluster); the Scene and venue page’s map band, then the home map’s pins (Flows 3, 11)',
  'RevealBar.tsx': 'redesign P2; the anonymous DM adopts it (Flow 5)',
  /* P4, the rest of R2-D0 (ROUND3 B4), built ahead of Flows 9–16; each goes with the first flow that adopts it. */
  'RevealSheet.tsx': 'redesign P4 component (RevealSheet, RevealSide); the Blend room adopts it with the Crews redesign (Flow 10 · 10.9)',
  'GoLiveSheet.tsx': 'redesign P4 component; replaces the Go Live sheet on the venue page with the Places-live redesign (Flow 11 · 11.2)',
  'SessionSheet.tsx': 'redesign P4 component; opens from the live pill with the Places-live redesign (Flow 11 · 11.3)',
  'ExpiryPrompt.tsx': 'redesign P4 component (ExpiryPrompt, NotLiveNotice); replaces LiveAtVenue’s expiry prompt with the Places-live redesign (Flow 11 · 11.4)',
  'OverlapLine.tsx': 'redesign P4 component; the PersonCard and crew card face line adopt it with Matching v2 in the Room (Flow 14 · 14.1)',
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
