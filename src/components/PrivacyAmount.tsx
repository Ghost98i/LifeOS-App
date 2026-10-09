import React, { useState } from 'react';

interface PrivacyAmountProps {
  children: React.ReactNode;
  className?: string;
  as?: 'span' | 'div' | 'strong' | 'p' | 'h2' | 'h1';
  title?: string;
}

export const PrivacyAmount: React.FC<PrivacyAmountProps> = ({
  children,
  className = '',
  as: Component = 'span',
  title = 'Clic o tap para revelar (Stream Guard)',
}) => {
  const [revealed, setRevealed] = useState(false);

  return (
    <Component
      tabIndex={0}
      role="button"
      aria-pressed={revealed}
      title={title}
      onClick={(e: React.MouseEvent) => {
        // Deliberate click / tap to reveal or re-blur
        e.stopPropagation();
        setRevealed((prev) => !prev);
      }}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          setRevealed((prev) => !prev);
        }
      }}
      className={`privacy-amount ${revealed ? 'revealed' : ''} ${className}`}
    >
      {children}
    </Component>
  );
};
