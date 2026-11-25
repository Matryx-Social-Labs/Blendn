import { router } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet } from 'react-native'
import Animated, { useSharedValue } from 'react-native-reanimated'

import { CrewRefusalSheet, type CrewRefusal } from '../../components/crews/CrewRefusalSheet'
import { stepIn, stepOut, type StepDir } from '../../components/crews/stepMotion'
import { MadeBeat } from '../../components/crews/MadeBeat'
import { NameAndFriendsStep, VibeStep } from '../../components/crews/MakeSteps'
import { Sheet, type SheetAction } from '../../components/ds/Sheet'
import { CREW_MAX_MEMBERS, createCrewBody, crewMessage, newEmblemSeed } from '../../lib/crews'
import { useTagIdeas } from '../../lib/useTagIdeas'
import { crewsApi } from '../../lib/crewsApi'
import {
  cleanName,
  intentOf,
  makeLabel,
  nameError,
  textFieldOf,
  type IntentChoice,
  type MakeStep,
  stepNote,
} from '../../lib/crewsScreens'
import { FRIEND_SEARCH_OFFER } from '../../lib/friendsPaging'
import { pickerView, useFriendsList } from '../../lib/useFriendsList'
import { SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { useReducedMotion } from '../../lib/motion'
import { HueProvider } from '../../components/ds/shared'
import { RouteModal } from '../../components/system/RouteModal'
import { crewDraftThread, draftOf, setDraft } from '../../lib/chatOutbox'
import { onClosingForLink } from '../../lib/linkClosers'
import { useAuth } from '../../lib/useAuth'
import { useLatest } from '../../lib/useLatest'

/** What Make a crew keeps when a link closes it: the form, not the step or what the server said. */
type CrewDraft = {
  name: string
  choice: IntentChoice
  tags: string[]
  openToSolo: boolean
  keepAnonymous: boolean
  picked: string[]
}

/** The draft a link left, read (pure: it is taken out of the store once the sheet has opened with it). */
function readCrewDraft(thread: ReturnType<typeof crewDraftThread>): Partial<CrewDraft> {
  const kept = draftOf(thread)
  if (!kept) return {}
  try {
    return JSON.parse(kept) as Partial<CrewDraft>
  } catch {
    return {}
  }
}

type Made = { crewId: string; chatGroupId: string; invited: number; /** Null until the server's own seed is read. */ emblemSeed: string | null }

/**
 * Make a crew (board 02 A): a sheet over Crews in two steps, and then the crew made.
 *
 * Step 1 · Name and friends: the emblem live beside the name (Shuffle for another look), and the friends to ask, windowed,
 * because they are the point of a crew. Step 2 · Your crew's vibe, all optional: here for, up to 5 of its own hashtags (ideas to tap), the line of at most
 * 140, Room for one more, and the consent sentence. Its button, "Make Nebula · ask 3 friends", is the agreement (the server
 * refuses a crew without it), and nothing is sent before. The server's own sentences come back where they belong: a name it
 * refuses under the name on step 1, a line under the line on step 2, a cap or the 18+ gate in a sheet. System back, the scrim
 * and a drag go back a step before they close.
 */
function NewCrewScreenContent() {
  const reduceMotion = useReducedMotion()
  const [open, setOpen] = useState(true)
  const [step, setStep] = useState<MakeStep>(1)
  /** Which way the last step went: forward from the right, back from the left. Set before the step changes, read when each animation starts. */
  const dir = useSharedValue<StepDir>(1)
  const { user } = useAuth()
  const draftThread = crewDraftThread(user?.id)
  // A link closed this sheet with something in it: it opens again as it was left (step 1, so it reads from the top).
  const [kept] = useState(() => readCrewDraft(draftThread))
  // Taken once it is on screen: a sheet the person closes themselves does not bring it back again.
  useEffect(() => setDraft(draftThread, ''), [draftThread])
  const [name, setName] = useState(kept.name ?? '')
  const [choice, setChoice] = useState<IntentChoice>(kept.choice ?? 'friendship')
  const [tags, setTags] = useState<string[]>(kept.tags ?? [])
  const [openToSolo, setOpenToSolo] = useState(kept.openToSolo ?? false)
  const [keepAnonymous, setKeepAnonymous] = useState(kept.keepAnonymous ?? false)
  const [picked, setPicked] = useState<string[]>(kept.picked ?? [])
  const [errors, setErrors] = useState<{ name?: string; tags?: string }>({})
  // Read now, so the ideas are there when step 2 opens rather than arriving under the field.
  const tagIdeas = useTagIdeas()
  const [refusal, setRefusal] = useState<CrewRefusal | null>(null)
  const [stuck, setStuck] = useState(false)
  const [sending, setSending] = useState(false)
  const [made, setMade] = useState<Made | null>(null)
  /** The emblem's look: random, Shuffle for another, sent with the crew and fixed from then on (SCRUM-1053). */
  const [emblemSeed, setEmblemSeed] = useState(() => newEmblemSeed())
  const shuffle = () => {
    H.select()
    setEmblemSeed(newEmblemSeed())
  }
  // A link closing this sheet before the crew was made: what was typed is kept for next time, told before anything
  // unmounts (`onClosingForLink`). Closed by the person: let go.
  const form = useLatest({ draft: { name, choice, tags, openToSolo, keepAnonymous, picked } as CrewDraft, made: made !== null })
  useEffect(
    () =>
      onClosingForLink(() => {
        const { draft, made: wasMade } = form.current
        const typed = draft.name.trim() || draft.tags.length || draft.picked.length
        if (!wasMade && typed) setDraft(draftThread, JSON.stringify(draft))
      }),
    [draftThread, form],
  )
  /** One create at a time: `sending` lags a fast second tap by a render. */
  const inFlight = useRef(false)

  // Your friends, a page at a time. 'failed' is not "no friends": the step offers a retry.
  const friendList = useFriendsList()
  const { refresh: readFriends } = friendList
  useEffect(() => {
    void readFriends('reset')
  }, [readFriends])

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
  // The emblem the server drew, read once the crew exists. The moment does not wait for it: the crew is made.
  const madeId = made?.crewId
  useEffect(() => {
    if (!madeId) return
    let live = true
    void crewsApi.crew(madeId).then((fresh) => {
      if (live && fresh.success && fresh.data) setMade((m) => (m && m.crewId === madeId ? { ...m, emblemSeed: fresh.data!.emblemSeed } : m))
    })
    return () => {
      live = false
    }
  }, [madeId])

  const next = () => {
    const problem = nameError(name)
    if (problem) {
      setErrors((e) => ({ ...e, name: problem }))
      setStuck(true)
      return
    }
    dir.set(1)
    setStep(2)
  }

  const make = async () => {
    if (inFlight.current) return
    // Tapping Make the crew is the agreement to the sentence above it.
    const body = createCrewBody({ name, bio: '', intent, tags, openToSolo, inviteUserIds: picked, emblemSeed }, { consented: true, keepMeAnonymous: keepAnonymous })
    // The steps hold every limit, so this is only the type's other half.
    if ('problem' in body) return setRefusal({ text: body.problem })
    inFlight.current = true
    setSending(true)
    const result = await crewsApi.create(body)
    if (!result.success || !result.data) {
      inFlight.current = false
      setSending(false)
      // The server's sentence names what it found (a phone number in the bio, the daily cap).
      const text = crewMessage(result, 'create', 'Couldn’t make the crew. Try again.')
      const field = textFieldOf(text, result.field ?? result.errors?.find((e) => e.field)?.field)
      // The name is on step 1 and goes back to stand under it; a tag stands under the tags here; anything else (a cap,
      // the gate) is a sheet.
      if (field === 'name') {
        setErrors({ name: text })
        dir.set(-1)
        setStep(1)
      } else if (field === 'tags') {
        setErrors({ tags: text })
      } else {
        setRefusal({ text, errorCode: result.errorCode })
      }
      setStuck(true)
      return
    }
    H.success()
    const { crewId, chatGroupId, invited } = result.data
    inFlight.current = false
    setSending(false)
    // The moment plays now, and stays until Continue: it is the crew's first beat, not a loading screen to skip.
    setMade({ crewId, chatGroupId, invited, emblemSeed: body.emblemSeed ?? null })
  }

  const close = () => {
    if (sending) return
    if (made) return go()
    // Back a step before out: what was typed is kept.
    if (step > 1) {
      dir.set(-1)
      setStep(1)
    } else setOpen(false)
  }

  const togglePick = (userId: string) =>
    setPicked((p) => (p.includes(userId) ? p.filter((id) => id !== userId) : p.length < CREW_MAX_MEMBERS - 1 ? [...p, userId] : p))

  const actions: SheetAction[] = made
    ? [{ label: 'Continue', kind: 'primary', onPress: go, testID: 'make-continue' }]
    : step === 2
      ? [{ label: makeLabel(cleanName(name), picked.length), kind: 'primary', onPress: () => void make(), loading: sending, refused: stuck, testID: 'make-send' }]
      : // Board 02 A draws Next white; inside a world that pill is never used (foundations C, litSweep), so it keeps today's primary.
        [{ label: 'Next', kind: 'primary', onPress: next, disabled: picked.length === 0, refused: stuck }]

  return (
    <>
      <Sheet
        visible={open}
        onClose={close}
        onDismissed={() => router.back()}
        title={made ? undefined : 'Make a crew'}
        headerNote={made ? undefined : stepNote(step)}
        detents={['tall']}
        actions={actions}
        testID="make"
      >
        {made ? (
          <MadeBeat name={cleanName(name)} emblemSeed={made.emblemSeed} invited={made.invited} onContinue={go} />
        ) : (
          <>
            {/* The step slides 24 pt from the side it travels from on `base`, the old one leaving first (flow10 · 10.2); Reduce Motion fades. */}
            <Animated.View
              key={step}
              testID="make-step"
              entering={stepIn(dir, reduceMotion)}
              exiting={stepOut(dir, reduceMotion)}
              style={styles.step}
            >
              {step === 1 ? (
                <NameAndFriendsStep
                  name={name}
                  onName={(v) => {
                    setName(v)
                    setErrors((e) => ({ ...e, name: undefined }))
                  }}
                  onNameBlur={() => name.trim() && setErrors((e) => ({ ...e, name: nameError(name) }))}
                  nameError={errors.name}
                  emblemSeed={emblemSeed}
                  onShuffle={shuffle}
                  friends={{
                    friends: pickerView(friendList.status, friendList.friends),
                    picked,
                    onToggle: togglePick,
                    onRetry: () => void readFriends('reset'),
                    search: { query: friendList.query, onChange: friendList.search, searching: friendList.searching, active: friendList.searched !== null, offered: friendList.allTotal > FRIEND_SEARCH_OFFER },
                    paging: { hasMore: friendList.hasMore, loadingMore: friendList.loadingMore, moreFailed: friendList.moreFailed, onMore: () => void friendList.loadMore() },
                  }}
                />
              ) : (
                <VibeStep
                  choice={choice}
                  onChoice={setChoice}
                  tags={tags}
                  onTags={(next) => {
                    setTags(next)
                    setErrors((e) => ({ ...e, tags: undefined }))
                  }}
                  tagIdeas={tagIdeas}
                  tagsError={errors.tags}
                  openToSolo={openToSolo}
                  onOpenToSolo={setOpenToSolo}
                  keepAnonymous={keepAnonymous}
                  onKeepAnonymous={setKeepAnonymous}
                />
              )}
            </Animated.View>
          </>
        )}
        {/* Inside the form's sheet, so iOS presents it from that sheet's Modal: a sibling waits for the form to close (lib/modalTurn). */}
        <CrewRefusalSheet refusal={refusal} onClose={() => setRefusal(null)} />
      </Sheet>
    </>
  )
}

/** The step's own column, so the slide moves a block that lays out like the sheet's content. */
const styles = StyleSheet.create({ step: { gap: SPACE.md } })

/** Rose world: one hue on this screen (`HueProvider`). */
export default function NewCrewScreen() {
  return (
    <HueProvider value="rose">
      <RouteModal>
        <NewCrewScreenContent />
      </RouteModal>
    </HueProvider>
  )
}
