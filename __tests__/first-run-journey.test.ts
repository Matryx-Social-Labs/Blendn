import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The first-run fixes, pinned where behaviour lives in a screen or an effect
 * that a unit test cannot mount. The auth half is driven for real in
 * auth-offline-launch.test.ts.
 */
const read = (file: string) =>
  readFileSync(join(__dirname, '..', file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

describe('push permission waits for the onboarding step that explains it', () => {
  const layout = read('app/_layout.tsx')

  it('starts push only outside onboarding', () => {
    const call = layout.indexOf('initializePushNotifications({ prompt: !declined })')
    const gate = layout.lastIndexOf('if (!inOnboarding && !pushInitRef.current) {', call)
    expect(call).toBeGreaterThan(-1)
    expect(gate).toBeGreaterThan(-1)
    expect(layout.indexOf("const inOnboarding = pathname.startsWith('/onboarding')")).toBeLessThan(gate)
    // One call site: the old one ran the moment auth resolved.
    expect(layout.split('initializePushNotifications(').length).toBe(2)
  })
})

describe('an onboarding save that fails stays on the step', () => {
  const hook = read('lib/useOnboarding.ts')
  const commit = hook.slice(hook.indexOf('const commit = useCallback('), hook.indexOf('const skip = useCallback('))

  it('says what failed and does not advance', () => {
    const failed = commit.indexOf('if (failure) {')
    expect(failed).toBeGreaterThan(-1)
    expect(commit.slice(failed)).toMatch(/if \(failure\) \{\s*showToast\(failure, 'error'\)\s*return false\s*\}/)
    expect(commit.indexOf('advanceTo(after)')).toBeGreaterThan(failed)
  })

  it('marks the step done only after the server has it', () => {
    const firstWrite = commit.indexOf('await writeOnboarding(userId, { progress, draft: merged })')
    const doneWrite = commit.indexOf('await writeOnboarding(userId, { progress: nextProgress, draft: saved })')
    expect(firstWrite).toBeGreaterThan(-1)
    expect(doneWrite).toBeGreaterThan(commit.indexOf('if (failure) {'))
  })
})

describe('the permission steps wait for an answer', () => {
  it.each(['app/onboarding/notifications.tsx', 'app/onboarding/location.tsx'])('%s', (file) => {
    const src = read(file)
    expect(src).not.toContain('Alert.alert')
    // The tray, then return: commit is not on the next line any more.
    expect(src).toMatch(/setSettingsPrompt\(true\)\s*return\s*\}/)
    expect(src).toContain('<SettingsTray')
  })
})

describe('a way out of onboarding', () => {
  it('offers sign-out on the first step and beside the under-18 message', () => {
    const basics = read('app/onboarding/basics.tsx')
    expect(basics).toContain('secondaryLabel="Not you? Sign out"')
    expect(basics).toMatch(/\{isUnderAccountAge\(dateOfBirth\) \? \(\s*<Pressable\s*onPress=\{\(\) => setConfirmSignOut\(true\)\}/)
    expect(basics).toContain('await signOut()')
  })
})

describe('the server-fed pickers say when they are loading or failed', () => {
  it.each([
    ['app/onboarding/details.tsx', 'interests'],
    ['app/onboarding/journey.tsx', 'fields of work'],
  ])('%s', (file, what) => {
    const src = read(file)
    expect(src).toContain(`what="${what}"`)
    expect(src).toMatch(/onRetry=\{\(\) => void load(Groups|Fields)\(\)\}/)
  })
})

describe('the sign-in screens', () => {
  it('link the Terms and the Privacy Policy from one list', () => {
    expect(read('app/index.tsx')).toContain('<LegalLine')
    expect(read('app/sign-in.tsx')).toContain('<LegalLine')
    expect(read('app/settings.tsx')).toContain("import { BLENDN_LINKS } from '../lib/links'")
    expect(read('components/LegalLine.tsx')).toMatch(/BLENDN_LINKS\.terms[\s\S]*BLENDN_LINKS\.privacy/)
  })

  it('carry the session-ended notice to the email form', () => {
    expect(read('app/index.tsx')).toContain("params: { notice }")
    expect(read('app/sign-in.tsx')).toMatch(/\{notice && !error \? \(/)
  })

  it('carry the typed email to forgot-password, which is no longer a placeholder', () => {
    expect(read('app/sign-in.tsx')).toContain("params: { email: trimmedEmail }")
    const forgot = read('app/forgot-password.tsx')
    expect(forgot).not.toContain('PLACEHOLDER')
    expect(forgot).toContain('Check your inbox')
    expect(forgot).toContain("Linking.openURL('message:')")
    expect(forgot).toContain("Linking.openURL('mailto:')")
    // Resend waits out the cooldown, and is busy (so also off) while a request runs.
    expect(forgot).toMatch(/disabled=\{cooldown > 0\}\s*busy=\{busy\}/)
  })
})
