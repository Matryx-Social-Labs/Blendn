import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * One place to edit a profile, and a Settings screen whose headings describe
 * what is under them.
 *
 * The app had **three doors to editing** — a row on the Me tab, a row at the
 * top of Settings, and a card above that row whose outer press went back to the
 * Me tab — plus a **second editor** at Settings → Discovery → "You and
 * matching", holding the five fields matching actually runs on.
 */

const ROOT = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const codeOnly = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')

describe('there is one profile editor', () => {
  it('edits the matching fields inside edit-profile', () => {
    const src = codeOnly(read('app/edit-profile.tsx'))
    expect(src).toContain('<MatchingFields')
    expect(src).toContain('YOU AND MATCHING')
  })

  it('shows what you already chose', () => {
    /*
     * The old screen read only name and age, so every chip opened blank and
     * "networking" was indistinguishable from "nothing chosen". The fields were
     * always in the payload for your own profile — the route spreads
     * `selfProfileFields`, the whole row minus `date_of_birth` — and were
     * simply never read.
     */
    const src = codeOnly(read('app/edit-profile.tsx'))
    expect(src).toContain('p2?.intent_default')
    expect(src).toContain('setMatchingAtLoad')
  })

  it('sends a matching field only when it changed', () => {
    /*
     * A blanket send writes `intent_default: []` for anyone who opened the
     * screen and saved without touching the chips, which silently switches off
     * their matching.
     */
    const src = codeOnly(read('app/edit-profile.tsx'))
    expect(src).toContain('if (!same(intents, matchingAtLoad.intents))')
  })

  it('stops writing the dating fields once dating is unticked', () => {
    /*
     * Gender and orientation are special-category data. Untick dating and they
     * stop being asked, so continuing to write them would keep that data
     * current for somebody who just opted out of it.
     */
    expect(codeOnly(read('app/edit-profile.tsx'))).toContain("if (intents.includes('dating'))")
  })

  it('shares one field block with onboarding', () => {
    // Two copies would drift into asking the same question differently.
    for (const screen of ['app/about-you.tsx', 'app/edit-profile.tsx']) {
      expect(codeOnly(read(screen))).toContain('<MatchingFields')
    }
  })

  it('leaves no second door in Settings', () => {
    const src = codeOnly(read('app/settings.tsx'))
    expect(src).not.toContain('about-you')
    expect(src).not.toContain('/edit-profile')
    // And no profile card above the list, whose outer press went to the Me tab.
    expect(src).not.toContain('profileCard')
  })
})

describe('every Settings heading describes what is under it', () => {
  const SETTINGS = () => codeOnly(read('app/settings.tsx'))

  it('files blocked users under Safety, not Account', () => {
    /*
     * Blocking somebody is the most consequential safety action in the product,
     * and it used to sit under "Account" — further from Safety than two links
     * to a web page.
     */
    const src = SETTINGS()
    const safetyAt = src.indexOf("header: 'Safety'")
    const blockedAt = src.indexOf('Blocked users')
    const aboutAt = src.indexOf("header: 'About'")
    expect(safetyAt).toBeGreaterThan(-1)
    expect(blockedAt).toBeGreaterThan(safetyAt)
    expect(blockedAt).toBeLessThan(aboutAt)
  })

  it('has no section called Discovery', () => {
    // It mixed a navigation row with three toggles, and the row has moved.
    expect(SETTINGS()).not.toContain("header: 'Discovery'")
  })
})

describe('the irreversible row is hard to hit by accident', () => {
  const SETTINGS = () => codeOnly(read('app/settings.tsx'))

  it('puts Delete account last, under its own spaced header', () => {
    /*
     * It used to sit one row under Sign out, both red, both in the first
     * section, at the top of the screen where the thumb lands. One is routine
     * and reversible; the other destroys the account.
     */
    const src = SETTINGS()
    expect(src).toContain("header: 'Danger zone', spaced: true")
    expect(src.indexOf('Delete account')).toBeGreaterThan(src.indexOf("header: 'Account'"))
  })

  it('reserves the danger colour for it alone', () => {
    // Sign out is no longer red. One red row is what makes red mean something.
    const src = SETTINGS()
    expect(src.match(/danger: true/g)).toHaveLength(1)
  })

  it('actually spaces the header it marks', () => {
    // A `spaced` flag the renderer ignores is worse than no flag.
    const src = SETTINGS()
    expect(src).toContain('item.spaced && styles.sectionHeaderSpaced')
    expect(src).toContain('sectionHeaderSpaced: { marginTop: 40 }')
  })
})

describe('the editor is on the app’s palette', () => {
  it('has left APP_COLORS, and so has its photo manager', () => {
    /*
     * `PhotoManager` was written for a *light* UI and never updated: `#F8FAFC`
     * panels, `#1F2937` text, a `#7C3AED` purple accent. On this screen that
     * rendered "Add Photo" as a white box with a purple dashed border, and the
     * "Photos (0/6)" heading as navy on near-black.
     */
    expect(read('app/edit-profile.tsx')).not.toContain('APP_COLORS')
    const pm = read('components/PhotoManager.tsx')
    expect(pm).not.toMatch(/#7C3AED|#F8FAFC|#1F2937|#F3F4F6/)
  })

  it('fills a selected chip rather than lightening it', () => {
    /*
     * On a card of a dozen chips, "which are on" has to be answerable at a
     * glance. The old pair was `rgba(255,255,255,0.06)` against
     * `rgba(255,255,255,0.16)` -- a 10% lightness step.
     */
    const src = codeOnly(read('components/profile/MatchingFields.tsx'))
    expect(src).toContain('chipOn: { backgroundColor: EMBER.accent')
    // Dark on warm: white on the accent fails contrast.
    expect(src).toContain('EMBER.onGradientChip')
  })
})
