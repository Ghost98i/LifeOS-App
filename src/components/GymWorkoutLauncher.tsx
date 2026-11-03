import React, { useRef } from 'react';
import type { RoutineTemplate } from '../types';
import type { getGymLauncherPlan } from '../lib/gymLauncher';
import type { GymSessionPresentation } from '../lib/gymIdlePresentation';
import { DAY_LABELS } from '../lib/storage';
import { GymIcon } from './visual/GymIcon';
import { resolveRoutineIcon } from '../lib/gymAppearance';

interface Props {
  plan: ReturnType<typeof getGymLauncherPlan>;
  routines: RoutineTemplate[];
  completed: GymSessionPresentation | null;
  onSelect: (templateId: string) => void;
  onStart: () => void;
  onToggleRest: () => void;
  onEditRoutine: (id?: string) => void;
  launcherRef: React.Ref<HTMLElement>;
}

export function GymWorkoutLauncher({ plan, routines, completed, onSelect, onStart, onToggleRest, onEditRoutine, launcherRef }: Props) {
  const choiceRef = useRef<HTMLSelectElement>(null);
  const alternative = plan.manual && !plan.explicitRest && !plan.unavailableChoice && plan.applicable.length === 1 && plan.templateId !== plan.applicable[0].id ? plan.applicable[0] : null;
  const context = plan.unavailableChoice ? 'La rutina elegida ya no está disponible. Elegí otra.'
    : plan.conflict ? `Descanso y ${plan.applicable.length === 1 ? 'rutina coinciden' : 'rutinas coinciden'} hoy. Elegí si querés entrenar; el descanso seguirá registrado.`
    : plan.explicitRest ? 'Hoy tenés un descanso registrado. Podés entrenar de todos modos; se te pedirá confirmación.'
    : plan.applicable.length > 1 ? `${plan.applicable.length} rutinas asignadas para hoy.${plan.templateId === null ? ' Elegí cuál iniciar o entrená libre.' : ''}`
    : plan.applicable.length === 1 ? `${DAY_LABELS[plan.day]} · rutina de hoy`
    : 'Sin rutina asignada para hoy.';
  const value = plan.templateId === null ? '' : plan.templateId ? `routine:${plan.templateId}` : 'free';
  const otherRoutines = routines.filter(routine => !plan.applicable.some(today => today.id === routine.id));
  const option = (routine: RoutineTemplate) => <option key={routine.id} value={`routine:${routine.id}`} disabled={routine.exercises.length === 0}>{routine.name}{routine.exercises.length === 0 ? ' · sin ejercicios' : ''}</option>;
  return <section data-gym-today-status data-gym-launcher ref={launcherRef} className="gym-launcher scroll-mt-4" aria-label="Preparar entrenamiento">
    <div className="gym-launcher-summary">
      {completed && <p className="gym-launcher-eyebrow">Sesión de hoy completada</p>}
      <h2>{completed?.name || '¿Listo para entrenar?'}</h2>
      {alternative ? <p className="gym-launcher-context gym-launcher-alternative">
        <span>Rutina de hoy: {alternative.name}</span><span aria-hidden="true">·</span>
        <button type="button" className="gym-launcher-use" aria-label={`Usar rutina de hoy: ${alternative.name}`} onClick={() => { onSelect(alternative.id); choiceRef.current?.focus(); }}>Usar</button>
      </p> : <p className={`gym-launcher-context${plan.explicitRest ? ' gym-launcher-rest' : ''}`} aria-live="polite">{context}</p>}
      {completed && <dl className="gym-launcher-metrics">
        {completed.volumeKg > 0 && <div><dt>Volumen total</dt><dd>{completed.volumeKg.toLocaleString('es-UY')} <span>kg</span></dd></div>}
        <div><dt>Ejercicios</dt><dd>{completed.exerciseCount}</dd></div>
        <div><dt>Series</dt><dd>{completed.completedSetCount}</dd></div>
        {completed.durationLabel && <div><dt>Tiempo registrado</dt><dd>{completed.durationLabel}</dd></div>}
        {completed.prExerciseCount > 0 && <div><dt>Mejores marcas</dt><dd>{completed.prExerciseCount} PR{completed.prExerciseCount === 1 ? '' : 's'}</dd></div>}
      </dl>}
    </div>
    <div className="gym-launcher-controls">
      <div className="gym-launcher-choice">
        <label htmlFor="gym-routine-choice">{completed ? 'Próximo entrenamiento' : plan.templateId === null ? 'Entrenamiento' : 'Entrenamiento preparado'}</label>
        <select ref={choiceRef} id="gym-routine-choice" value={value} onChange={event => { if (event.target.value) onSelect(event.target.value === 'free' ? '' : event.target.value.slice('routine:'.length)); }} aria-describedby={plan.selected ? 'gym-launcher-choice-hint' : undefined}>
          <option value="" disabled>Elegí un entrenamiento</option>
          <option value="free">Entrenamiento libre</option>
          {plan.applicable.length > 0 ? <>
            <optgroup label="Rutinas de hoy">{plan.applicable.map(option)}</optgroup>
            {otherRoutines.length > 0 && <optgroup label="Otras rutinas">{otherRoutines.map(option)}</optgroup>}
          </> : routines.map(option)}
        </select>
        {plan.selected && <p id="gym-launcher-choice-hint">{plan.selected.exercises.length} {plan.selected.exercises.length === 1 ? 'ejercicio' : 'ejercicios'}</p>}
        {plan.selected?.exercises.length === 0 && <button type="button" className="gym-launcher-text-button" onClick={() => onEditRoutine(plan.selected!.id)}>Agregar ejercicios a la rutina</button>}
        {routines.length === 0 && <button type="button" className="gym-launcher-text-button" onClick={() => onEditRoutine()}>Crear primera rutina</button>}
      </div>
      <div className="gym-launcher-actions">
        <button type="button" data-gym-start onClick={onStart} disabled={!plan.canStart} className="gym-launcher-start">
          <GymIcon icon={plan.selected ? resolveRoutineIcon(plan.selected) : 'gym-fallback'} decorative className="h-5 w-5 shrink-0" />
          <span>{plan.templateId === null ? 'Iniciar entrenamiento' : plan.selected ? `Iniciar ${plan.selected.name}` : completed ? 'Iniciar otro entrenamiento' : 'Iniciar entrenamiento libre'}</span>
        </button>
        {(!completed || plan.explicitRest) && <button type="button" onClick={onToggleRest} className="gym-launcher-rest-button">{plan.explicitRest ? 'Cancelar descanso' : 'Marcar descanso para hoy'}</button>}
      </div>
    </div>
  </section>;
}
