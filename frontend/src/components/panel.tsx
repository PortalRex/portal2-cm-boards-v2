import { cn } from 'cn'
import type { ComponentType, ReactNode } from 'react'
import { useCollapsed } from '@/hooks/use-collapsed'
import { TriangleDown } from './icons'

type Icon = ComponentType<{ className?: string }>

/** The boards' container: a dark body under a lighter strip with an icon and an uppercase title. */
export function Panel({
  icon: Icon,
  title,
  actions,
  className,
  bodyClassName,
  children,
}: {
  icon?: Icon
  title?: ReactNode
  /** Controls on the right of the header; on phones they drop below the title and scroll sideways. */
  actions?: ReactNode
  className?: string
  bodyClassName?: string
  children?: ReactNode
}) {
  return (
    <section className={cn('overflow-hidden rounded-md bg-[rgb(var(--panel-rgb)/0.97)]', className)}>
      {title && (
        <header className="flex h-12 items-center gap-2.5 bg-panel-head px-5 upto700:h-auto upto700:min-h-12 upto700:flex-wrap upto700:gap-y-2 upto700:px-3.5 upto700:py-2.5">
          {Icon && <Icon className="size-5 shrink-0 stroke-[1.5]" />}
          <h2 className="m-0 text-base font-normal tracking-[0.02em] uppercase">{title}</h2>
          {actions && (
            <div className="ml-auto flex items-center gap-3 upto700:ml-0 upto700:w-full upto700:overflow-x-auto upto700:[scrollbar-width:none] upto700:*:shrink-0">
              {actions}
            </div>
          )}
        </header>
      )}
      <div className={cn('px-10 pt-6 pb-8', bodyClassName)}>{children}</div>
    </section>
  )
}

/**
 * A rounded stat card (profiles, stats). `collapseId` makes it collapsible from its header,
 * remembered in this browser (`p2cm.collapsed`).
 */
export function Card({
  icon: Icon,
  title,
  className,
  bodyClassName,
  headClassName,
  collapseId,
  children,
}: {
  icon?: Icon
  title: ReactNode
  className?: string
  bodyClassName?: string
  /** Header size overrides (the profile's compact side cards). */
  headClassName?: string
  collapseId?: string
  children?: ReactNode
}) {
  const [collapsed, toggle] = useCollapsed(collapseId)
  const head = (
    <>
      {Icon && <Icon className="size-[22px] shrink-0 stroke-[1.5]" />}
      <h3 className="m-0 text-lg font-normal tracking-[0.02em] uppercase">{title}</h3>
    </>
  )
  const headClass = cn('flex h-12 items-center gap-3.5 bg-card-head px-5', headClassName)
  return (
    <section
      className={cn(
        'flex flex-col overflow-hidden rounded-lg bg-card-surface',
        collapsed && 'w-full self-start',
        className,
      )}
      data-collapsed={collapsed || undefined}
    >
      {collapseId ? (
        <button
          type="button"
          className={cn(headClass, 'w-full cursor-pointer border-0 text-left hover:brightness-[1.12]')}
          onClick={toggle}
          aria-expanded={!collapsed}
        >
          {head}
          <TriangleDown
            size={12}
            className={cn('ml-auto text-text-muted transition-transform', collapsed && '-rotate-90')}
          />
        </button>
      ) : (
        <header className={headClass}>{head}</header>
      )}
      {!collapsed && <div className={cn('flex-1 p-5', bodyClassName)}>{children}</div>}
    </section>
  )
}
