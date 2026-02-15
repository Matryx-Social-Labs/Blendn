export type LiveSyncDomain = 'chat' | 'events' | 'match'

const dirtyDomains = new Set<LiveSyncDomain>()
const subscribers = new Set<(domain: LiveSyncDomain) => void>()

export function markDomainDirty(domain: LiveSyncDomain): void {
  dirtyDomains.add(domain)
  subscribers.forEach((cb) => {
    try {
      cb(domain)
    } catch {}
  })
}

export function markDomainsDirty(domains: LiveSyncDomain[]): void {
  domains.forEach((domain) => markDomainDirty(domain))
}

export function isDomainDirty(domain: LiveSyncDomain): boolean {
  return dirtyDomains.has(domain)
}

export function hasDirtyDomain(domains: LiveSyncDomain[]): boolean {
  return domains.some((domain) => dirtyDomains.has(domain))
}

export function clearDirtyDomain(domain: LiveSyncDomain): void {
  dirtyDomains.delete(domain)
}

export function clearDirtyDomains(domains: LiveSyncDomain[]): void {
  domains.forEach((domain) => dirtyDomains.delete(domain))
}

export function subscribeDirtyDomains(callback: (domain: LiveSyncDomain) => void): () => void {
  subscribers.add(callback)
  return () => {
    subscribers.delete(callback)
  }
}
