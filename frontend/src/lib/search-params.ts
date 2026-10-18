// Query strings as plain text, like the legacy site's URLs. TanStack Router's default parser
// JSON-parses each value, which turns Steam ids (?a=76561198000000001) into numbers that lose
// their last digits, and writes number-like strings back quoted. Routes convert values they need
// as numbers in their zod search schemas instead.

export type SearchRecord = Record<string, string>

export function parseSearch(searchStr: string): SearchRecord {
  return Object.fromEntries(new URLSearchParams(searchStr.startsWith('?') ? searchStr.slice(1) : searchStr))
}

export function stringifySearch(search: Record<string, unknown>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(search)) {
    if (value == null || value === '' || value === false) continue
    params.set(key, value === true ? 'true' : String(value))
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}
