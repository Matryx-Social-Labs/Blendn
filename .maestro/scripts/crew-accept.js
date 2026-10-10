// The invited friend's half of c20: they accept the invite to CREW_NAME
// through the staging API, consenting as the app would (revealConsent: true)
// and keeping themselves anonymous when KEEP_ANON is "true".
// Env (from the flow): API, TOKEN (`npm run -s qa token <email>` just before
// the run — it lives 15 minutes; never written down), CREW_NAME, KEEP_ANON.
var auth = { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }
var read = http.get(API + '/api/mobile/crews', { headers: auth })
if (read.status !== 200) throw new Error('the friend could not read their crews: ' + read.status + ' ' + read.body)
var invite = json(read.body).data.invites.filter(function (i) { return i.name === CREW_NAME })[0]
if (!invite) throw new Error('no invite to ' + CREW_NAME + ' as the friend reads it')
var joined = http.post(API + '/api/mobile/crews/' + invite.crewId + '/join', {
  headers: auth,
  body: JSON.stringify({ revealConsent: true, keepMeAnonymous: KEEP_ANON === 'true' }),
})
if (joined.status !== 200) throw new Error('join refused: ' + joined.status + ' ' + joined.body)
output.crewId = invite.crewId
