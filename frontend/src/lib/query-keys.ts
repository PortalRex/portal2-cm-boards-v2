// Every query key on the site comes from here, so a change in one feature can invalidate another
// feature's queries without importing it (see lib/invalidate.ts).
export const queryKeys = {
  catalog: () => ['catalog'] as const,
}
