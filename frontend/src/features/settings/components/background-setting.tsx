import { cn } from 'cn'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { BACKGROUND_PRESETS } from '@/components/layouts/backdrops'
import { siteBackground } from '@/components/layouts/backgrounds'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useBackground } from '@/hooks/use-background'
import { IMAGE_ADDRESS_RULE, imageAddress } from '@/lib/image-address'

const SITE = 'site'
const PICTURE = 'picture'

/** A choice with a small preview of what it puts behind the pages. */
function Swatch({
  value,
  label,
  className,
  style,
  children,
}: {
  value: string
  label: string
  className?: string
  style?: CSSProperties
  /** A preset's scene, drawn in the tile. */
  children?: ReactNode
}) {
  return (
    <ToggleGroupItem
      value={value}
      className="h-auto flex-col gap-1.5 rounded-md border-0 bg-transparent p-1.5 text-[15px] font-normal text-text-2 hover:bg-seg-hover data-[state=on]:bg-seg-active data-[state=on]:text-foreground"
    >
      <span
        aria-hidden
        className={cn('relative block h-16 w-28 overflow-hidden rounded-[4px] border border-line', className)}
        style={style}
      >
        {children}
      </span>
      {label}
    </ToggleGroupItem>
  )
}

const picture = (address: string): CSSProperties => ({ backgroundImage: `url("${address}")` })

/**
 * A background behind every page in this browser, in place of the site's (map and profile pictures
 * too): the site's own, a preset, or a picture on Steam or Imgur.
 */
export function BackgroundSetting({
  button,
  control,
  note,
}: {
  /** The page's button, text field and note styles. */
  button: string
  control: string
  note: string
}) {
  const [chosen, setChosen] = useBackground()
  const [address, setAddress] = useState('')
  const [refused, setRefused] = useState(false)
  const value = !chosen ? SITE : chosen.kind === 'preset' ? chosen.preset.id : PICTURE

  const applyPicture = () => {
    const ok = imageAddress(address.trim())
    setRefused(!ok)
    if (!ok) return
    setChosen(ok)
    setAddress('')
  }

  return (
    <>
      <ToggleGroup
        type="single"
        aria-label="Background"
        value={value}
        // Radix sends '' when the chosen one is clicked again; your picture is set by its address.
        onValueChange={(v) => v && v !== PICTURE && setChosen(v === SITE ? null : v)}
        className="flex-wrap gap-1.5"
      >
        <Swatch
          value={SITE}
          label="Site default"
          className="bg-cover bg-center"
          style={picture(siteBackground)}
        />
        {BACKGROUND_PRESETS.map((p) => (
          <Swatch key={p.id} value={p.id} label={p.label}>
            <p.Scene preview />
          </Swatch>
        ))}
        {chosen?.kind === 'image' && (
          <Swatch
            value={PICTURE}
            label="Your picture"
            className="bg-cover bg-center"
            style={picture(chosen.address)}
          />
        )}
      </ToggleGroup>
      <form
        className="mt-3 flex flex-wrap items-center gap-2.5"
        onSubmit={(e) => {
          e.preventDefault()
          applyPicture()
        }}
      >
        <input
          className={cn(control, 'w-[360px] max-w-full')}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Steam or Imgur image address (https://…)"
          aria-label="Background picture address"
        />
        <button type="submit" className={button} disabled={!address.trim()}>
          Use picture
        </button>
      </form>
      {refused && (
        <p className="mt-1.5 mb-0 max-w-[640px] text-base text-hl-red-text">{IMAGE_ADDRESS_RULE}</p>
      )}
      <p className={note}>
        Shown behind every page in this browser, in place of the site's pictures (map and profile ones too). A
        picture has to be on Steam or Imgur (i.imgur.com).
      </p>
    </>
  )
}
