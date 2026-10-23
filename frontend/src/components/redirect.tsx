import { useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'

/** Sends the browser to a site path given as a string (replacing this page in the history). */
export function Redirect({ href }: { href: string }) {
  const router = useRouter()
  useEffect(() => {
    void router.navigate({ href, replace: true })
  }, [router, href])
  return null
}
