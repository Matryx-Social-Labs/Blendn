import { myMainPhoto } from '../lib/myPhoto'

describe('myMainPhoto', () => {
  it('returns the first photo of the session profile', () => {
    expect(myMainPhoto({ profile: { photos: ['https://x/a.jpg', 'https://x/b.jpg'] } })).toBe('https://x/a.jpg')
  })

  it('skips blank entries', () => {
    expect(myMainPhoto({ profile: { photos: ['', '  ', 'https://x/b.jpg'] } })).toBe('https://x/b.jpg')
  })

  it('is null with no photos, never the OAuth image', () => {
    const user = { image: 'https://oauth/avatar.jpg', profile: { photos: [] } }
    expect(myMainPhoto(user)).toBeNull()
    expect(myMainPhoto({ profile: null })).toBeNull()
    expect(myMainPhoto(null)).toBeNull()
  })
})
