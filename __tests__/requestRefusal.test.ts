import { requestTextRefusal } from '../lib/requestRefusal'

describe('requestTextRefusal', () => {
  it('returns the server’s sentence for a refused text', () => {
    expect(requestTextRefusal({ reasonCode: 'TEXT_NOT_ALLOWED', error: ' No links in a first note. ' })).toBe('No links in a first note.')
  })

  it('returns nothing for any other failure, so the caller keeps its generic line', () => {
    expect(requestTextRefusal({ error: 'No internet connection.' })).toBeUndefined()
    expect(requestTextRefusal({ reasonCode: 'SOMETHING_ELSE', error: 'x' })).toBeUndefined()
    expect(requestTextRefusal({ reasonCode: 'TEXT_NOT_ALLOWED' })).toBeUndefined()
  })
})
