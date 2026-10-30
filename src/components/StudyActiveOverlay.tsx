import React, { useEffect, useState } from 'react';
import type { LifeOSState } from '../types';
import { isModuleEnabled } from '../lib/moduleVisibility';
import { playSound } from '../lib/audio';
import {
  assessStudySession,
  pauseStudySession,
  resumeStudySession,
  recordStudySession,
} from '../lib/studyFlows';
import { AppIcon } from './AppIcon';

interface StudyActiveOverlayProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
  onOpenStudies: () => void;
  currentView: string;
  isCoexisting?: boolean;
}

export const StudyActiveOverlay: React.FC<StudyActiveOverlayProps> = ({
  state,
  onUpdateState,
  onOpenStudies,
  currentView,
  isCoexisting = false,
}) => {
  const session = state.study?.activeSession;
  const isEnabled = isModuleEnabled(state, 'estudios');

  // Solo se muestra cuando el usuario navega fuera de Estudios
  const isVisible = Boolean(isEnabled && session && currentView !== 'estudios');

  const [assessment, setAssessment] = useState(() =>
    session ? assessStudySession(session) : null
  );

  useEffect(() => {
    if (!session) {
      setAssessment(null);
      return;
    }
    const update = () => {
      setAssessment(assessStudySession(session));
    };
    update();
    const interval = window.setInterval(update, 500);
    return () => window.clearInterval(interval);
  }, [session]);

  if (!isVisible || !session || !assessment) return null;

  const { status, remainingSeconds, effectiveMinutes } = assessment;
  const needsReview = status === 'completed' || status === 'interrupted_offline';
  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;
  const timeFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const subjectLabel =
    session.targetSubjectName ||
    (session.targetSubjectId
      ? (state.study?.subjects || []).find((s) => s.id === session.targetSubjectId)?.name || 'Materia'
      : 'General');

  const isBreak = session.phase === 'short_break' || session.phase === 'long_break';

  const phaseLabel =
    session.phase === 'short_break'
      ? 'Descanso corto'
      : session.phase === 'long_break'
      ? 'Descanso largo'
      : `Enfoque: ${subjectLabel}`;

  const handleTogglePause = () => {
    playSound('click');
    onUpdateState((draft) => {
      if (!draft.study?.activeSession) return;
      if (draft.study.activeSession.status === 'running') {
        draft.study.activeSession = pauseStudySession(draft.study.activeSession);
      } else if (draft.study.activeSession.status === 'paused') {
        draft.study.activeSession = resumeStudySession(draft.study.activeSession);
      }
    });
  };

  const handleFinishAndRecord = () => {
    onUpdateState((draft) => {
      if (!draft.study?.activeSession) return;
      if (isBreak) {
        playSound('click');
        draft.study.activeSession = null;
        return;
      }
      const minutesToLog = effectiveMinutes;

      // Política de sub-minuto: duraciones menores a 60s no inventan 1 min falso
      if (minutesToLog < 1) {
        playSound('click');
        draft.study.activeSession = null;
        return;
      }

      playSound('success');
      recordStudySession(draft, draft.study.activeSession, minutesToLog);
    });
  };

  const handleDiscard = () => {
    if (!window.confirm('¿Descartar esta sesión de enfoque sin registrar el tiempo?')) return;
    playSound('click');
    onUpdateState((draft) => {
      if (draft.study) draft.study.activeSession = null;
    });
  };

  return (
    <aside
      aria-label="Sesión de estudio en curso"
      className={`fixed z-[64] overflow-hidden rounded-2xl border border-blue-500/30 bg-slate-950/95 text-white shadow-2xl backdrop-blur-md transition-all duration-200 ${
        isCoexisting
          ? 'bottom-[calc(6.25rem+env(safe-area-inset-bottom)+5.5rem)] left-3 right-3 sm:right-5 sm:left-auto sm:w-[360px] lg:bottom-5 lg:left-[248px] lg:right-auto'
          : 'bottom-[calc(6.25rem+env(safe-area-inset-bottom))] left-3 right-3 sm:right-auto sm:w-[360px] sm:left-5 lg:bottom-5 lg:left-[248px]'
      }`}
    >
      <div className="h-1 bg-white/10">
        <div
          className={`h-full transition-all duration-300 ${
            status === 'paused' ? 'bg-amber-400' : 'bg-[var(--blue)]'
          }`}
          style={{
            width: `${Math.max(
              0,
              Math.min(100, ((session.plannedMinutes * 60 - remainingSeconds) / (session.plannedMinutes * 60)) * 100)
            )}%`,
          }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <button
          type="button"
          onClick={onOpenStudies}
          className="min-w-0 flex-1 text-left cursor-pointer group"
          title="Abrir Estudios para ver el temporizador completo"
        >
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                status === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className="block truncate text-[10px] font-black uppercase tracking-wider text-[var(--blue-light,theme(colors.blue.300))] group-hover:underline">
              {phaseLabel}
            </span>
          </div>
          <strong className="text-xl font-bold tabular-nums block mt-0.5">
            {timeFormatted}
            {status === 'paused' && (
              <span className="text-xs font-semibold text-amber-300 ml-2">(Pausado)</span>
            )}
          </strong>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          {needsReview ? (
            <button type="button" onClick={onOpenStudies}
              className="min-h-9 rounded-xl bg-[var(--blue)] px-3 text-xs font-bold text-white">
              Revisar en Estudios
            </button>
          ) : (
          <>
          <button
            type="button"
            onClick={handleTogglePause}
            className={`min-h-9 rounded-xl px-2.5 text-xs font-bold transition-all active:scale-95 cursor-pointer ${
              status === 'running'
                ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30'
                : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30'
            }`}
            title={status === 'running' ? 'Pausar sesión' : 'Reanudar sesión'}
          >
            {status === 'running' ? '⏸' : '▶'}
          </button>

          <button
            type="button"
            onClick={handleFinishAndRecord}
            className="min-h-9 rounded-xl bg-[var(--blue)] px-3 text-xs font-bold text-white transition-colors hover:bg-[var(--blue-hover)] active:scale-95 cursor-pointer"
            title="Guardar minutos estudiados y finalizar"
          >
            Terminar
          </button>

          <button
            type="button"
            onClick={handleDiscard}
            className="min-h-9 rounded-xl bg-white/10 px-2 text-xs font-bold text-slate-300 transition-colors hover:bg-red-500/20 hover:text-red-300 active:scale-95 cursor-pointer"
            title="Descartar sesión"
            aria-label="Descartar sesión"
          >
            <AppIcon name="x" className="h-3.5 w-3.5" />
          </button>
          </>
          )}
        </div>
      </div>
    </aside>
  );
};
