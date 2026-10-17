import { router } from 'expo-router'
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react'
import { Text } from 'react-native'

import { CrewRefusalSheet, type CrewRefusal } from '../../components/crews/CrewRefusalSheet'
import { MadeBeat } from '../../components/crews/MadeBeat'
import { ConsentStep, FriendsStep, MakeHeader, NameStep } from '../../components/crews/MakeSteps'
import { Sheet, type SheetAction } from '../../components/ds/Sheet'
import { apiClient } from '../../lib/apiClient'
import { CREW_MAX_MEMBERS, CREW_TAGS, createCrewBody, crewMessage, toggleTag } from '../../lib/crews'
import { crewsApi } from '../../lib/crewsApi'
import {
  bioFits,
  cleanName,
  intentLine,
  intentOf,
  makeSummary,
  nameError,
  textFieldOf,
  type IntentChoice,
  type MakeStep,
} from '../../lib/crewsScreens'
import type { Friend } from '../../lib/friends'
import { H } from '../../lib/haptics'
import { useReducedMotion } from '../../lib/motion'

/** How long the made crew stays on screen before its chat opens; a tap goes on at once. */
const MADE_DWELL_MS = 1600
const BIO_TOO_LONG = 'A crew bio is at most 140 characters'

type Made = { crewId: string; chatGroupId: string; invited: number; emblemSeed: string }

/**
 * Make a crew (Flow 10 · 10.2): a sheet over Crews in three steps — name and
 * vibe, friends, consent — and then the crew made.
 *
 * Step 1 holds the server's limits (a name of 2–32 characters, a line of at
 * most 140, up to 3 of the curated tags) and shows the card as strangers will
 * see it. Step 2 is friends only, no search, and its count says how many,
 * never who was skipped. Step 3 shows the consent sentence beside Make the
 * crew; tapping it is the agreement (the server refuses a crew without it),
 * and nothing is sent before. The server's own sentences come back where they
 * belong: a name or bio it refuses under that field, a cap or the 18+ gate in
 * a sheet. System back, the scrim and a drag go back a step before they close.
 */
export default function NewCrewScreen() {
  const reduceMotion = useReducedMotion()
  const [open, setOpen] = useState(true)
  const [step, setStep] = useState<MakeStep>(1)
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [choice, setChoice] = useState<IntentChoice>('friendship')
  const [tags, setTags] = useState<string[]>([])
  const [openToSolo, setOpenToSolo] = useState(false)
  const [keepAnonymous, setKeepAnonymous] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  /** null while loading; 'failed' is not "no friends" — it offers a retry. */
  const [friends, setFriends] = useState<Friend[] | null | 'failed'>(null)
  const [errors, setErrors] = useState<{ name?: string; bio?: string }>({})
  const [refusal, setRefusal] = useState<CrewRefusal | null>(null)
  const [stuck, setStuck] = useState(false)
  const [sending, setSending] = useState(false)
  const [made, setMade] = useState<Made | null>(null)
  /** The stand-in emblem for the preview: the server draws the real one, from its own seed, when the crew is made. */
  const [previewSeed] = useState(() => `preview-${Math.random().toString(36).slice(2)}`)
  const titleRef = useRef<ComponentRef<typeof Text>>(null)
  /** One create at a time: `sending` lags a fast second tap by a render. */
  const inFlight = useRef(false)

  const loadFriends = useCallback(
    () => apiClient.getFriends().then((r) => (r.success && r.data ? r.data.friends : ('failed' as const))),
    []
  )
  useEffect(() => {
    let live = true
    void loadFriends().then((f) => live && setFriends(f))
    return () => {
      live = false
    }
  }, [loadFriends])
  const retryFriends = () => {
    setFriends(null)
    void loadFriends().then(setFriends)
  }

  const labels = CREW_TAGS.filter((t) => tags.includes(t.slug)).map((t) => t.label)
  const intent = intentOf(choice)

  // A refused Next shakes once (#20); the flag drops so the next refusal can shake again.
  useEffect(() => {
    if (!stuck) return
    const timer = setTimeout(() => setStuck(false), reduceMotion ? 0 : 400)
    return () => clearTimeout(timer)
  }, [stuck, reduceMotion])

  const go = useCallback(() => {
    if (!made) return
    router.replace({
      pathname: '/chat/[id]',
      params: { id: made.chatGroupId, roomName: cleanName(name), kind: 'crew', crewId: made.crewId },
    } as never)
  }, [made, name])
  // Timer-driven, so Reduce Motion and a tap that never comes both still arrive at the chat.
  useEffect(() => {
    if (!made) return
    const timer = setTimeout(go, MADE_DWELL_MS)
    return () => clearTimeout(timer)
  }, [made, go])

  const next = () => {
    if (step === 1) {
      const problem = { name: nameError(name), bio: bioFits(bio) ? undefined : BIO_TOO_LONG }
      if (problem.name || problem.bio) {
        setErrors((e) => ({ ...e, ...problem }))
        setStuck(true)
        return
      }
      setStep(2)
    } else if (step === 2) {
      setStep(3)
    }
  }

  const make = async () => {
    if (inFlight.current) return
    // Tapping Make the crew is the agreement to the sentence above it.
    const body = createCrewBody({ name, bio, intent, tags, openToSolo, inviteUserIds: picked }, { consented: true, keepMeAnonymous: keepAnonymous })
    if ('problem' in body) {
      setErrors({ name: nameError(name), bio: bioFits(bio) ? undefined : BIO_TOO_LONG })
      setStep(1)
      return
    }
    inFlight.current = true
    setSending(true)
    const result = await crewsApi.create(body)
    if (!result.success || !result.data) {
      inFlight.current = false
      setSending(false)
      // The server's sentence names what it found (a phone number in the bio, the daily cap).
      const text = crewMessage(result, 'create', 'Couldn’t make the crew. Try again.')
      const field = textFieldOf(text)
      if (field) {
        setErrors({ [field]: text })
        setStep(1)
      } else {
        setRefusal({ text, errorCode: result.errorCode })
      }
      setStuck(true)
      return
    }
    const { crewId, chatGroupId, invited } = result.data
    // The emblem the server drew, for the beat; if it cannot be read the chat simply opens.
    const fresh = await crewsApi.crew(crewId)
    inFlight.current = false
    setSending(false)
    H.success()
    if (!fresh.success || !fresh.data) {
      router.replace({ pathname: '/chat/[id]', params: { id: chatGroupId, roomName: body.name, kind: 'crew', crewId } } as never)
      return
    }
    setMade({ crewId, chatGroupId, invited, emblemSeed: fresh.data.emblemSeed })
  }

  const close = () => {
    if (sending) return
    if (made) return go()
    // Back a step before out: what was typed is kept.
    if (step > 1) setStep((s) => (s - 1) as MakeStep)
    else setOpen(false)
  }

  const togglePick = (userId: string) =>
    setPicked((p) => (p.includes(userId) ? p.filter((id) => id !== userId) : p.length < CREW_MAX_MEMBERS - 1 ? [...p, userId] : p))

  const actions: SheetAction[] = made
    ? []
    : step === 3
      ? [{ label: 'Make the crew', kind: 'primary', onPress: () => void make(), loading: sending, refused: stuck }]
      : [{ label: 'Next', kind: 'primary', onPress: next, disabled: step === 2 && picked.length === 0, refused: stuck }]

  return (
    <>
      <Sheet
        visible={open}
        onClose={close}
        onDismissed={() => router.back()}
        focusRef={titleRef}
        detents={['tall']}
        actions={actions}
        testID="make"
      >
        {made ? (
          <MadeBeat name={cleanName(name)} emblemSeed={made.emblemSeed} invited={made.invited} onContinue={go} />
        ) : (
          <>
            <MakeHeader step={step} titleRef={titleRef} />
            {step === 1 ? (
              <NameStep
                name={name}
                onName={(v) => {
                  setName(v)
                  setErrors((e) => ({ ...e, name: undefined }))
                }}
                nameError={errors.name}
                bio={bio}
                onBio={(v) => {
                  setBio(v)
                  setErrors((e) => ({ ...e, bio: undefined }))
                }}
                bioError={errors.bio}
                choice={choice}
                onChoice={setChoice}
                tags={tags}
                onTag={(slug) => setTags((t) => toggleTag(t, slug))}
                openToSolo={openToSolo}
                onOpenToSolo={setOpenToSolo}
                previewSeed={previewSeed}
                intentText={intentLine(intent) ?? ''}
              />
            ) : step === 2 ? (
              <FriendsStep friends={friends} picked={picked} onToggle={togglePick} onRetry={retryFriends} />
            ) : (
              <ConsentStep
                name={cleanName(name)}
                summary={makeSummary({ invited: picked.length, intent, tags: labels })}
                previewSeed={previewSeed}
                keepAnonymous={keepAnonymous}
                onKeepAnonymous={setKeepAnonymous}
              />
            )}
          </>
        )}
      </Sheet>
      <CrewRefusalSheet refusal={refusal} onClose={() => setRefusal(null)} />
    </>
  )
}
