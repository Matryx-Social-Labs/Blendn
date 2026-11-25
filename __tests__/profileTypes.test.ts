/** SYS-19: `GET /profiles/:id` is the nested envelope; a top-level `photos` read fails `tsc` (that is `GET /users/:id`). */
import type { apiClient as Api, EventChatData, OwnProfileEnvelope, PublicProfile, VenueDetail } from '../lib/apiClient'

type ProfileRead = Awaited<ReturnType<typeof Api.getProfile>>

it('types the two profile endpoints apart (checked by tsc, not at runtime)', () => {
  const nested = {} as NonNullable<ProfileRead['data']>
  const flat = {} as PublicProfile
  // @ts-expect-error a top-level photos is the other endpoint's shape
  void nested.photos
  void nested.profile?.photos
  void flat.photos
  const own: OwnProfileEnvelope = nested
  expect(own).toBeDefined()
})

it('declares the server fields the screens read (checked by tsc)', () => {
  const venue = {} as VenueDetail['venue']
  const room = {} as EventChatData
  void venue.timezone
  void room.write?.allowed
  void room.you?.pseudonym
  void room.status
  expect(true).toBe(true)
})
