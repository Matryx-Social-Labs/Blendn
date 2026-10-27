/** A toast and an in-app banner never overlap on iOS: the toast’s lane steps down while a banner is up. */
import { act, render, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

jest.mock('expo-router', () => ({ usePathname: () => '/events', useIsFocused: () => true }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }) }))

import { ToastProvider } from '../components/Toast'
import { BANNER_LANE_DROP, registerBannerShowing } from '../lib/inAppBanners'
import { toast } from '../lib/toast'

const lane = () => StyleSheet.flatten(screen.getByTestId('toast-lane').props.style)

it('drops the lane by the banner’s height and gap while one shows, and puts it back when it goes', async () => {
  await render(<ToastProvider>{null}</ToastProvider>)
  await act(async () => toast('Saved', 'success'))
  const rest = lane().top as number
  let release = () => {}
  await act(async () => {
    release = registerBannerShowing()
  })
  expect(lane().top).toBe(rest + BANNER_LANE_DROP)
  await act(async () => release())
  expect(lane().top).toBe(rest)
})

it('drops by the capsule: 56 and the 8 under it', () => {
  expect(BANNER_LANE_DROP).toBe(64)
})
