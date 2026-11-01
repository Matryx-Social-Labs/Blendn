/**
 * RC drive 5's long-content defects (iOS AX XXXL, Android 360 dp at 1.3): headlines that broke inside a word, rows whose
 * text was squeezed to a sliver by a piece beside it, and names cut to three letters.
 */
import { act, render, screen } from '@testing-library/react-native'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import React from 'react'
import { Dimensions, StyleSheet } from 'react-native'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({ apiClient: {} }))

/* eslint-disable import/first */
import { OnboardingScreen } from '../components/onboarding/OnboardingScreen'
import { BringSomeoneRow } from '../components/share/BringSomeoneRow'
import { RequestCard } from '../components/banter/BanterParts'
import { NAME_LINES_ALONE, PersonRow, PERSON_ROW_HEIGHT } from '../components/friends/PersonRow'
import { InviteRow } from '../components/crews/InviteRow'
import { RegularAsk, RegularOn } from '../components/offer/OfferSections'
import { ArrivalBanner } from '../components/share/ArrivalBanner'
import { CONTROL_FONT_CAP } from '../components/ds/shared'
import { MAX_FONT_SCALE, SPACE, TYPE } from '../lib/design/tokens'
import { AX_XXXL } from './helpers/ax'
/* eslint-enable import/first */

const window = Dimensions.get('window')
const at = (width: number, fontScale: number) => act(async () => Dimensions.set({ window: { ...window, width, fontScale }, screen: { ...window, width, fontScale } }))
afterEach(() => Dimensions.set({ window, screen: window }))
const hidden = { includeHiddenElements: true }

/**
 * The widest single word a display headline carries, in ems of Satoshi Black (Bold Text's weight for display): "notifications"
 * 5.67, "preferences" 5.53 (measured from assets/fonts/satoshi with opentype.js, tracking included). A word wider than its
 * line is broken inside it: "journe / y", "prefer / ences" at AX XXXL, where display was uncapped (RC drive 5).
 */
const WIDEST_HEADLINE_WORD_EM = 5.67
/** The narrowest line a page headline gets: a 360 dp phone less the page gutters. */
const NARROWEST_HEADLINE_LINE = 360 - 2 * SPACE.gutter

describe('display headlines never break inside a word', () => {
  it('the display cap keeps the widest headline word on one line of the narrowest page', () => {
    expect(WIDEST_HEADLINE_WORD_EM * TYPE.display.fontSize * MAX_FONT_SCALE.display).toBeLessThanOrEqual(NARROWEST_HEADLINE_LINE)
  })

  it('the onboarding frame: the headline stops at the display cap, the bar’s "Step n of 5" at a control’s, the subtitle at body’s', async () => {
    await at(402, AX_XXXL)
    await render(<OnboardingScreen step="preferences" title="Your " titleAccent="preferences" subtitle="Who you’d like to meet." ctaLabel="Continue" onContinue={jest.fn()} />)
    expect(screen.getByTestId('onboarding-title', hidden).props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.display)
    expect(screen.getByTestId('onboarding-step', hidden).props.maxFontSizeMultiplier).toBe(CONTROL_FONT_CAP)
    expect(screen.getByText('Who you’d like to meet.', hidden).props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.body)
  })

  it('every Text drawn in the display role says how far it may grow', () => {
    const root = join(__dirname, '..')
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (path.endsWith('.tsx')) files.push(path)
      }
    }
    walk(join(root, 'app'))
    walk(join(root, 'components'))
    const uncapped = files.flatMap((path) => {
      const src = readFileSync(path, 'utf8')
      // Each opening <Text ...> tag (to its first unnested ">"), one that sets the display role inline.
      return [...src.matchAll(/<(?:RN)?Text\b((?:[^>{]|\{(?:[^{}]|\{[^{}]*\})*\})*)>/g)]
        .filter((m) => m[1].includes("font('display'") && !m[1].includes('maxFontSizeMultiplier'))
        .map((m) => `${relative(root, path)}: ${m[1].trim().slice(0, 60)}`)
    })
    expect(uncapped).toEqual([])
  })
})

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, hidden).props.style)

/**
 * A text column beside a piece that never shrinks keeps six ems of its role (`useMinMeasure`), as a basis AND a minimum: it
 * is the row's one child that grows and shrinks, and Yoga gives such a child a zero basis whatever its style says.
 */
const measureOf = (role: keyof typeof TYPE, fontScale: number) => Math.round(6 * TYPE[role].fontSize * Math.min(fontScale, MAX_FONT_SCALE[role]))

describe('the Scene’s "Bring someone?" (AX XXXL: one letter a line beside WhatsApp and the share circle)', () => {
  const row = () => render(<BringSomeoneRow eventTitle="Premier League Screening" onWhatsApp={jest.fn()} onShare={jest.fn()} testID="bring" />)

  it('the words keep their measure and the controls wrap under them', async () => {
    await at(402, AX_XXXL)
    await row()
    expect(flat('bring')).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' })
    expect(flat('bring-text')).toMatchObject({ flexGrow: 1, flexBasis: measureOf('bodyStrong', AX_XXXL), minWidth: measureOf('bodyStrong', AX_XXXL) })
    expect(flat('bring-text').flex).toBeUndefined()
    expect(screen.getByTestId('bring-controls', hidden)).toContainElement(screen.getByTestId('bring-share', hidden))
    expect(screen.getByText('Bring someone?', hidden).props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.bodyStrong)
    expect(screen.getByText('You’re going. Send the night on.', hidden).props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.meta)
  })

  it('360 dp at 1.3 takes the measure too; 402 dp at 1.0 is laid out as before', async () => {
    await at(360, 1.3)
    await row()
    expect(flat('bring-text').minWidth).toBe(measureOf('bodyStrong', 1.3))
    await at(402, 1)
    await row()
    expect(flat('bring-text')).toMatchObject({ flexBasis: 0, minWidth: 0 })
  })
})

describe('a request card at AX XXXL (Banter, Requests: "Arn…", "Bh…" at 61 pt)', () => {
  const card = () =>
    render(<RequestCard face={null} name="Arnav Sharma" note="Hi! We were at the same screening." time="9h" onAccept={jest.fn()} onDecline={jest.fn()} onMore={jest.fn()} testID="req" />)

  it('the name and the note grow to their caps and double their lines; the time stops at a control’s cap', async () => {
    await at(402, AX_XXXL)
    await card()
    const name = screen.getByText('Arnav Sharma', hidden)
    expect(name.props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.bodyStrong)
    expect(name.props.numberOfLines).toBe(2)
    const note = screen.getByText('Hi! We were at the same screening.', hidden)
    expect(note.props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.meta)
    expect(note.props.numberOfLines).toBe(4)
    expect(screen.getByText('9h', hidden).props.maxFontSizeMultiplier).toBe(CONTROL_FONT_CAP)
  })

  it('below the accessibility sizes it is one line and two, as before', async () => {
    await at(402, 1)
    await card()
    expect(screen.getByText('Arnav Sharma', hidden).props.numberOfLines).toBe(1)
    expect(screen.getByText('Hi! We were at the same screening.', hidden).props.numberOfLines).toBe(2)
  })
})

describe('a person row (Friends here at 360 dp and 1.3: "Aarav …" beside Message)', () => {
  const person = { userId: 'u1', name: 'Aarav Sharma', photo: null }

  it('a name with no line under it may take two lines, and at the default size two lines fit the row', async () => {
    await render(<PersonRow person={person as never} trailing={null} />)
    expect(screen.getByTestId('person-name', hidden).props.numberOfLines).toBe(NAME_LINES_ALONE)
    expect(NAME_LINES_ALONE * TYPE.bodyStrong.lineHeight).toBeLessThanOrEqual(PERSON_ROW_HEIGHT)
  })

  it('with a line under it the name keeps one line below the AX sizes; the row is a minimum, so a longer line grows it (DS-05)', async () => {
    await at(360, 1.3)
    await render(<PersonRow person={person as never} detail="Requested" />)
    expect(screen.getByTestId('person-name', hidden).props.numberOfLines).toBe(1)
    expect(flat('person-row')).toMatchObject({ minHeight: PERSON_ROW_HEIGHT })
    expect(flat('person-row').height).toBeUndefined()
  })
})

describe('the same squeeze, swept: a sentence beside one action keeps its measure and the action wraps under it', () => {
  const invite = { id: 'i1', crewId: 'c1', name: 'The Usual Suspects', invitedBy: 'Aisha', invitedAt: new Date().toISOString(), emblemSeed: 'x', size: 6 } as never

  it('Crews › an invite, at AX XXXL beside See invite', async () => {
    await at(402, AX_XXXL)
    await render(<InviteRow row={{ invite, lapsed: false }} onSee={jest.fn()} />)
    expect(flat('invite-row-body')).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' })
    expect(flat('invite-row-text')).toMatchObject({ flexGrow: 1, minWidth: measureOf('bodyStrong', AX_XXXL), flexBasis: measureOf('bodyStrong', AX_XXXL) })
    expect(screen.getByText('Aisha invited you to The Usual Suspects', hidden).props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.bodyStrong)
  })

  it('the regular ask, at 360 dp and AX XXXL with a long venue and owner: every line wraps whole, capped, none truncated (SCRUM-888)', async () => {
    await at(360, AX_XXXL)
    await render(<RegularAsk venueName="The Big Pitcher Brewing Company" prefs={{ ownerName: 'Indiranagar Hospitality Group Private Limited' }} saving={false} onYes={jest.fn()} onLater={jest.fn()} />)
    for (const text of [
      screen.getByText(/will see that a regular was here, and how many nights in the last 30 days/, hidden),
      screen.getByText('who you are, your chats, who you met, or anywhere else you go', hidden),
      screen.getByText('so the staff know when a regular is in', hidden),
    ]) {
      expect(text.props.numberOfLines).toBeUndefined()
      expect(text.props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE.meta)
    }
    expect(screen.queryByText(/first name/i, hidden)).toBeNull()
  })

  it('a venue’s "knows you’re a regular", at 360 dp and 1.3 beside Turn off', async () => {
    await at(360, 1.3)
    await render(<RegularOn venueName="The Big Pitcher Brewing Company" saving={false} onOff={jest.fn()} />)
    expect(flat('regular-on-body')).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' })
    expect(flat('regular-on-text')).toMatchObject({ flexGrow: 1, minWidth: measureOf('bodyStrong', 1.3) })
    expect(flat('regular-on-text').flex).toBeUndefined()
  })
})

describe('the arrival banner (P3: two lines held to one each beside Open and ×)', () => {
  const banner = () => render(<ArrivalBanner title="Neon Nights at the Bandstand" meta="Sat 4 Oct, 9 PM · Toit Brewpub" onOpen={jest.fn()} onDismiss={jest.fn()} testID="arrival" />)

  it('at 360 dp and 1.3 the sentence keeps its measure and Open and × wrap under it', async () => {
    await at(360, 1.3)
    await banner()
    expect(flat('arrival-body')).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' })
    expect(flat('arrival-text')).toMatchObject({ flexGrow: 1, minWidth: measureOf('meta', 1.3), flexBasis: measureOf('meta', 1.3) })
    expect(flat('arrival-text').flex).toBeUndefined()
    expect(screen.getByTestId('arrival-body', hidden)).toContainElement(screen.getByTestId('arrival-open', hidden))
    // Two single lines, as the frame draws them: the measure is what gives them room.
    expect(screen.getByText('You were sent Neon Nights at the Bandstand', hidden).props.numberOfLines).toBe(1)
  })

  it('402 dp at 1.0 is laid out as before: one row', async () => {
    await at(402, 1)
    await banner()
    expect(flat('arrival-text')).toMatchObject({ flexBasis: 0, minWidth: 0 })
  })
})
