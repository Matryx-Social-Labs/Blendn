/** SYS-02: "Update required" opened the App Store's search page (the env was never set). It opens the listing. */
import { STORE_UPDATE } from '../lib/updateRequired'

it('opens the App Store listing by id, not a search, when the env override is unset', () => {
  expect(process.env.EXPO_PUBLIC_APP_STORE_URL).toBeUndefined()
  expect(STORE_UPDATE.ios.url).toBe('https://apps.apple.com/app/id6757761059')
})
