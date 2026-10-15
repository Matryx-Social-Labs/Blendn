import { claimUrlFrom } from '../lib/claimLink'

describe('claimUrlFrom', () => {
  it('passes the claim page the server built on a Blendn dashboard host', () => {
    for (const url of [
      'https://dashboard.blendn.app/claim/3f0b6d1e-8a52-4c1f-9e1a-2b7c4d5e6f70',
      'https://staging-dashboard.blendn.app/claim/3f0b6d1e-8a52-4c1f-9e1a-2b7c4d5e6f70',
    ]) {
      expect(claimUrlFrom({ url }, false)).toBe(url)
    }
  })

  it('offers nothing when the server sent nothing (not curated, or already claimed)', () => {
    expect(claimUrlFrom(null, false)).toBeNull()
    expect(claimUrlFrom(undefined, false)).toBeNull()
    expect(claimUrlFrom({}, false)).toBeNull()
  })

  it('refuses another host, plain http, and anything that is not a /claim/ page', () => {
    expect(claimUrlFrom({ url: 'https://evil.example/claim/x' }, false)).toBeNull()
    expect(claimUrlFrom({ url: 'https://blendn.app.evil.example/claim/x' }, false)).toBeNull()
    expect(claimUrlFrom({ url: 'http://dashboard.blendn.app/claim/x' }, false)).toBeNull()
    expect(claimUrlFrom({ url: 'https://dashboard.blendn.app/dashboard/events' }, false)).toBeNull()
    expect(claimUrlFrom({ url: 'javascript:alert(1)' }, false)).toBeNull()
    expect(claimUrlFrom({ url: 'not a url' }, false)).toBeNull()
    expect(claimUrlFrom({ url: 42 }, false)).toBeNull()
  })

  it('lets a development build open a local dev server over http, and a release build never', () => {
    const local = 'http://localhost:3107/claim/x'
    expect(claimUrlFrom({ url: local }, true)).toBe(local)
    expect(claimUrlFrom({ url: 'http://192.168.1.20:3100/claim/x' }, true)).toBe('http://192.168.1.20:3100/claim/x')
    expect(claimUrlFrom({ url: local }, false)).toBeNull()
    // Not a licence to open anything in development: the host still has to be local or ours.
    expect(claimUrlFrom({ url: 'http://evil.example/claim/x' }, true)).toBeNull()
  })
})
