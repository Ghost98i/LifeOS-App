import React from 'react';

export const DashboardSkeleton: React.FC = () => (
  <div role="status" aria-busy="true" aria-label="Cargando vista" className="mx-auto w-full space-y-5 animate-pulse">
    <div className="min-h-[195px] sm:h-[230px] rounded-2xl bg-[var(--hero-bg)]" />
    <div className="h-[108px] rounded-2xl border border-slate-200/80 bg-white dark:border-white/[0.07] dark:bg-[#0D111A]" />
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)] lg:gap-6">
      <div className="h-[340px] rounded-2xl border border-slate-200/80 bg-white dark:border-white/[0.07] dark:bg-[#0D111A]" />
      <div className="space-y-5">
        <div className="h-[180px] rounded-2xl border border-slate-200/80 bg-white dark:border-white/[0.07] dark:bg-[#0D111A]" />
        <div className="h-[180px] rounded-2xl border border-slate-200/80 bg-white dark:border-white/[0.07] dark:bg-[#0D111A]" />
      </div>
    </div>
  </div>
);
