import { idParam, nameParam } from '../lib/routeParams'

describe("a chat link’s params are checked before use", () => {
  it('an id is one segment the server could have minted', () => {
    expect(idParam('3f1c2a9e-7b4d-4c1e-9a2b-0d6e5f4a3b2c')).toBe('3f1c2a9e-7b4d-4c1e-9a2b-0d6e5f4a3b2c')
    for (const bad of ['../../users/me', 'a/b', 'a?x=1', 'a%2F..', '', ' id', ['a'], undefined, 'x'.repeat(65)]) {
      expect(idParam(bad)).toBeNull()
    }
  })

  it('a name is plain bounded text, emoji kept', () => {
    expect(nameParam('Vinyl Night 👨‍👩‍👧')).toBe('Vinyl Night 👨‍👩‍👧')
    expect(nameParam('‮troppus nidnelB\u0007')).toBe('troppus nidnelB')
    expect(nameParam('x'.repeat(200))).toHaveLength(80)
    expect(nameParam('a\u200Bb\uFEFFc\u2028d')).toBe('abcd')
    // 80 code points of emoji: never half a surrogate pair, never a dangling joiner.
    const cut = nameParam('😀'.repeat(79) + '👨‍👩‍👧') as string
    expect(Array.from(cut)).toHaveLength(80)
    expect(cut.endsWith('👨')).toBe(true)
    expect(nameParam('\u200B\u202E')).toBeUndefined()
    expect(nameParam('  ')).toBeUndefined()
    expect(nameParam(['a'])).toBeUndefined()
  })
})
