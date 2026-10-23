import * as React from 'react'
import { cn } from 'cn'
import { ChevronDownIcon } from 'lucide-react'
import { TriangleDown } from '@/components/icons'

type NativeSelectProps = Omit<React.ComponentProps<'select'>, 'size'> & {
  /**
   * "lg" is the boards' outlined dropdown: 40 px, centred 18 px text (legacy .select); "md" the
   * same at 32 px and 15 px text (filter bars); "xl" at 46 px (the map list's season picker).
   */
  size?: 'sm' | 'default' | 'md' | 'lg' | 'xl'
}

function NativeSelect({ className, size = 'default', ...props }: NativeSelectProps) {
  return (
    <div
      className={cn('group/native-select relative w-fit has-[select:disabled]:opacity-50', className)}
      data-slot="native-select-wrapper"
      data-size={size}
    >
      <select
        data-slot="native-select"
        data-size={size}
        className="h-8 w-full min-w-0 appearance-none rounded-lg border border-input bg-transparent py-1 pr-8 pl-2.5 text-sm outline-none select-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] data-[size=sm]:py-0.5 data-[size=lg]:h-10 data-[size=xl]:h-[46px] data-[size=lg]:text-lg data-[size=xl]:text-lg data-[size=md]:h-8 data-[size=md]:text-[15px] data-[size=lg]:cursor-pointer data-[size=xl]:cursor-pointer data-[size=md]:cursor-pointer data-[size=lg]:rounded-[4px] data-[size=xl]:rounded-[4px] data-[size=md]:rounded-[4px] data-[size=lg]:border-line-strong data-[size=xl]:border-line-strong data-[size=md]:border-line-strong data-[size=lg]:bg-control data-[size=xl]:bg-control data-[size=md]:bg-control data-[size=lg]:pr-9 data-[size=xl]:pr-9 data-[size=md]:pr-9 data-[size=lg]:pl-4 data-[size=xl]:pl-4 data-[size=md]:pl-4 data-[size=lg]:text-center data-[size=xl]:text-center data-[size=md]:text-center data-[size=lg]:[text-align-last:center] data-[size=xl]:[text-align-last:center] data-[size=md]:[text-align-last:center] dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:data-[size=lg]:bg-control dark:data-[size=xl]:bg-control dark:data-[size=md]:bg-control"
        {...props}
      />
      {size === 'md' || size === 'lg' || size === 'xl' ? (
        // The boards' dropdowns: legacy's 10px triangle in the text colour, 14px from the edge.
        <TriangleDown
          size={10}
          className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-foreground"
          aria-hidden="true"
          data-slot="native-select-icon"
        />
      ) : (
        <ChevronDownIcon
          className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground select-none"
          aria-hidden="true"
          data-slot="native-select-icon"
        />
      )}
    </div>
  )
}

function NativeSelectOption({ className, ...props }: React.ComponentProps<'option'>) {
  return (
    <option
      data-slot="native-select-option"
      className={cn('bg-control text-foreground', className)}
      {...props}
    />
  )
}

function NativeSelectOptGroup({ className, ...props }: React.ComponentProps<'optgroup'>) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn('bg-control text-foreground', className)}
      {...props}
    />
  )
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption }
