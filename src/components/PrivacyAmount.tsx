import React, { useState } from 'react';

interface PrivacyAmountProps {
  children: React.ReactNode;
  className?: string;
  as?: 'span' | 'div' | 'strong' | 'p' | 'h2';
  title?: string;
}

export const PrivacyAmount: React.FC<PrivacyAmountProps> = ({
  children,
  className = '',
  as: Component = 'span',
  title = 'Toca o pasa el cursor para revelar (Stream Guard)',
}) => {
  const [revealed, setRevealed] = useState(false);

  return (
    <Component
      tabIndex={0}
      title={title}
      onClick={(e: React.MouseEvent) => {
        // Toggle on mobile click / tap to reveal or re-blur
        e.stopPropagation();
        setRevealed((prev) => !prev);
      }}
      className={`privacy-amount ${revealed ? 'revealed' : ''} ${className}`}
    >
      {children}
    </Component>
  );
};
