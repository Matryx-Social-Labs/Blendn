import { readFileSync } from 'fs'
import { join } from 'path'
import { connectDisclosure, CONNECT_MESSAGE_MAX } from '../components/grid/ConnectSheet'

/**
 * Connect — the composer, and the sentence that makes it honest.
 *
 * Sending a request reveals your real name and photo. That is the design, not a
 * leak. But a reveal that surprises somebody is a failure whatever the
 * reasoning, so what the sheet *says* is load-bearing, and it is the kind of
 * string a well-meaning edit breaks silently.
 */
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const SHEET = () => stripComments(read('components/grid/ConnectSheet.tsx'))
const CARD = () => stripComments(read('components/grid/GridCard.tsx'))

describe('the disclosure names people the way the server does', () => {
  it('uses the pseudonym when they have not revealed', () => {
    /*
     * The rule this exists for: "Priya will see your name and photo" on a
     * pseudonymous roster treats an unrevealed person as having a knowable real
     * name — the identity gate's mistake, made in prose.
     */
    const copy = connectDisclosure('Cosmic Panda', false)
    expect(copy).toContain('Cosmic Panda will see your name and photo')
  })

  it('says what you do not get back', () => {
    /*
     * Without this, "Connect" reads as a mutual reveal. It is not: you show
     * your name and face, they stay a pseudonym until they choose otherwise.
     * An asymmetry nobody was told about is a surprise that lands on the wrong
     * person, after the fact.
     */
    const copy = connectDisclosure('Cosmic Panda', false)
    expect(copy).toContain("You'll still see them as Cosmic Panda")
  })

  it('drops the second sentence once they are already revealed', () => {
    // There is no asymmetry left to warn about, and a warning about nothing
    // teaches people to skip the ones that matter.
    const copy = connectDisclosure('Julian Ember', true)
    expect(copy).toBe('Julian Ember will see your name and photo.')
  })

  it('never invents a name it was not given', () => {
    const copy = connectDisclosure('   ', false)
    expect(copy).not.toContain('undefined')
    expect(copy).not.toContain('null')
    expect(copy.startsWith('They')).toBe(true)
  })

  it('interpolates only the resolved display name', () => {
    /*
     * The guard, not the string: no other name-shaped field may reach this copy.
     * A real name in here is a leak even when the sentence reads correctly for
     * the person who wrote it.
     */
    const src = SHEET()
    const fn = src.slice(src.indexOf('export function connectDisclosure'))
    const body = fn.slice(0, fn.indexOf('\n}'))
    expect(body).not.toContain('realName')
    expect(body).not.toContain('user.name')
    expect(body).not.toContain('profile')
  })
})

describe('the cost is stated before the effort', () => {
  it('puts the disclosure above the input, not behind a confirmation', () => {
    /*
     * Somebody who has typed a paragraph has already decided. The cost belongs
     * where it can still change the answer.
     */
    const src = SHEET()
    expect(src.indexOf('connectDisclosure(')).toBeLessThan(src.indexOf('<TextInput'))
  })

  it('says the request is one-shot', () => {
    // The strongest protection in the feature and the only one with a
    // consequence the sender should weigh before sending.
    expect(SHEET()).toContain('You can only send one request to someone.')
  })

  it('refuses an empty or whitespace-only message', () => {
    // The server requires it too; this stops the round trip that would fail.
    expect(SHEET()).toContain('const canSend = trimmed.length > 0')
  })

  it('agrees with the server about the limit', () => {
    // `z.string().trim().min(1).max(500)`.
    expect(CONNECT_MESSAGE_MAX).toBe(500)
  })
})

describe('the card keeps the two actions apart', () => {
  it('takes both handlers, and they are not the same one', () => {
    const src = CARD()
    expect(src).toContain('onLike: () => void')
    expect(src).toContain('onConnect: () => void')
  })

  it('makes the like the prominent button', () => {
    /*
     * The safe, symmetric, reversible action is the easy one. Making the button
     * with a cost the more attractive one is how people reveal themselves by
     * reflex.
     */
    const src = CARD()
    const actions = src.slice(src.indexOf('<View style={styles.actions}>'))
    expect(actions.indexOf('onPress={onLike}')).toBeLessThan(actions.indexOf('onPress={onConnect}'))
    const like = actions.slice(actions.indexOf('onPress={onLike}'), actions.indexOf('onPress={onConnect}'))
    expect(like).toContain('EMBER_GRADIENT')
  })

  it('tells a screen reader what each one costs', () => {
    /*
     * The difference between them is invisible otherwise: two buttons, both
     * meaning "I want to talk", one of which publishes your identity.
     */
    const src = CARD()
    expect(src).toContain('They are only told if they like you back')
    expect(src).toContain('shows them your name and photo')
  })

  it('opens the profile from the card, not a third button', () => {
    // Three buttons would make the two that matter compete.
    const src = CARD()
    expect(src).not.toContain('View Profile')
    expect(src).toContain("accessibilityLabel={`View ${person.name}'s profile`}")
  })
})
