/** A 16:9 YouTube player (privacy-enhanced domain). Ids may carry a query ("abc?start=30"). */
export function YouTubeEmbed({
  id,
  title = 'YouTube video',
}: {
  id: string | null | undefined
  title?: string
}) {
  if (!id) {
    return (
      <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border border-track bg-row-sub-alt text-text-dim">
        No video
      </div>
    )
  }
  const [videoId, query] = id.split('?')
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
      <iframe
        className="absolute inset-0 size-full border-0"
        src={`https://www.youtube-nocookie.com/embed/${videoId}${query ? `?${query}` : ''}`}
        title={title}
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  )
}
