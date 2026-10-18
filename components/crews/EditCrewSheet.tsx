import { useEffect, useState } from 'react'

import { toggleTag, type Crew } from '../../lib/crews'
import {
  bioFits,
  crewPatch,
  editOf,
  intentLine,
  intentOf,
  nameError,
  type CrewEdit,
} from '../../lib/crewsScreens'
import type { CrewPatch } from '../../lib/crewsApi'
import { Sheet } from '../ds/Sheet'
import { NameStep } from './MakeSteps'

const REFUSAL_MS = 400
const BIO_TOO_LONG = 'A crew bio is at most 140 characters'

/**
 * Edit crew (the owner's tool): name, line, Here for, tags and Room for one
 * more — Make a crew's first step on a crew that exists. Save sends only what
 * changed; the server's own sentence about a name or a line comes back under
 * the field (`serverError`), anything else on the Save button. The emblem is
 * the crew's real one: it never changes.
 */
export function EditCrewSheet({
  visible,
  crew,
  saving,
  serverError,
  onSave,
  onClose,
}: {
  visible: boolean
  crew: Crew
  saving: boolean
  /** The server's refusal of the last Save, filed under a field. */
  serverError: { field: 'name' | 'bio'; text: string } | null
  onSave: (patch: CrewPatch) => void
  onClose: () => void
}) {
  // The form starts as the crew is each time the sheet opens (the owner keeps this sheet mounted).
  const [edit, setEdit] = useState<CrewEdit>(() => editOf(crew))
  const [errors, setErrors] = useState<{ name?: string; bio?: string }>({})
  const [stuck, setStuck] = useState(false)
  /** The server's refusal this form has since been edited past: it said what was wrong with what was there. */
  const [editedPast, setEditedPast] = useState<typeof serverError>(null)
  const server = serverError && serverError !== editedPast ? serverError : null
  const shown = { name: errors.name ?? (server?.field === 'name' ? server.text : undefined), bio: errors.bio ?? (server?.field === 'bio' ? server.text : undefined) }
  const edited = (change: (e: CrewEdit) => CrewEdit) => {
    setEdit(change)
    setEditedPast(serverError)
  }

  // A refusal from the server shakes Save once, each time it comes (state adjusted in render).
  const [shaken, setShaken] = useState<typeof serverError>(null)
  if (serverError && serverError !== shaken) {
    setShaken(serverError)
    setStuck(true)
  }

  // A refused Save shakes once (#20); the flag drops so the next refusal can shake again.
  useEffect(() => {
    if (!stuck) return
    const timer = setTimeout(() => setStuck(false), REFUSAL_MS)
    return () => clearTimeout(timer)
  }, [stuck])

  const save = () => {
    const problem = { name: nameError(edit.name), bio: bioFits(edit.bio) ? undefined : BIO_TOO_LONG }
    if (problem.name || problem.bio) {
      setErrors(problem)
      setStuck(true)
      return
    }
    const patch = crewPatch(crew, edit)
    if (!patch) return onClose()
    onSave(patch)
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onDismissed={() => {
        setEdit(editOf(crew))
        setErrors({})
      }}
      title="Edit crew"
      detents={['tall']}
      actions={[
        { label: 'Save', kind: 'primary', onPress: save, loading: saving, refused: stuck },
        { label: 'Cancel', kind: 'tertiary', onPress: onClose },
      ]}
      testID="crew-edit"
    >
      <NameStep
        name={edit.name}
        onName={(name) => {
          edited((e) => ({ ...e, name }))
          setErrors((e) => ({ ...e, name: undefined }))
        }}
        nameError={shown.name}
        bio={edit.bio}
        onBio={(bio) => {
          edited((e) => ({ ...e, bio }))
          setErrors((e) => ({ ...e, bio: undefined }))
        }}
        bioError={shown.bio}
        choice={edit.choice}
        onChoice={(choice) => edited((e) => ({ ...e, choice }))}
        tags={edit.tags}
        onTag={(slug) => edited((e) => ({ ...e, tags: toggleTag(e.tags, slug) }))}
        openToSolo={edit.openToSolo}
        onOpenToSolo={(openToSolo) => edited((e) => ({ ...e, openToSolo }))}
        previewSeed={crew.emblemSeed}
        intentText={intentLine(edit.choice ? intentOf(edit.choice) : crew.intent) ?? ''}
      />
    </Sheet>
  )
}
