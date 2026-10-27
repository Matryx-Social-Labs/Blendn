/** A URL's host, for a log line: what failed is said without its path or query (`unparsed` when it has no host). */
export const hostOf = (url: string): string => /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url)?.[1] ?? 'unparsed'
