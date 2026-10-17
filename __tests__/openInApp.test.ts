/**
 * Our own web pages open over the app, in the in-app browser (expo-web-browser),
 * through one helper; a failure to open rejects so the caller can say so.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

/* eslint-disable import/first */
import * as WebBrowser from 'expo-web-browser'

import { BLENDN_LINKS, isOurPage, openInApp } from '../lib/links'
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

it.each([
  'https://evil.example',
  'https://blendn.app.evil.example/terms',
  'https://evilblendn.app/terms',
  'http://blendn.app/terms',
  'javascript:alert(1)',
  'blendn://settings',
  'not a url',
  '',
])('refuses %p: logged, nothing opened, the caller hears it', async (url) => {
  await expect(openInApp(url)).rejects.toThrow('Not one of our pages')
  expect(open).not.toHaveBeenCalled()
})

it('opens both of our hosts', async () => {
  await openInApp('https://www.blendn.app/community-guidelines')
  await openInApp('https://blendn.app/help')
  expect(open).toHaveBeenCalledTimes(2)
})

it('every link in BLENDN_LINKS is one of ours', () => {
  for (const url of Object.values(BLENDN_LINKS)) expect(isOurPage(url)).toBe(true)
})

it('no screen opens one of our pages through Linking any more', () => {
  const read = (p: string) => require('fs').readFileSync(require('path').join(__dirname, '..', p), 'utf8')
  for (const file of ['app/settings.tsx', 'app/about.tsx', 'app/support.tsx', 'app/chat-info/[id].tsx', 'components/LegalLine.tsx', 'components/chat/RoomGuidelinesBanner.tsx', 'app/plus.tsx']) {
    expect(read(file)).not.toMatch(/Linking\.openURL\((BLENDN_LINKS|COMMUNITY_GUIDELINES_URL)/)
  }
})
