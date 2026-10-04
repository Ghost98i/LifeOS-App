import React, { useState } from 'react';
import { showToast } from '../lib/toast';
import { LifeOSState, Exam } from '../types';
import { FocusTimer } from './FocusTimer';
import { PageHeader } from './PageHeader';
import { AppIcon } from './AppIcon';
import { playSound } from '../lib/audio';
import {
  todayISO,
  fmtDate,
  uid,
  sameYear,
} from '../lib/storage';
import {
  studyMinutesForDate,
  nextExam,
  examApprovalPct,
} from '../lib/calculations';

interface EstudiosViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
}

export const EstudiosView: React.FC<EstudiosViewProps> = ({ state, onUpdateState }) => {
  const [studyDate, setStudyDate] = useState(todayISO());
  const [studyMinutes, setStudyMinutes] = useState('');
  const [studySubjectId, setStudySubjectId] = useState('');

  const [subjectName, setSubjectName] = useState('');

  const [examSubjectId, setExamSubjectId] = useState('');
  const [examDate, setExamDate] = useState(todayISO());

  const exam = nextExam(state);
  const pct = examApprovalPct(state);
  const todayMin = studyMinutesForDate(state, todayISO());
  const ref = new Date();
  const horasAnio =
    (state.study?.studyLog || [])
      .filter((l) => sameYear(l.date, ref))
      .reduce((s, l) => s + Number(l.minutes || 0), 0) / 60;

  const handleAddStudy = (e: React.FormEvent) => {
    e.preventDefault();
    const min = Number(studyMinutes);
    if (!min) return;
    onUpdateState((draft) => {
      if (!draft.study) draft.study = { studyLog: [], subjects: [], exams: [] } as any;
      if (!draft.study.studyLog) draft.study.studyLog = [];
      draft.study.studyLog.push({
        id: uid(),
        date: studyDate || todayISO(),
        minutes: min,
        subjectId: studySubjectId || null,
      });
    });
    setStudyMinutes('');
  };

  const handleDeleteStudy = (id: string) => {
    onUpdateState((draft) => {
      if (!draft.study) draft.study = { studyLog: [], subjects: [], exams: [] } as any;
      draft.study.studyLog = (draft.study.studyLog || []).filter((l) => l.id !== id);
    });
  };

  const handleAddSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectName.trim()) return;
    onUpdateState((draft) => {
      if (!draft.study) draft.study = { studyLog: [], subjects: [], exams: [] } as any;
      if (!draft.study.subjects) draft.study.subjects = [];
      draft.study.subjects.push({
        id: uid(),
        name: subjectName.trim(),
      });
    });
    setSubjectName('');
  };

  const handleDeleteSubject = (id: string) => {
    onUpdateState((draft) => {
      if (!draft.study) draft.study = { studyLog: [], subjects: [], exams: [] } as any;
      draft.study.subjects = (draft.study.subjects || []).filter((s) => s.id !== id);
      draft.study.exams = (draft.study.exams || []).filter((e) => e.subjectId !== id);
    });
  };

  const handleAddExam = (e: React.FormEvent) => {
    e.preventDefault();
    const subId = examSubjectId || ((state.study?.subjects || []).length ? state.study.subjects[0].id : '');
    if (!subId) {
      showToast('Primero agregá una materia.', 'info');
      return;
    }
    onUpdateState((draft) => {
      if (!draft.study) draft.study = { studyLog: [], subjects: [], exams: [] } as any;
      if (!draft.study.exams) draft.study.exams = [];
      draft.study.exams.push({
        id: uid(),
        subjectId: subId,
        date: examDate || todayISO(),
        status: 'pendiente',
      });
    });
  };

  const handleSetExamStatus = (id: string, status: Exam['status']) => {
    onUpdateState((draft) => {
      if (!draft.study) draft.study = { studyLog: [], subjects: [], exams: [] } as any;
      if (!draft.study.exams) draft.study.exams = [];
      const e = draft.study.exams.find((x) => x.id === id);
      if (e) e.status = status;
    });
  };

  const handleDeleteExam = (id: string) => {
    onUpdateState((draft) => {
      if (!draft.study) draft.study = { studyLog: [], subjects: [], exams: [] } as any;
      draft.study.exams = (draft.study.exams || []).filter((e) => e.id !== id);
    });
  };

  const handlePomodoroComplete = (mins: number, targetSubjectId?: string) => {
    if (!mins) return;
    playSound('success');
    onUpdateState((draft) => {
      if (!draft.study) draft.study = { studyLog: [], subjects: [], exams: [] } as any;
      if (!draft.study.studyLog) draft.study.studyLog = [];
      draft.study.studyLog.push({
        id: uid(),
        date: todayISO(),
        minutes: mins,
        subjectId: targetSubjectId || ((state.study?.subjects || []).length > 0 ? state.study.subjects[0].id : null),
      });
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Estudios"
        subtitle="Materias, calendario de exámenes, temporizador de enfoque y horas de estudio."
      />

      {/* Focus / Pomodoro Timer */}
      <FocusTimer targets={(state.study?.subjects || []).map((subject) => ({ id: subject.id, label: subject.name }))} onSessionComplete={handlePomodoroComplete} />

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="lifeos-stat-card">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">Próximo examen</span>
            <AppIcon name="clock" className="h-4 w-4 text-[var(--blue)] shrink-0" />
          </div>
          <div className="text-base font-bold truncate mt-1.5 text-[var(--text)]">
            {exam ? (state.study?.subjects || []).find((s) => s.id === exam.subjectId)?.name || '—' : 'Sin exámenes'}
          </div>
          <p className="text-[11px] text-[var(--text-soft)] mt-0.5">
            {exam ? `${fmtDate(exam.date)}` : '—'}
          </p>
        </div>

        <div className="lifeos-stat-card">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">% Aprobación</span>
            <AppIcon name="checkCircle" className="h-4 w-4 text-emerald-500 shrink-0" />
          </div>
          <div className="text-2xl font-extrabold font-mono mt-1.5 text-[var(--text)]">
            {pct != null ? `${pct.toFixed(0)}%` : '—'}
          </div>
        </div>

        <div className="lifeos-stat-card">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">Estudio hoy</span>
            <AppIcon name="book" className="h-4 w-4 text-[var(--blue)] shrink-0" />
          </div>
          <div className="text-2xl font-extrabold font-mono mt-1.5 text-[var(--text)]">{todayMin} min</div>
        </div>

        <div className="lifeos-stat-card">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">Horas este año</span>
            <AppIcon name="chart" className="h-4 w-4 text-violet-500 shrink-0" />
          </div>
          <div className="text-2xl font-extrabold font-mono mt-1.5 text-[var(--text)]">{horasAnio.toFixed(1)} h</div>
        </div>
      </div>

      {/* Register Study Log */}
      <div id="qa-focus-estudio" className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-3 shadow-2xs">
        <h2 className="text-sm font-bold text-[var(--text)]">Registrar estudio</h2>
        <form onSubmit={handleAddStudy} className="flex flex-wrap items-end gap-2 p-4 bg-[var(--bg)] border border-dashed border-[var(--border)] rounded-2xl">
          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Fecha</label>
            <input
              type="date"
              value={studyDate}
              onChange={(e) => setStudyDate(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden text-[var(--text)]"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Minutos</label>
            <input
              type="number"
              value={studyMinutes}
              onChange={(e) => setStudyMinutes(e.target.value)}
              placeholder="60"
              className="w-24 px-3 py-2 text-xs font-mono rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden text-[var(--text)]"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Materia</label>
            <select
              value={studySubjectId}
              onChange={(e) => setStudySubjectId(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden text-[var(--text)] cursor-pointer"
            >
              <option value="">General</option>
              {(state.study?.subjects || []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="flex items-center gap-1.5 px-4 py-2 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-2xs"
          >
            <AppIcon name="plus" className="h-3.5 w-3.5" />
            <span>Registrar</span>
          </button>
        </form>

        <div className="divide-y divide-[var(--border)]">
          {(state.study?.studyLog || []).length === 0 ? (
            <p className="text-center py-6 text-xs text-[var(--text-faint)]">Sin registros de estudio.</p>
          ) : (
            [...(state.study?.studyLog || [])]
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 10)
              .map((l) => (
                <div key={l.id} className="py-2.5 flex items-center justify-between text-xs sm:text-sm">
                  <span className="font-mono text-[var(--text-soft)]">{fmtDate(l.date)}</span>
                  <span className="font-medium text-[var(--text)]">
                    {(state.study?.subjects || []).find((s) => s.id === l.subjectId)?.name || 'General'}
                  </span>
                  <span className="font-mono font-bold text-[var(--blue)]">{l.minutes} min</span>
                  <button
                    onClick={() => handleDeleteStudy(l.id)}
                    className="text-[var(--text-faint)] hover:text-red-500 p-1.5 rounded-lg hover:bg-[var(--surface-muted)] transition-colors cursor-pointer"
                    title="Eliminar registro"
                    aria-label="Eliminar registro"
                  >
                    <AppIcon name="trash" className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
          )}
        </div>
      </div>

      {/* Grid for Subjects & Exams */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Subjects */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-[var(--text)]">Materias</h2>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 space-y-3 shadow-2xs">
            <form onSubmit={handleAddSubject} className="flex gap-2">
              <input
                type="text"
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                placeholder="Ej: Álgebra"
                className="flex-1 px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden text-[var(--text)]"
              />
              <button
                type="submit"
                className="flex items-center justify-center h-9 w-9 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold rounded-xl cursor-pointer shadow-2xs transition-all"
                title="Agregar materia"
                aria-label="Agregar materia"
              >
                <AppIcon name="plus" className="h-4 w-4" />
              </button>
            </form>

            <div className="divide-y divide-[var(--border)]">
              {(state.study?.subjects || []).length === 0 ? (
                <p className="text-center py-4 text-xs text-[var(--text-faint)]">Sin materias.</p>
              ) : (
                (state.study?.subjects || []).map((s) => (
                  <div key={s.id} className="py-2.5 flex items-center justify-between text-xs sm:text-sm">
                    <span className="font-semibold text-[var(--text)]">{s.name}</span>
                    <button
                      onClick={() => handleDeleteSubject(s.id)}
                      className="text-[var(--text-faint)] hover:text-red-500 p-1.5 rounded-lg hover:bg-[var(--surface-muted)] transition-colors cursor-pointer"
                      title="Eliminar materia"
                      aria-label="Eliminar materia"
                    >
                      <AppIcon name="trash" className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Exams */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-[var(--text)]">Parciales / Exámenes</h2>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 space-y-3 shadow-2xs">
            <form onSubmit={handleAddExam} className="flex flex-wrap sm:flex-nowrap gap-2">
              <select
                value={examSubjectId}
                onChange={(e) => setExamSubjectId(e.target.value)}
                className="flex-1 min-w-[120px] px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden text-[var(--text)] cursor-pointer"
              >
                {(state.study?.subjects || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden text-[var(--text)]"
              />
              <button
                type="submit"
                className="flex items-center justify-center h-9 w-9 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold rounded-xl cursor-pointer shadow-2xs transition-all shrink-0"
                title="Agregar examen"
                aria-label="Agregar examen"
              >
                <AppIcon name="plus" className="h-4 w-4" />
              </button>
            </form>

            <div className="divide-y divide-[var(--border)]">
              {(state.study?.exams || []).length === 0 ? (
                <p className="text-center py-4 text-xs text-[var(--text-faint)]">Sin exámenes cargados.</p>
              ) : (
                [...(state.study?.exams || [])]
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((e) => (
                    <div key={e.id} className="py-2.5 flex items-center justify-between text-xs gap-2">
                      <div className="truncate min-w-0 flex-1">
                        <span className="font-semibold text-[var(--text)]">
                          {(state.study?.subjects || []).find((s) => s.id === e.subjectId)?.name || '—'}
                        </span>
                        <span className="font-mono text-[var(--text-faint)] ml-2">{fmtDate(e.date)}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          value={e.status}
                          onChange={(ev) => handleSetExamStatus(e.id, ev.target.value as any)}
                          className={`px-2.5 py-1 text-xs rounded-lg border font-semibold outline-hidden cursor-pointer ${
                            e.status === 'aprobado'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                              : e.status === 'desaprobado'
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                              : 'bg-[var(--bg-elevated)] text-[var(--text-soft)] border-[var(--border)]'
                          }`}
                        >
                          <option value="pendiente">Pendiente</option>
                          <option value="aprobado">Aprobado</option>
                          <option value="desaprobado">Desaprobado</option>
                        </select>
                        <button
                          onClick={() => handleDeleteExam(e.id)}
                          className="text-[var(--text-faint)] hover:text-red-500 p-1.5 rounded-lg hover:bg-[var(--surface-muted)] transition-colors cursor-pointer"
                          title="Eliminar examen"
                          aria-label="Eliminar examen"
                        >
                          <AppIcon name="trash" className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
