import { isCrewWave, type AnyWave } from '../../lib/receivedWaves'
import { Avatar } from './Avatar'
import { CrewFace } from './CrewFace'
import type { PileFace } from './Facepile'

/** Who waved, drawn: a person's creature, a crew's square emblem. Decorative: the name beside it is what is read. */
export function WaveFace({ wave, size, testID }: { wave: AnyWave; size: number; testID?: string }) {
  if (isCrewWave(wave)) return <CrewFace seed={wave.emblemSeed} size={size} testID={testID} />
  return <Avatar size={size} kind="creature" pseudonym={wave.displayName} testID={testID} />
}

export const waveFace = (w: AnyWave): PileFace => (isCrewWave(w) ? { kind: 'crew', seed: w.emblemSeed } : { kind: 'creature', pseudonym: w.displayName })
