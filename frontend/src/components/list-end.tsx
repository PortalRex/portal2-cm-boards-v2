/**
 * The end of a list that grows as it's scrolled ([useEndlessRows]): where scrolling near loads
 * more, saying so, or that the next page couldn't be loaded, with a way to try again.
 */
export function ListEnd({
  endRef,
  failed = false,
  onRetry,
  testId,
}: {
  endRef: (el: Element | null) => void
  failed?: boolean
  onRetry?: () => void
  testId?: string
}) {
  return (
    <div ref={endRef} className="py-4 text-center text-text-muted" data-testid={testId}>
      {failed ? (
        <>
          Couldn’t load more runs.{' '}
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 text-brand-light hover:underline"
            onClick={onRetry}
          >
            Try again
          </button>
        </>
      ) : (
        'Loading more…'
      )}
    </div>
  )
}
