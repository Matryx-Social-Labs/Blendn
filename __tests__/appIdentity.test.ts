import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The app's name, and the three identifiers that merely look like it.
 *
 * `blendn` appears four times across the config and only two of them are the
 * *name*. The other two are identifiers whose value is a contract with
 * something outside this repo, and "fixing" them the way a reader naturally
 * would is a build-breaking change with no visible symptom until EAS or Google
 * refuses a build.
 */
const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')

describe('the name a person reads is the brand', () => {
  it('is Blend’n on the home screen, not blendn', () => {
    // The house apostrophe, ’, not the typewriter one (r7 L16).
    expect(JSON.parse(read('app.json')).expo.name).toBe('Blend’n')
  })

  it('is Blend’n on iOS', () => {
    // Read as a value, not matched as text: `pod install` re-serialises the plist's whitespace.
    const name = read('ios/blendn/Info.plist').match(
      /<key>CFBundleDisplayName<\/key>\s*<string>([^<]*)<\/string>/
    )?.[1]
    expect(name).toBe('Blend’n')
  })

  it('is Blend’n on Android', () => {
    // ’ needs no escape; a bare typewriter ' would be a resource syntax error that fails the build.
    expect(read('android/app/src/main/res/values/strings.xml')).toContain('<string name="app_name">Blend’n</string>')
  })
})

describe('the identifiers stay lowercase, and that is not an oversight', () => {
  const config = () => JSON.parse(read('app.json')).expo

  it('keeps the EAS slug', () => {
    /*
     * `slug` identifies the project on EAS. Renaming it points the CLI at a
     * project that does not exist, which mints new credentials — and this repo
     * has already lost a build to credentials configured against the wrong
     * state (RELEASING.md, build 101).
     */
    expect(config().slug).toBe('blendn')
  })

  it('keeps the URL scheme', () => {
    /*
     * Two reasons, either sufficient. It is registered in the Google OAuth
     * redirect URIs, so changing it breaks sign-in on every installed build —
     * and an apostrophe is not a legal character in a URL scheme, so the
     * "consistent" version would not resolve at all.
     */
    expect(config().scheme).toBe('blendn')
  })
})
