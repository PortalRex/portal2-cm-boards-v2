import { DiscordIcon } from '@/components/icons'
import { useReadOnly } from '@/hooks/use-read-only'

/** Where feedback goes: the boards feedback channel on the community Discord. */
const FEEDBACK_URL = 'https://discord.com/channels/146404426746167296/965719920522432522'

/**
 * The notice under the top bar on every page while the boards are read-only (the first days after
 * opening): it's a preview for feedback and anything can still change. Staff are also told they
 * can still edit.
 */
export function ReadOnlyBanner() {
  const { on, blocked } = useReadOnly()
  if (!on) return null
  return (
    // Above the fixed page background (z-0), below the top bar and its menus (z-20); a mostly solid
    // base under the tint keeps it readable over the background picture.
    <aside
      aria-label="Site notice"
      className="relative z-10 border-b border-brand/30 bg-[rgb(var(--page-rgb)/0.85)] text-foreground backdrop-blur-sm"
    >
      <div className="bg-linear-to-r from-brand/25 via-brand/10 to-brand/25">
        <div className="mx-auto flex max-w-content flex-wrap items-center justify-center gap-x-4 gap-y-1.5 px-6 py-2 upto700:px-4">
          <p className="m-0 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-center text-base leading-snug">
            <span className="rounded-[4px] bg-brand px-2 py-0.5 text-[13px] font-semibold tracking-[0.08em] text-white uppercase">
              Preview
            </span>
            <span>
              <strong className="font-semibold">
                These boards are read-only and here mainly for feedback. Everything is subject to change.
              </strong>
              {!blocked && (
                <span className="text-text-2"> You&apos;re staff, so you can still make changes.</span>
              )}
            </span>
          </p>
          <a
            href={FEEDBACK_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[4px] border border-brand/50 px-2.5 py-0.5 text-[15px] font-medium whitespace-nowrap text-foreground hover:border-brand hover:bg-brand/15"
          >
            <DiscordIcon size={16} aria-hidden />
            Share feedback
          </a>
        </div>
      </div>
    </aside>
  )
}
