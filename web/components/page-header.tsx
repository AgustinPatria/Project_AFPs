import type { ReactNode } from 'react';
import { Calendar } from 'lucide-react';
import { DateSelector } from '@/components/date-selector';
import { cn } from '@/lib/utils';

/**
 * Sticky page header used by every section route. Holds the page title,
 * subtitle, a date selector with prev/next chevrons, and an optional `children`
 * slot rendered to the LEFT of the date picker (used by Foreign for the
 * CHIST/SP_XML source badge and by Strategy for the family selector).
 *
 * Backdrop-blur + semi-opaque bg lets table/chart content show through faintly
 * when scrolled under, which is the standard sticky-header pattern.
 */
export function PageHeader({
  title,
  subtitle,
  dates,
  currentDate,
  titleIcon,
  children,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  dates?: string[];
  currentDate?: string;
  titleIcon?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const showDate = dates && currentDate;
  return (
    <header
      className={cn(
        'sticky top-0 z-20 -mx-6 lg:-mx-8 px-6 lg:px-8 py-4',
        'bg-background/80 backdrop-blur-md border-b border-border',
        className,
      )}
    >
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.01em] leading-tight flex items-center gap-2">
            {titleIcon}
            {title}
          </h1>
          {subtitle ? (
            <p className="text-[11px] text-muted-foreground mt-1 tracking-wide">
              {subtitle}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {children}
          {showDate ? (
            <>
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <DateSelector dates={dates} current={currentDate} />
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
