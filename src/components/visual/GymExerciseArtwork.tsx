import React from 'react';
import type { ExerciseEquipment } from '../../types';
import {
  resolveExerciseGymIcon,
  type GymIconName,
} from '../../lib/gymIconRegistry';
import { GymIcon } from './GymIcon';

export type GymArtworkKind = GymIconName;

export const resolveGymArtworkKind = resolveExerciseGymIcon;

interface GymExerciseArtworkProps {
  name: string;
  equipment?: ExerciseEquipment;
  icon?: GymIconName;
  className?: string;
  compact?: boolean;
  decorative?: boolean;
}

/**
 * Compatibility wrapper used by the real Gym surfaces. The artwork now comes
 * exclusively from the curated local SVG registry; this component does not
 * draw, recolor or infer a unique illustration for every free-form name.
 */
export const GymExerciseArtwork: React.FC<GymExerciseArtworkProps> = React.memo(({
  name,
  equipment,
  icon,
  className = '',
  compact = false,
  decorative = true,
}) => {
  const resolvedIcon = icon || resolveExerciseGymIcon(name, equipment);
  return (
    <GymIcon
      icon={resolvedIcon}
      label={`Equipamiento para ${name}`}
      decorative={decorative}
      className={`gym-equipment-art ${compact ? 'gym-equipment-art-compact' : ''} ${className}`}
    />
  );
});

