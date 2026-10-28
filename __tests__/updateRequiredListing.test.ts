/** SYS-02: "Update required" opened the App Store's search page (the env was never set). It opens the listing. */
/** SYS-02: "Update required" opened the App Store's search page (the env was never set). It opens the listing. */
describe('without the env override', () => {
  const saved = process.env.EXPO_PUBLIC_APP_STORE_URL
  beforeAll(() => {
    delete process.env.EXPO_PUBLIC_APP_STORE_URL
  })
  afterAll(() => {
    if (saved !== undefined) process.env.EXPO_PUBLIC_APP_STORE_URL = saved
  })

  it('opens the App Store listing by id, not a search', () => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { STORE_UPDATE } = require('../lib/updateRequired') as typeof import('../lib/updateRequired')
      expect(STORE_UPDATE.ios.url).toBe('https://apps.apple.com/app/id6757761059')
    })
  })
})

describe('with the override', () => {
  it('the override wins', () => {
    process.env.EXPO_PUBLIC_APP_STORE_URL = 'https://apps.apple.com/app/id1'
    try {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { STORE_UPDATE } = require('../lib/updateRequired') as typeof import('../lib/updateRequired')
        expect(STORE_UPDATE.ios.url).toBe('https://apps.apple.com/app/id1')
      })
    } finally {
      delete process.env.EXPO_PUBLIC_APP_STORE_URL
    }
  })
})
