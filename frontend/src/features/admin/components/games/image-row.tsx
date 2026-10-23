import { cn } from 'cn'
import { chips, error, hint, textDanger, upload } from './styles'
import { useAction } from './use-action'

/**
 * A picture with upload / replace and remove: a game's logo or background, or a map's image.
 * `src` is the uploaded one, else the site's built-in one; removing goes back to the built-in one.
 */
export function ImageRow({
  label,
  src,
  uploaded,
  builtIn,
  thumb,
  emptyText,
  labelClassName,
  note,
  onUpload,
  onRemove,
  onChanged,
}: {
  label: string
  src: string | null
  uploaded: boolean
  builtIn: boolean
  thumb: 'logo' | 'image'
  emptyText: string
  labelClassName?: string
  note?: string
  onUpload: (file: File) => Promise<unknown>
  onRemove: () => Promise<unknown>
  onChanged: () => void
}) {
  const { busy, error: failure, run } = useAction()
  const name = label.toLowerCase()
  return (
    <div className={chips}>
      <span className={cn(hint, labelClassName)}>{label}</span>
      {src ? (
        <img
          className={
            thumb === 'logo'
              ? 'h-[52px] w-auto max-w-[120px] object-contain'
              : 'h-[52px] w-[120px] rounded-[4px] border border-line object-cover'
          }
          src={src}
          alt=""
        />
      ) : (
        <span className={hint}>{emptyText}</span>
      )}
      <label className={upload}>
        {busy ? 'Uploading…' : uploaded ? `Replace ${name}` : `Upload ${name}`}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          aria-label={`${uploaded ? 'Replace' : 'Upload'} ${name}`}
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file && (await run(() => onUpload(file))) !== undefined) onChanged()
          }}
        />
      </label>
      {uploaded && (
        <button
          type="button"
          className={textDanger}
          disabled={busy}
          onClick={async () => {
            if ((await run(onRemove)) !== undefined) onChanged()
          }}
        >
          {builtIn ? `Use the built-in ${name}` : `Remove ${name}`}
        </button>
      )}
      {note && <span className={hint}>{note}</span>}
      {failure && <span className={error}>{failure}</span>}
    </div>
  )
}
