import { existsSync, readFileSync } from 'fs'
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
    expect(src).toContain('title="You and matching"')
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
    expect(src).toContain('if (!same(savedIntents, matchingAtLoad.intents))')
  })

  it('stops writing the dating fields once dating is unticked', () => {
    /*
     * Gender and orientation are special-category data. Untick dating and they
     * stop being asked, so continuing to write them would keep that data
     * current for somebody who just opted out of it.
     */
    expect(codeOnly(read('app/edit-profile.tsx'))).toContain("if (savedIntents.includes('dating'))")
  })

  it('edits the matching fields in one place', () => {
    // About you was the second copy; it was unreachable and is gone.
    expect(codeOnly(read('app/edit-profile.tsx'))).toContain('<MatchingFields')
    expect(existsSync(join(__dirname, '..', 'app', 'about-you.tsx'))).toBe(false)
  })

  it('leaves no second door in Settings', () => {
    const src = codeOnly(read('app/settings.tsx'))
    // The one door: "About you" (E7; the row is not "How you match" until Flow 14 · 14.4 is built), to the about-you fields' own screen.
    // The old `/about-you` route, a second profile editor, stays gone.
    expect(src.replace("'/edit-about-you'", '')).not.toContain('about-you')
    expect(src).toContain("pathname: '/edit-about-you'")
    expect(src).not.toContain('/edit-profile')
    // And no profile card above the list, whose outer press went to the Me tab.
    expect(src).not.toContain('profileCard')
    expect(src).toContain('title="About you"')
    expect(src).not.toContain('title="How you match"')
  })

  it('pulls to refresh with the shared hook, which plays H.threshold (SYS-12)', () => {
    const src = codeOnly(read('app/settings.tsx'))
    expect(src).toContain('usePullToRefresh(')
    expect(src).toContain('{...pull.listProps}')
    expect(src).not.toContain('<RefreshControl')
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
    const safetyAt = src.indexOf('title="Safety"')
    const blockedAt = src.indexOf('title="Blocked users"')
    const aboutAt = src.indexOf('title="About"')
    expect(safetyAt).toBeGreaterThan(-1)
    expect(blockedAt).toBeGreaterThan(safetyAt)
    expect(blockedAt).toBeLessThan(aboutAt)
  })

  it('has no section called Discovery', () => {
    // It mixed a navigation row with three toggles, and the row has moved.
    expect(SETTINGS()).not.toContain('title="Discovery"')
  })
})

describe('a failed toggle rolls back only itself', () => {
  /*
   * Two switches can be in flight at once. The rollback used to spread the
   * snapshot it was called with — `{ ...next, [key]: previous[key] }` — so a
   * sibling that had saved meanwhile was written back to its OLD value in
   * storage. It reads what is on screen now, through a ref, instead.
   */
  it('rolls back from the current state, not the call-time snapshot', () => {
    const src = read('app/settings.tsx')
    const rollback = src.slice(src.indexOf('} catch {'), src.indexOf("Alert.alert('Update failed'"))
    expect(rollback).toContain('const rolled = { ...preferencesRef.current, [key]: previous[key] }')
    expect(rollback).toContain('savePreferencesLocal(rolled)')
    expect(rollback).not.toMatch(/\.\.\.next,/)
    expect(rollback).not.toMatch(/savePreferencesLocal\(previous\)/)
  })
})

describe('the irreversible row is hard to hit by accident', () => {
  const SETTINGS = () => codeOnly(read('app/settings.tsx'))

  it('puts Delete account last, in its own group', () => {
    /*
     * It used to sit one row under Sign out, both red, both in the first
     * section, at the top of the screen where the thumb lands. One is routine
     * and reversible; the other destroys the account.
     */
    const src = SETTINGS()
    expect(src).toContain('<SettingsGroup title="Danger zone" danger>')
    // The row's title is `Deleting account…` while it runs, so it is found by its test id.
    expect(src.indexOf('testID="settings-delete"')).toBeGreaterThan(src.indexOf('<SettingsGroup title="Account">'))
    // Nothing follows it but the end of the list.
    expect(src.slice(src.indexOf('testID="settings-delete"'))).not.toContain('<SettingsGroup')
  })

  it('reserves the danger colour for it alone', () => {
    // Sign out is no longer red. One red row is what makes red mean something.
    const src = SETTINGS()
    expect(src.match(/<SettingsRow[^>]*\bdestructive\b/g)).toHaveLength(1)
  })

  it('separates every group from the next by a gap, not one card', () => {
    // Six groups in one bordered card read as one block; each is its own SettingsGroup in a gapped column.
    const src = SETTINGS()
    expect(src.match(/<SettingsGroup title=/g)?.length).toBeGreaterThanOrEqual(7)
    expect(src).toMatch(/content: \{[^}]*gap: DS_SPACE\.xl/)
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
    // The design system's chip (white fill, ink type) through ChipSet: the editor draws none of its own.
    expect(src).toContain('<ChipSet')
    expect(src).not.toMatch(/chipOn|EMBER\./)
  })
})
