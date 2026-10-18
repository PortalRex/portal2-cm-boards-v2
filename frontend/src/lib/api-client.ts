import { env } from '@/config/env'

/** Query string values; `null`, `undefined` and `''` are left out (as legacy `getJson` did). */
export type QueryParams = Record<string, string | number | boolean | null | undefined>

export interface RequestOptions {
  params?: QueryParams
  /** JSON-encoded unless it is FormData (demo and image uploads). */
  body?: unknown
  signal?: AbortSignal
}

/** A non-2xx answer. `message` is the server's own text when it sent one. */
export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function buildUrl(path: string, params?: QueryParams) {
  const url = new URL(env.VITE_API_URL + path, window.location.origin)
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value != null && value !== '') url.searchParams.set(key, String(value))
  }
  return url
}

/** An absolute address under the API, for links and `<img>` sources (demo downloads, images, sign-in). */
export function apiUrl(path: string, params?: QueryParams): string {
  return buildUrl(path, params).toString()
}

// The server answers errors with `{ "error": "..." }` or a plain-text reason. A proxy's error
// page (HTML) isn't a message to show.
async function errorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  let message = text.trim()
  if (message.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(message)
      if (parsed && typeof parsed === 'object' && 'error' in parsed && typeof parsed.error === 'string') {
        message = parsed.error
      }
    } catch {
      // Not JSON after all: keep the text.
    }
  }
  if (message && !message.startsWith('<')) return message
  if (res.status === 401) return 'Sign in required.'
  if (res.status === 403) return 'Not allowed.'
  if (res.status === 504 || res.status === 524) return 'The server took too long to answer.'
  return `Request failed (${res.status})`
}

export interface ApiResponse<T> {
  status: number
  data: T
}

/**
 * Sends a request and returns the status and the parsed JSON body (`null` when the answer has
 * no JSON body). Throws `ApiError` for non-2xx answers.
 */
export async function request<T>(
  method: string,
  path: string,
  { params, body, signal }: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const init: RequestInit = { method, credentials: 'include', signal }
  if (body instanceof FormData) {
    init.body = body
  } else if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { 'Content-Type': 'application/json' }
  }
  const res = await fetch(buildUrl(path, params), init)
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res))
  const isJson = res.headers.get('content-type')?.includes('application/json')
  const data = (isJson && res.status !== 204 ? await res.json() : null) as T
  return { status: res.status, data }
}

const send =
  (method: string) =>
  async <T>(path: string, options?: RequestOptions): Promise<T> =>
    (await request<T>(method, path, options)).data

export const api = {
  get: send('GET'),
  post: send('POST'),
  put: send('PUT'),
  delete: send('DELETE'),
}
