import { contactWarning, findContactKinds } from '../lib/contactWarning'

describe('the contact-details warning (a port of the server’s findContactInfo)', () => {
  it('says nothing for ordinary room talk', () => {
    for (const text of ['', '   ', '@priya you coming?', 'Meet at the Blue Door on MG Road', 'I have 2 tickets and 3 friends', 'doors at 8 for 9', 'pin is 123456']) {
      expect(findContactKinds(text)).toEqual([])
      expect(contactWarning(text, 'anonymous')).toBeNull()
    }
  })

  it('finds a phone number written as digits, spaced, or spelled', () => {
    expect(findContactKinds('call me 98765 43210')).toEqual(['phone'])
    expect(findContactKinds('9 8 7 6 5 4 3 2 1 0')).toEqual(['phone'])
    expect(findContactKinds('nine eight seven six five four three')).toEqual(['phone'])
    expect(findContactKinds('n1ne e1ght seven six five four three')).toEqual(['phone'])
  })

  it('finds a platform handle and a direct-message link, together when both are there', () => {
    expect(findContactKinds('add me on insta')).toEqual(['handle'])
    expect(findContactKinds('wa.me/919876543210')).toEqual(['phone', 'handle', 'link'])
    expect(findContactKinds('ping my whatsapp wa.me/x')).toEqual(['handle', 'link'])
  })

  it('names what it saw, then what will happen, in the room’s own terms', () => {
    expect(contactWarning('call 9876543210', 'anonymous')).toBe(
      'This looks like a phone number. This room is anonymous — a message with contact details is removed before anyone sees it.'
    )
    expect(contactWarning('call 9876543210', 'crew')).toBe('This looks like a phone number. A message with contact details is removed before anyone else sees it.')
    // A DM is flagged, never removed: its sentence must not say so.
    const dm = contactWarning('call 9876543210', 'dm')!
    expect(dm).toBe('This looks like a phone number. It will send. Nobody reads messages here unless somebody reports one.')
    expect(dm).not.toMatch(/removed/)
  })
})
