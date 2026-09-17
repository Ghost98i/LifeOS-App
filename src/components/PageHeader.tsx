import React from 'react';

interface PageHeaderProps {
  category?: string;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  category,
  title,
  subtitle,
  badge,
  actions,
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 pb-2">
      <div className="min-w-0">
        {category && <span className="eyebrow block mb-1">{category}</span>}
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="page-heading">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
};
