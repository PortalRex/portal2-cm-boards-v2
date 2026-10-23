import { createFileRoute, redirect } from '@tanstack/react-router'

// Old address of Compare, keeping ?a=&b=.
export const Route = createFileRoute('/compare')({
  beforeLoad: ({ location }) => {
    throw redirect({ href: '/stats/compare' + location.searchStr, replace: true })
  },
})
