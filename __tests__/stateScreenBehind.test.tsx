/** An inline state on a screen behind another (a tab not in front, a route under a push) stays quiet (M4 review). */
import { render } from '@testing-library/react-native'
import { AccessibilityInfo } from 'react-native'

import { StateScreen } from '../components/ds/StateScreen'

jest.mock('expo-router', () => ({ useIsFocused: jest.fn(() => false) }))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)

it('says nothing from behind; a full-screen state is the screen, so it still speaks', async () => {
  const say = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => {})
  await render(<StateScreen icon="message-circle" title="No conversations yet" />)
  expect(say).not.toHaveBeenCalled()
  await render(<StateScreen icon="lock" title="Not open to you" variant="screen" />)
  expect(say).toHaveBeenCalledWith('Not open to you', { queue: false })
})
