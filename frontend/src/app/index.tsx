import { RouterProvider } from '@tanstack/react-router'
import { useState } from 'react'
import { createQueryClient } from '@/lib/query-client'
import { AppProvider } from './provider'
import { createAppRouter } from './router'

export function App() {
  const [queryClient] = useState(createQueryClient)
  const [router] = useState(() => createAppRouter(queryClient))
  return (
    <AppProvider queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProvider>
  )
}
