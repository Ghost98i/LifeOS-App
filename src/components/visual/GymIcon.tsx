import React, { useState } from 'react';
import { GYM_ICON_REGISTRY, type GymIconName } from '../../lib/gymIconRegistry';
import { AppIcon } from '../AppIcon';

interface GymIconProps {
  icon: GymIconName;
  label?: string;
  className?: string;
  decorative?: boolean;
}

export const GymIcon: React.FC<GymIconProps> = ({
  icon,
  label,
  className = '',
  decorative = false,
}) => {
  const definition = Object.hasOwn(GYM_ICON_REGISTRY, icon) ? GYM_ICON_REGISTRY[icon] : GYM_ICON_REGISTRY['gym-fallback'];
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const accessibility = decorative
    ? { 'aria-hidden': true as const }
    : { role: 'img', 'aria-label': label || definition.label };

  return (
    <span
      {...accessibility}
      className={`gym-icon ${className}`}
      data-gym-icon={definition.src && failedSource === definition.src ? 'gym-fallback' : definition.id}
      title={decorative ? undefined : label || definition.label}
    >
      {definition.src && failedSource !== definition.src ? (
        <>
          <img src={definition.src} alt="" hidden onError={() => setFailedSource(definition.src)} />
          <span
            className="gym-icon-glyph"
            style={{ '--gym-icon-url': `url("${definition.src}")` } as React.CSSProperties}
          />
        </>
      ) : (
        <AppIcon name="dumbbell" className="gym-icon-fallback" />
      )}
    </span>
  );
};

