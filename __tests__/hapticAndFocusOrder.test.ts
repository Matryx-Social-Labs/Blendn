/**
 * The cross-cutting haptic and focus-order rules the UI audit (2026-10-20) pinned,
 * as source shapes: each is a thing that is invisible in a render and silent when
 * it regresses.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

describe('haptics: one answer, one haptic', () => {
  it('saving an event is silent on the Scene, as it is on Going (U-M17)', () => {
    const src = read('components/screens/EventDetailScreen.tsx')
    expect(src).not.toMatch(/if \(result\.data\.interested\) H\.success\(\)/)
  })

  it('the Banter inbox plays nothing on refresh and nothing on opening a crew invite (U-L9, U-L10)', () => {
    const src = read('app/(tabs)/chat.tsx')
    expect(src).not.toMatch(/H\.threshold\(/)
    expect(src).not.toMatch(/H\.primary\(/)
  })

  it('accepting a friend request plays the success haptic with its toast, from the toast alone (U-L10)', () => {
    expect(read('lib/useFriendRequests.ts')).toContain("are friends`, 'success', { haptic: 'success' })")
    expect(read('app/f/[token].tsx')).toContain("are friends`, 'success', { haptic: 'success' })")
  })

  it('a failed submit toast (not a load, not a link) carries the error haptic, and never also plays one by hand (U-M18)', () => {
    for (const file of ['lib/useFriendRequests.ts', 'app/edit-profile.tsx', 'app/settings.tsx', 'components/PhotoManager.tsx']) {
      const src = read(file)
      const errorToasts = src.split('\n').filter((l) => /showToast\(.*'error'/.test(l) && !/page didn't open|Sign in to edit|Couldn't load|haptic/.test(l))
      expect(errorToasts).toEqual([])
    }
  })
})

describe('focus order: the header is read first (U-M15)', () => {
  it('Banter: the header comes before the list in the tree', () => {
    const src = read('app/(tabs)/chat.tsx')
    expect(src.indexOf('<BanterHeader')).toBeGreaterThan(-1)
    expect(src.indexOf('<BanterHeader')).toBeLessThan(src.indexOf('<Reanimated.FlatList'))
  })

  it('Room info: Back comes before the scroll view, and stays on top by zIndex', () => {
    const src = read('app/chat-info/[id].tsx')
    expect(src.indexOf('accessibilityLabel="Back"')).toBeLessThan(src.indexOf('<Animated.ScrollView'))
    expect(src).toMatch(/back: \{[^}]*zIndex: 2/)
  })
})
