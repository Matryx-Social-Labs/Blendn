import { claimUrlFrom } from '../lib/claimLink'

describe('claimUrlFrom', () => {
  it('passes the claim page the server built, on whichever host it names', () => {
    const url = 'https://staging-dashboard.blendn.app/claim/3f0b6d1e-8a52-4c1f-9e1a-2b7c4d5e6f70'
    expect(claimUrlFrom({ url })).toBe(url)
  })

  it('offers nothing when the server sent nothing (not curated, or already claimed)', () => {
    expect(claimUrlFrom(null)).toBeNull()
    expect(claimUrlFrom(undefined)).toBeNull()
    expect(claimUrlFrom({})).toBeNull()
  })

  it('refuses anything that is not a web page under /claim/', () => {
    expect(claimUrlFrom({ url: 'javascript:alert(1)' })).toBeNull()
    expect(claimUrlFrom({ url: 'https://dashboard.blendn.app/dashboard/events' })).toBeNull()
    expect(claimUrlFrom({ url: 'not a url' })).toBeNull()
    expect(claimUrlFrom({ url: 42 })).toBeNull()
  })
})
