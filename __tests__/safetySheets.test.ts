import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The safety flows reach every option on both platforms.
 *
 * They were `Alert.alert` with four to seven buttons, and Android draws three:
 * "Block and report", most report reasons, and "Other" did not exist there.
 * The leave-and-report path also sent `reason: 'other'` for every report.
 *
 * Source assertions, like `eventReport.test.ts`: `safetyUtils` pulls in
 * `apiClient`, which a node test environment cannot load.
 */
const read = (p: string) =>
  readFileSync(join(__dirname, '..', p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const SAFETY = read('lib/safetyUtils.ts')

describe('safety sheets', () => {
  it('never uses Alert, which drops buttons past the third on Android', () => {
    expect(SAFETY).not.toMatch(/Alert\.alert|from 'react-native'/)
    expect(SAFETY).toContain("from './sheet'")
  })

  it('asks why when leaving and reporting, instead of sending "other"', () => {
    expect(SAFETY).not.toMatch(/reason: 'other'/)
    expect(SAFETY).toMatch(/run: \(reason, description\) => leave\(action, \{ reason/)
  })

  it('sends the optional note with every report', () => {
    expect(SAFETY).toMatch(/reportUser\(userId, reason as ReportType, description\)/)
    expect(SAFETY).toMatch(/reportMessage\(messageId, messageType, reason as MessageReportType, description\)/)
    expect(SAFETY).toMatch(/reportEvent\(eventId, reason as EventReportType, description\)/)
  })

  it('is drawn by one host, mounted at the root', () => {
    expect(read('app/_layout.tsx')).toContain('<SheetHost />')
    // Every action gets its own row: four in the default layout put three in one.
    expect(read('components/SheetHost.tsx')).toContain('layout="stack"')
  })
})

describe('the chat screens say what failed', () => {
  it('shows a load failure, not the empty state, in both', () => {
    expect(read('app/chat/[id].tsx')).toMatch(/loadError \? \([\s\S]{0,80}<ChatLoadFailed/)
    expect(read('app/private-chat/[conversationId].tsx')).toMatch(/loadError \? \([\s\S]{0,80}<ChatLoadFailed/)
  })

  it('keeps a failed send as a marked bubble in both', () => {
    for (const screen of ['app/chat/[id].tsx', 'app/private-chat/[conversationId].tsx']) {
      const src = read(screen)
      expect(src).toContain('failed={item.failed}')
      expect(src).toContain('onRetry={item.failed ?')
      expect(src).not.toMatch(/setNewMessage\(messageText\)/)
    }
    expect(read('components/chat/ChatBubble.tsx')).toContain('Not sent · Tap to retry')
  })
})
