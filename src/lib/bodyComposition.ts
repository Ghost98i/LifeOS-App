import type { LifeOSState, MeasurementPoint, WeightPoint } from '../types';

export type BodyCompositionSex = NonNullable<LifeOSState['profile']['bodyCompositionSex']>;

export interface BodyCompositionEstimate {
  weight: WeightPoint;
  waist: MeasurementPoint;
  rfmPercent: number;
  fatMassKg: number;
  leanMassKg: number;
  ffmi: number;
}

export function estimateRelativeFatMass(
  heightCm: number,
  waistCm: number,
  sex: BodyCompositionSex
): number | null {
  if (!Number.isFinite(heightCm) || !Number.isFinite(waistCm)) return null;
  if (heightCm < 100 || heightCm > 250 || waistCm < 40 || waistCm > 250) return null;
  const sexConstant = sex === 'female' ? 12 : 0;
  const estimate = 64 - (20 * heightCm / waistCm) + sexConstant;
  return estimate > 0 && estimate < 75 ? estimate : null;
}

export function calculateFFMI(weightKg: number, heightCm: number, bodyFatPercent: number): number | null {
  if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 400) return null;
  if (!Number.isFinite(heightCm) || heightCm < 100 || heightCm > 250) return null;
  if (!Number.isFinite(bodyFatPercent) || bodyFatPercent <= 0 || bodyFatPercent >= 75) return null;
  const heightM = heightCm / 100;
  const leanMassKg = weightKg * (1 - bodyFatPercent / 100);
  return leanMassKg / (heightM * heightM);
}

function latestByDate<T extends { date: string }>(items: T[]): T | null {
  return items.length ? [...items].sort((a, b) => b.date.localeCompare(a.date))[0] : null;
}

export function bodyCompositionEstimate(state: LifeOSState): BodyCompositionEstimate | null {
  const weight = latestByDate(state.gym.weight);
  const waist = latestByDate(state.gym.measurements);
  const heightCm = Number(state.profile.height || 0);
  const sex = state.profile.bodyCompositionSex;
  if (!weight || !waist || !sex) return null;

  const rfmPercent = estimateRelativeFatMass(heightCm, Number(waist.waist), sex);
  if (rfmPercent == null) return null;
  const ffmi = calculateFFMI(Number(weight.kg), heightCm, rfmPercent);
  if (ffmi == null) return null;
  const fatMassKg = Number(weight.kg) * rfmPercent / 100;

  return {
    weight,
    waist,
    rfmPercent,
    fatMassKg,
    leanMassKg: Number(weight.kg) - fatMassKg,
    ffmi,
  };
}
