import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

/**
 * The account and friends journey's loose ends — the parts that live in
 * wiring, copy and helpers rather than in one screen's behaviour.
 *
 *  - an edit form that let back and swipe-back drop your changes;
 *  - a crash screen whose "contact support" was a dialog with no contact in it,
 *    showing the raw error to everyone;
 *  - a support address typed into more than one file;
 *  - "gone" read off any failed request.
 */
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.4.0', nativeBuildVersion: '118' }))
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

import { isGone } from '../lib/loadFailure'
import { SUPPORT_EMAIL, supportMailto } from '../lib/support'

const ROOT = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

describe('Edit profile', () => {
  it('stops every way of leaving while the form has unsaved edits, and asks', () => {
    const src = read('app/edit-profile.tsx')
    // usePreventRemove covers the header's back, the swipe and Android's back alike.
    expect(src).toContain('usePreventRemove(dirty && !leaving,')
    expect(src).toContain('title="Discard changes?"')
    expect(src).toContain("{ label: 'Keep editing', onPress: () => setDiscardOpen(false) }")
    // A save moves the baseline, so the OK after "Profile Updated" leaves without asking.
    expect(src).toContain('setSavedSnapshot(currentSnapshot)')
  })
})

describe('the crash screen', () => {
  const src = read('components/ErrorBoundary.tsx')

  it('shows the raw error in development builds only', () => {
    expect(src).toContain('{__DEV__ && this.state.error?.message ? (')
    expect(src).not.toContain("'Error Details'")
  })

  it('contacts support for real, with the error id', () => {
    expect(src).toContain('supportMailto({ subject: "Blend\'n crashed", userId: user?.id, errorId: this.state.errorId })')
    // The same id goes to Sentry, so the email and the report can be matched.
    expect(read('app/_layout.tsx')).toContain("tags: { context: 'root-error-boundary', error_id: errorId }")
  })

  it('keeps Try again', () => {
    expect(src).toContain('onPress={this.resetErrorBoundary}')
  })
})

describe('the support address', () => {
  it('is written in one place', () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(join(ROOT, dir))) {
        const rel = join(dir, name)
        if (statSync(join(ROOT, rel)).isDirectory()) walk(rel)
        else if (/\.tsx?$/.test(name) && read(rel).includes(SUPPORT_EMAIL)) offenders.push(rel)
      }
    }
    ;['app', 'components', 'lib'].forEach(walk)
    expect(offenders).toEqual(['lib/support.ts'])
  })

  it('drafts an email carrying the version, the phone, the account and the error', () => {
    const url = supportMailto({ subject: "Blend'n crashed", userId: 'u_me', errorId: 'E-1' })
    expect(url.startsWith(`mailto:${SUPPORT_EMAIL}?subject=`)).toBe(true)
    const body = decodeURIComponent(url.split('&body=')[1])
    expect(body).toContain('App: 1.4.0 (118)')
    expect(body).toMatch(/Device: (iOS|Android) /)
    expect(body).toContain('Account: u_me')
    expect(body).toContain('Error: E-1')
  })
})

describe('gone, or just not loaded', () => {
  it('is gone only on the server\'s 404', () => {
    expect(isGone({ success: false, errorCode: 'NOT_FOUND' })).toBe(true)
    expect(isGone({ success: false })).toBe(false)
    expect(isGone({ success: false, errorCode: 'SERVER_ERROR' })).toBe(false)
    expect(isGone({ success: true })).toBe(false)
  })

  it('is how blocked users tells a failure from an empty list', () => {
    // safetyUtils.getBlockedUsers answers a failure with [], which drew "No Blocked Users".
    const src = read('app/blocked-users.tsx')
    expect(src).toContain('apiClient.getBlockedUsers()')
    expect(src).not.toContain('getBlockedUsers,')
  })
})

describe('new screens', () => {
  it('are declared, so none inherits a native header', () => {
    const layout = read('app/_layout.tsx')
    for (const name of ['about', 'support', 'friends/requests']) {
      expect(layout).toContain(`<Stack.Screen name="${name}"`)
    }
  })
})
