/**
 * Our own web pages open over the app, in the in-app browser (expo-web-browser),
 * through one helper; a failure to open rejects so the caller can say so.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

/* eslint-disable import/first */
import * as WebBrowser from 'expo-web-browser'

import { BLENDN_LINKS, openInApp } from '../lib/links'
/* eslint-enable import/first */

const open = WebBrowser.openBrowserAsync as jest.Mock

it('opens the page it is given in the in-app browser, closable with Close', async () => {
  await openInApp(BLENDN_LINKS.terms)
  expect(open).toHaveBeenCalledWith(BLENDN_LINKS.terms, expect.objectContaining({ dismissButtonStyle: 'close' }))
})

it('rejects when no browser could open it, so the caller keeps its toast', async () => {
  open.mockRejectedValueOnce(new Error('no browser'))
  await expect(openInApp(BLENDN_LINKS.privacy)).rejects.toThrow('no browser')
})

it('no screen opens one of our pages through Linking any more', () => {
  const read = (p: string) => require('fs').readFileSync(require('path').join(__dirname, '..', p), 'utf8')
  for (const file of ['app/settings.tsx', 'app/about.tsx', 'app/support.tsx', 'app/chat-info/[id].tsx', 'components/LegalLine.tsx', 'components/chat/RoomGuidelinesBanner.tsx', 'app/plus.tsx']) {
    expect(read(file)).not.toMatch(/Linking\.openURL\((BLENDN_LINKS|COMMUNITY_GUIDELINES_URL)/)
  }
})
