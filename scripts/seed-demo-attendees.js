/*
  Seed demo event and attendees for testing the Netflix-style Match UI.

  Usage:
    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
    node scripts/seed-demo-attendees.js --users 8 --user-id <YOUR_USER_ID>

  Notes:
  - Using SUPABASE_SERVICE_ROLE_KEY is recommended to create demo profiles safely (RLS bypass).
  - If SERVICE_ROLE is not provided, the script falls back to SUPABASE_ANON_KEY.
    In that case, creating demo profiles may fail due to RLS, but check-ins should still work
    (your DB policies may vary).
*/

/* eslint-disable no-console */
const { createClient } = require('@supabase/supabase-js')

function getArg(flag, defaultValue) {
  const idx = process.argv.indexOf(flag)
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1]
  }
  return defaultValue
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !(SERVICE_ROLE_KEY || ANON_KEY)) {
  console.error('Missing Supabase configuration. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (recommended) or SUPABASE_ANON_KEY.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY || ANON_KEY)

// Inputs
const NUM_USERS = parseInt(getArg('--users', '8'), 10)
const CURRENT_USER_ID = getArg('--user-id', '') // optional; if provided, will be checked into the event too
const EVENT_TITLE = getArg('--title', 'Demo Mixer Night')
const LAT_ARG = getArg('--lat', '')
const LNG_ARG = getArg('--lng', '')
const RADIUS_METERS = parseInt(getArg('--radius', '100'), 10)
const LAT = LAT_ARG ? parseFloat(LAT_ARG) : NaN
const LNG = LNG_ARG ? parseFloat(LNG_ARG) : NaN

// Sample data
const SAMPLE_NAMES = [
  'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Avery', 'Quinn',
  'Hayden', 'Parker', 'Reese', 'Skyler', 'Rowan', 'Emerson', 'Sage'
]
const SAMPLE_BIOS = [
  'Coffee enthusiast. Always down for a latte and good conversation.',
  'Tech nerd, music lover, weekend hiker.',
  'Foodie exploring new spots. Ask me my top 3!',
  'Into startups, design, and spontaneous trips.',
  'Tell me your hot take on pineapple pizza.',
  'Dog person, runner, and serial bruncher.',
]
const SAMPLE_INTERESTS = [
  'Music', 'Tech', 'Movies', 'Hiking', 'Cooking', 'Startups', 'Fitness', 'Books', 'Art', 'Travel'
]
// No placeholder photos — demo attendees will have no profile images
const SAMPLE_PHOTOS = []

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

async function ensureEvent() {
  // Create an event starting now for 3 hours
  const now = new Date()
  const start = new Date(now.getTime() + 5 * 60 * 1000) // +5 min
  const end = new Date(now.getTime() + 3 * 60 * 60 * 1000) // +3 h

  const eventData = {
    title: EVENT_TITLE,
    description: 'Demo event generated for UI testing',
    venue_name: 'Nearby Pop-up',
    address: 'Near you',
    category: 'social',
    price_cents: 0,
    max_capacity: 100,
    cover_image_url: null,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    status: 'published', // for Events tab visibility if used
    is_active: true,
  }

  if (!Number.isNaN(LAT) && !Number.isNaN(LNG)) {
    eventData.latitude = LAT
    eventData.longitude = LNG
    eventData.check_in_radius = Number.isFinite(RADIUS_METERS) ? RADIUS_METERS : 100
  }

  // Try to create event
  let event
  let error
  ;({ data: event, error } = await supabase
    .from('events')
    .insert(eventData)
    .select('id, title')
    .single())

  if (error) {
    console.warn('[seed] Failed to create event, attempting to find an existing one...', error.message)
    // Try to find any published event in the next 24h
    const { data: existing, error: findErr } = await supabase
      .from('events')
      .select('id, title, start_time')
      .eq('status', 'published')
      .order('start_time', { ascending: true })
      .limit(1)
    if (findErr || !existing || existing.length === 0) {
      throw new Error('Could not create or find an event. Check your events table schema and RLS.')
    }
    event = existing[0]
  }

  return event
}

async function upsertProfiles(userIds) {
  // Prepare basic profiles
  const profiles = userIds.map((id, idx) => ({
    id,
    name: `${randomItem(SAMPLE_NAMES)} ${String.fromCharCode(65 + (idx % 26))}`,
    age: randomInt(21, 38),
  }))

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert(profiles, { onConflict: 'id' })

  if (profileError) {
    console.warn('[seed] Upserting profiles failed (RLS likely). Continuing without profile names.', profileError.message)
  }

  // Prepare extended user_profiles
  const userProfiles = userIds.map((id) => ({
    user_id: id,
    display_name: undefined, // leave undefined to not break columns if absent
    bio: randomItem(SAMPLE_BIOS),
    interests: [randomItem(SAMPLE_INTERESTS), randomItem(SAMPLE_INTERESTS)],
    profile_photos: [],
  }))

  const { error: upError } = await supabase
    .from('user_profiles')
    .upsert(userProfiles, { onConflict: 'user_id' })

  if (upError) {
    console.warn('[seed] Upserting user_profiles failed (RLS likely). Continuing without bios/photos.', upError.message)
  }
}

async function checkInUsers(eventId, userIds) {
  const nowIso = new Date().toISOString()
  const rows = userIds.map((uid) => ({
    user_id: uid,
    event_id: eventId,
    checked_in_at: nowIso,
  }))

  const { error } = await supabase.from('event_checkins').insert(rows)
  if (error) {
    throw new Error(`Failed to insert event_checkins: ${error.message}`)
  }
}

async function createDemoAuthUsers(count) {
  if (!SERVICE_ROLE_KEY) {
    console.warn('[seed] SERVICE ROLE key not provided. Cannot create demo auth users. Provide SUPABASE_SERVICE_ROLE_KEY to enable full seeding.')
    return []
  }

  const createdIds = []
  for (let i = 0; i < count; i++) {
    const email = `demo_attendee_${Date.now()}_${i}@blendn.dev`
    const password = 'Password123!'
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: randomItem(SAMPLE_NAMES),
      },
    })
    if (error) {
      console.warn('[seed] Failed to create auth user', email, error.message)
      continue
    }
    const id = data.user?.id
    if (id) createdIds.push(id)
  }
  return createdIds
}

async function main() {
  console.log('🌱 Seeding demo attendees...')

  const event = await ensureEvent()
  console.log(`✅ Using event: ${event.title} (${event.id})`)

  // Create demo auth users (requires service role). If not available, fall back to random UUIDs.
  let demoUserIds = await createDemoAuthUsers(NUM_USERS)
  if (demoUserIds.length === 0) {
    console.warn('[seed] No demo auth users created. Falling back to random demo user IDs (no auth).')
    const canUseCrypto = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    function genId() {
      if (canUseCrypto) return crypto.randomUUID()
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
      })
    }
    demoUserIds = Array.from({ length: NUM_USERS }, () => genId())
  }

  // Create profiles (best effort)
  await upsertProfiles(demoUserIds)

  // Check in demo users
  await checkInUsers(event.id, demoUserIds)

  // Optionally check in the current user too
  if (CURRENT_USER_ID && CURRENT_USER_ID.length > 0) {
    try {
      await checkInUsers(event.id, [CURRENT_USER_ID])
      console.log(`👤 Also checked in current user: ${CURRENT_USER_ID}`)
    } catch (e) {
      console.warn('⚠️ Could not check in current user (maybe already checked in):', e.message)
    }
  }

  console.log('\n🎉 Done! Open the app -> Match tab to see active attendees.')
  console.log(`Event ID: ${event.id}`)
}

main().catch((err) => {
  console.error('💥 Seed failed:', err)
  process.exit(1)
})


