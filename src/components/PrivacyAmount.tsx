import React, { createContext, useContext, useMemo, useState } from 'react';
import { maskFinancialText } from '../lib/financialPrivacy';

const PrivacyContext = createContext({ active: false });

export function PrivacyProvider({ active, children }: { active: boolean; children: React.ReactNode }) {
  // A new token on every privacy transition invalidates previous voluntary reveals
  // synchronously, without remounting forms or exposing one render of old content.
  const privacy = useMemo(() => ({ active }), [active]);
  return <PrivacyContext.Provider value={privacy}>{children}</PrivacyContext.Provider>;
}

export function PrivateFinancialText({ children }: { children: string }) {
  return <>{maskFinancialText(children, useContext(PrivacyContext).active)}</>;
}

export function usePrivacyMode() { return useContext(PrivacyContext).active; }

export function PrivacyInput({ maskText = false, ...props }: React.ComponentPropsWithRef<'input'> & { maskText?: boolean }) {
  const privacy = useContext(PrivacyContext);
  const [revealedFor, setRevealedFor] = useState<typeof privacy | null>(null);
  const masked = maskFinancialText(String(props.value ?? ''), privacy.active);
  const hidden = privacy.active && revealedFor !== privacy && (!maskText || masked !== String(props.value ?? ''));
  return <input {...props} value={hidden ? maskText ? masked : '' : props.value} placeholder={hidden ? '••••' : props.placeholder}
    readOnly={hidden || props.readOnly} title={hidden ? 'Revelar importe (Enter o clic)' : props.title}
    onChange={(event) => { if (!hidden) setRevealedFor(privacy); props.onChange?.(event); }}
    onPointerDown={(event) => { setRevealedFor(privacy); props.onPointerDown?.(event); }}
    onKeyDown={(event) => {
      if (hidden && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault(); setRevealedFor(privacy); return;
      }
      props.onKeyDown?.(event);
    }} />;
}

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
  const privacy = useContext(PrivacyContext);
  const [reveal, setReveal] = useState<{ token: typeof privacy; value: React.ReactNode } | null>(null);
  const revealed = reveal?.token === privacy && reveal.value === children;
  const hidden = privacy.active && !revealed;
  const toggle = () => setReveal(revealed ? null : { token: privacy, value: children });

  return (
    <Component
      tabIndex={privacy.active ? 0 : undefined}
      role={privacy.active ? 'button' : undefined}
      aria-pressed={privacy.active ? revealed : undefined}
      aria-label={hidden ? 'Revelar importe' : undefined}
      title={privacy.active ? (hidden ? 'Revelar importe (Stream Guard)' : 'Ocultar importe (Stream Guard)') : title === 'Clic o tap para revelar (Stream Guard)' ? undefined : title}
      onClick={(e: React.MouseEvent) => {
        // Deliberate click / tap to reveal or re-blur
        e.stopPropagation();
        if (privacy.active) toggle();
      }}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (privacy.active && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          e.stopPropagation();
          toggle();
        }
      }}
      className={`privacy-amount ${revealed ? 'revealed' : ''} ${className}`}
      data-private={privacy.active || undefined}
    >
      {hidden ? '••••' : children}
    </Component>
  );
};
