// The other crew reveals itself in the Blend (c21), so the phone can check that
// the member who kept themselves anonymous stays a pseudonym. Env: API, TOKEN,
// BLEND_ID. Sets output.revealed and output.keptPrivate.
var auth = { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }
var res = http.post(API + '/api/mobile/blends/' + BLEND_ID + '/reveal', { headers: auth, body: '{}' })
if (res.status !== 200) throw new Error('reveal refused: ' + res.status + ' ' + res.body)
var data = json(res.body).data
output.revealed = data.revealed
output.keptPrivate = data.keptPrivate
