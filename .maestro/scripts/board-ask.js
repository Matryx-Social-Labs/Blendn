// The other phone's half of c19: the asker finds the post by its words and asks
// to join, through the staging API. Env (from the flow): API, EVENT_ID,
// ASKER_TOKEN (from `npm run -s qa token <email>` just before the run — it
// lives 15 minutes; never written down),
// POST_TEXT. Sets output.askStatus and output.requestId for the flow and the
// read-back.
var auth = { Authorization: 'Bearer ' + ASKER_TOKEN, 'Content-Type': 'application/json' }
var read = http.get(API + '/api/mobile/events/' + EVENT_ID + '/board', { headers: auth })
// An expired token (access tokens live 15 minutes) reads as a 401 here, not as a missing post.
if (read.status !== 200) throw new Error('the asker could not read the board: ' + read.status + ' ' + read.body)
var post = json(read.body).data.posts.filter(function (p) { return p.body === POST_TEXT })[0]
if (!post) throw new Error('the post is not on the board as the asker reads it')
var asked = http.post(API + '/api/mobile/events/' + EVENT_ID + '/board/' + post.id + '/requests', {
  headers: auth,
  body: '{}',
})
output.askStatus = asked.status
output.requestId = json(asked.body).data ? json(asked.body).data.id : ''
if (asked.status !== 201) throw new Error('ask refused: ' + asked.status + ' ' + asked.body)
