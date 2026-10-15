// The other person reveals in a DM (Flow 5), so the phone's side sees their
// name and photo — and, once the phone has revealed too, can send a photo.
// Env: API, TOKEN (the other person's — a MAESTRO_* environment variable),
// CONVERSATION_ID. Sets output.revealed.
var auth = { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }
var res = http.post(API + '/api/mobile/conversations/' + CONVERSATION_ID + '/reveal', { headers: auth, body: '{}' })
if (res.status !== 200) throw new Error('reveal refused: ' + res.status + ' ' + res.body)
output.revealed = json(res.body).data.revealed
