import { createFileRoute } from '@tanstack/react-router'

// Stub until the profiles feature (5.5); PlayerLink links here.
export const Route = createFileRoute('/profile/$profileId')({
  component: () => <h1 className="p-4 text-2xl font-semibold">Profile</h1>,
})
