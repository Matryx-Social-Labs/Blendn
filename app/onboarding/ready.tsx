import { router } from 'expo-router'
import { useRef, useState } from 'react'

import { MomentReady } from '../../components/ds/MomentReady'
import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen'
import { PayoffCard } from '../../components/onboarding/PayoffCard'
import { wholeYearsSince } from '../../lib/onboarding'
import { firstNameOf } from '../../lib/profileIdentity'
import { useAuth } from '../../lib/useAuth'
import { useOnboarding } from '../../lib/useOnboarding'

/**
 * The payoff, after the five steps: the person's own card, and the only place `onboarded` is written.
 *
 * That column has existed since the first schema and the dashboard funnel has
 * always counted it. **Nothing had ever set it.** The API has accepted it on
 * `PUT /profiles/:userId` the whole time; no client sent it, so the funnel read
 * zero and the number was mistaken for a product problem.
 *
 * Everything in the draft is re-sent here, not just the flag, so this doubles
 * as the backstop for any per-step save that failed on a bad connection.
 *
 * Their card rather than a straight "done" (direction A: photo, first name and age, one interest), because it is the one
 * moment someone sees themselves as others will; "Edit my details" is the cheap way to fix a typo before it is in a room.
 */
export default function ReadyScreen() {
  const { draft, saving, finish, goBack } = useOnboarding('ready')
  const { user } = useAuth()

  const [celebrating, setCelebrating] = useState(false)
  const leaving = useRef(false)
  const [leaveBusy, setLeaveBusy] = useState(false)

  // Edit my details: finish first, then the one edit screen over the tabs. Mid-flow it would sit outside onboarding (so
  // the tabs' push start-up would run before the ask was deferred), and finishing afterwards would re-send the draft over
  // whatever was just edited. The celebration and Bring your friends are skipped: the person asked to edit, not to party.
  const edit = async () => {
    if (leaving.current) return
    leaving.current = true
    setLeaveBusy(true)
    if (!(await finish())) {
      leaving.current = false
      setLeaveBusy(false)
      return
    }
    router.replace('/(tabs)/events')
    router.push('/edit-profile')
  }

  const complete = async () => {
    // Once either way out has the server's yes, the other is dead: `finish()` clears its own guard before the caller
    // navigates, and a tap in that gap ran a second PUT and raced two navigations (react review).
    if (leaving.current) return
    leaving.current = true
    setLeaveBusy(true)
    // The server said yes: the one celebration plays, and it plays the success haptic itself as its mark completes
    // (Reduce Motion: at once), so the haptic always lands on a frame where something moves. Then "Bring your friends"
    // first, then the app (see app/onboarding/friends.tsx). Once per account.
    if (await finish()) setCelebrating(true)
    else {
      leaving.current = false
      setLeaveBusy(false)
    }
    // On a failure the person stays here, rather than being pushed on regardless: this is the write that decides whether
    // the account is finished, and letting someone through would leave them permanently mid-funnel with no screen left
    // that could fix it. `finish()` has said why, in a toast that plays the one error haptic (this screen's own sentence
    // sat below the fold, so the button looked dead: SCRUM-492).
  }

  // The draft holds a name only once Basics saved one; an account that came with a name (Google, Apple) may never have
  // typed it. The account's name, then; never a placeholder that reads as someone else's card (audit A3).
  const name = draft.name?.trim() || user?.name?.trim() || undefined
  const first = name ? firstNameOf(name) : undefined

  return (
    <>
      <OnboardingScreen
        step="ready"
        hero={<PayoffCard first={first} age={wholeYearsSince(draft.dateOfBirth)} photo={draft.photos?.[0]} interest={draft.interests?.[0]} />}
        title="You’re in"
        titleAccent={first ? `, ${first}.` : '.'}
        subtitle="Here’s what’s on tonight."
        ctaLabel="See what’s on"
        ctaBusy={saving || leaveBusy}
        onContinue={() => void complete()}
        secondaryLabel="Edit my details"
        onSecondary={() => void edit()}
        onBack={goBack}
      />
      {celebrating ? (
        <MomentReady testID="ready-moment" name={first} onDone={() => router.replace('/onboarding/friends')} />
      ) : null}
    </>
  )
}
