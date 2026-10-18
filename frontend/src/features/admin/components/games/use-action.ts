import { useMutation } from '@tanstack/react-query'

/**
 * Runs one editor call at a time with its busy and error state. `run` resolves to the call's
 * answer, or undefined when it failed (the error then shows next to the control).
 */
export function useAction() {
  const action = useMutation({ mutationFn: (fn: () => Promise<unknown>) => fn() })
  const run = async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      return (await action.mutateAsync(fn)) as T
    } catch {
      return undefined
    }
  }
  return { busy: action.isPending, error: action.error?.message ?? null, run }
}
