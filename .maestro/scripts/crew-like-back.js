// The other crew's half of c21: a member of their crew, checked in at
// EVENT_ID, likes the crew named LIKE_CREW back on their crew's behalf — which
// makes the Blend. Env: API, TOKEN, EVENT_ID, LIKE_CREW.
var auth = { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }
var read = http.get(API + '/api/mobile/events/' + EVENT_ID + '/crews', { headers: auth })
if (read.status !== 200) throw new Error('the other crew could not read the crews here: ' + read.status + ' ' + read.body)
var page = json(read.body).data
var card = page.crews.filter(function (c) { return c.name === LIKE_CREW })[0]
if (!card) throw new Error(LIKE_CREW + ' is not listed to the other crew')
if (!page.myCrews.length) throw new Error('the other crew is not here (two of them checked in)')
var liked = http.post(API + '/api/mobile/events/' + EVENT_ID + '/crews/' + card.crewId + '/like', {
  headers: auth,
  body: JSON.stringify({ asCrewId: page.myCrews[0].crewId }),
})
if (liked.status !== 200) throw new Error('like refused: ' + liked.status + ' ' + liked.body)
var blend = json(liked.body).data.blend
if (!blend) throw new Error('no Blend: did the phone like ' + page.myCrews[0].name + ' first?')
output.blendId = blend.blendId
output.chatGroupId = blend.chatGroupId
