import { RATE_REFUSAL_SENTENCES, RATE_REFUSED_FALLBACK, rateRefusal } from '../lib/rateRefusal'

describe('what a refused rating means', () => {
  it('a night that is not there is the gone card, and only that', () => {
    expect(rateRefusal({ errorCode: 'NOT_FOUND' })).toEqual({ kind: 'gone' })
    expect(rateRefusal({ errorCode: 'FORBIDDEN' }).kind).not.toBe('gone')
    expect(rateRefusal({ errorCode: 'SERVER_ERROR' }).kind).not.toBe('gone')
  })

  it('a 403 is a refusal in the server\'s reason, in the app\'s words, for each of the three', () => {
    for (const reasonCode of ['NOT_ENDED', 'NOT_ATTENDED', 'NOT_CONNECTED']) {
      expect(rateRefusal({ errorCode: 'FORBIDDEN', reasonCode })).toEqual({ kind: 'refused', sentence: RATE_REFUSAL_SENTENCES[reasonCode] })
    }
    expect(Object.values(RATE_REFUSAL_SENTENCES).every((s) => !s.includes("'"))).toBe(true)
  })

  it('a 403 with no reason, or one this build does not know, still has a sentence', () => {
    expect(rateRefusal({ errorCode: 'FORBIDDEN' })).toEqual({ kind: 'refused', sentence: RATE_REFUSED_FALLBACK })
    expect(rateRefusal({ errorCode: 'FORBIDDEN', reasonCode: 'SOMETHING_NEW' })).toEqual({ kind: 'refused', sentence: RATE_REFUSED_FALLBACK })
  })

  it('anything else is a failure to send, which a retry may fix; nothing at all is one too', () => {
    expect(rateRefusal({})).toEqual({ kind: 'failed' })
    expect(rateRefusal(undefined)).toEqual({ kind: 'failed' })
  })
})
