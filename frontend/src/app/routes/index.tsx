import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: () => <h1 className="p-4 text-2xl font-semibold">Score Updates</h1>,
})
