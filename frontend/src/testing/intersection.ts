// jsdom has no IntersectionObserver (no layout). This stand-in records what's watched, and
// `scrollIntoViewAll` tells every watcher its elements came into view, as scrolling down would.

const watchers = new Set<FakeIntersectionObserver>()

export class FakeIntersectionObserver {
  readonly root = null
  readonly rootMargin = ''
  readonly thresholds: number[] = []
  private readonly watched = new Set<Element>()
  private readonly callback: IntersectionObserverCallback

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    watchers.add(this)
  }

  observe(el: Element) {
    this.watched.add(el)
  }

  unobserve(el: Element) {
    this.watched.delete(el)
  }

  disconnect() {
    this.watched.clear()
    watchers.delete(this)
  }

  takeRecords(): IntersectionObserverEntry[] {
    return []
  }

  show() {
    const entries = [...this.watched].map(
      (target) => ({ target, isIntersecting: true, intersectionRatio: 1 }) as IntersectionObserverEntry,
    )
    if (entries.length) this.callback(entries, this as unknown as IntersectionObserver)
  }
}

/** Every watched element comes into view (e.g. an infinite list's end). */
export function scrollIntoViewAll(): void {
  for (const w of [...watchers]) w.show()
}

export function resetIntersection(): void {
  watchers.clear()
}
