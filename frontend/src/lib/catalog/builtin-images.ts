// The site's bundled chamber images, by map id: Portal 2 by Steam leaderboard id
// (assets/chambers/<id>.jpg), Mel by board id (assets/mel/<id>.jpg, from melboard; their license
// is in assets/mel/NOTICE.md).
const byId = (files: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(files).map(([path, url]) => [
      path.slice(path.lastIndexOf('/') + 1).replace(/\.\w+$/, ''),
      url,
    ]),
  )

export const CHAMBER_IMAGES: Record<string, string> = byId(
  import.meta.glob<string>('../../assets/chambers/*.jpg', { eager: true, import: 'default' }),
)

export const MEL_IMAGES: Record<string, string> = byId(
  import.meta.glob<string>('../../assets/mel/*.jpg', { eager: true, import: 'default' }),
)
