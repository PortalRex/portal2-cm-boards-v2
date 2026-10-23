import { createFileRoute, redirect } from '@tanstack/react-router'

// Old address of Countries, keeping its query.
export const Route = createFileRoute('/more/countries')({
  beforeLoad: ({ location }) => {
    throw redirect({ href: '/stats/countries' + location.searchStr, replace: true })
  },
})
