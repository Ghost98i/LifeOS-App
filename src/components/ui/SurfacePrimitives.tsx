import React from 'react';

export interface SurfaceCardProps extends React.HTMLAttributes<HTMLElement> {
  as?: 'section' | 'div' | 'aside';
  children: React.ReactNode;
}

/**
 * Depth-1 editorial surface card for Celestian LifeOS.
 * Clean 1px hairline border, consistent rounded-2xl radius, zero heavy shadows.
 */
export const SurfaceCard: React.FC<SurfaceCardProps> = ({
  as = 'section',
  className = '',
  children,
  ...rest
}) => {
  const Component = as;
  return (
    <Component
      className={`rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/[0.07] dark:bg-[#0D111A] dark:shadow-none ${className}`}
      {...rest}
    >
      {children}
    </Component>
  );
};

export interface SectionHeaderProps {
  id?: string;
  icon?: React.ReactNode;
  title: string;
  count?: number | string | null;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Clean section header: bare Lucide icon + title + optional discrete count + right-aligned action.
 * Never wraps the action onto two lines on narrow viewports (389px).
 */
export const SectionHeader: React.FC<SectionHeaderProps> = ({
  id,
  icon,
  title,
  count,
  action,
  className = '',
}) => (
  <div className={`flex items-center justify-between gap-3 ${className}`}>
    <div className="flex min-w-0 items-center gap-2">
      {icon && (
        <span className="shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true">
          {icon}
        </span>
      )}
      <h2
        id={id}
        className="truncate text-[15px] font-semibold tracking-[-0.015em] text-slate-900 dark:text-slate-100"
      >
        {title}
      </h2>
      {count !== undefined && count !== null && count !== '' && (
        <span className="shrink-0 text-xs font-medium tabular-nums text-slate-400 dark:text-slate-500">
          {count}
        </span>
      )}
    </div>
    {action && <div className="shrink-0 whitespace-nowrap">{action}</div>}
  </div>
);

export interface ListDividerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * Flat 1px horizontal dividers between list rows inside a SurfaceCard.
 */
export const ListDivider: React.FC<ListDividerProps> = ({
  className = '',
  children,
  ...rest
}) => (
  <div
    className={`divide-y divide-slate-100 dark:divide-white/[0.06] ${className}`}
    {...rest}
  >
    {children}
  </div>
);
