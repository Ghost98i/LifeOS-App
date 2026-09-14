import React, { useState } from 'react';
import { showToast } from '../lib/toast';
import { LifeOSState, Exam } from '../types';
import { FocusTimer } from './FocusTimer';
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
    state.study.studyLog
      .filter((l) => sameYear(l.date, ref))
      .reduce((s, l) => s + Number(l.minutes || 0), 0) / 60;

  const handleAddStudy = (e: React.FormEvent) => {
    e.preventDefault();
    const min = Number(studyMinutes);
    if (!min) return;
    onUpdateState((draft) => {
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
      draft.study.studyLog = draft.study.studyLog.filter((l) => l.id !== id);
    });
  };

  const handleAddSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectName.trim()) return;
    onUpdateState((draft) => {
      draft.study.subjects.push({
        id: uid(),
        name: subjectName.trim(),
      });
    });
    setSubjectName('');
  };

  const handleDeleteSubject = (id: string) => {
    onUpdateState((draft) => {
      draft.study.subjects = draft.study.subjects.filter((s) => s.id !== id);
      draft.study.exams = draft.study.exams.filter((e) => e.subjectId !== id);
    });
  };

  const handleAddExam = (e: React.FormEvent) => {
    e.preventDefault();
    const subId = examSubjectId || (state.study.subjects.length ? state.study.subjects[0].id : '');
    if (!subId) {
      showToast('Primero agregá una materia.', 'info');
      return;
    }
    onUpdateState((draft) => {
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
      const e = draft.study.exams.find((x) => x.id === id);
      if (e) e.status = status;
    });
  };

  const handleDeleteExam = (id: string) => {
    onUpdateState((draft) => {
      draft.study.exams = draft.study.exams.filter((e) => e.id !== id);
    });
  };

  const handlePomodoroComplete = (mins: number, targetSubjectId?: string) => {
    if (!mins) return;
    playSound('success');
    onUpdateState((draft) => {
      draft.study.studyLog.push({
        id: uid(),
        date: todayISO(),
        minutes: mins,
        subjectId: targetSubjectId || (state.study.subjects.length > 0 ? state.study.subjects[0].id : null),
      });
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">Estudios</h1>
        <p className="text-sm text-[var(--text-soft)]">
          Materias, exámenes, temporizador de enfoque y horas de estudio.
        </p>
      </div>

      {/* Focus / Pomodoro Timer */}
      <FocusTimer targets={state.study.subjects.map((subject) => ({ id: subject.id, label: subject.name }))} onSessionComplete={handlePomodoroComplete} />

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">⏳ Próximo examen</span>
          <div className="text-base font-bold truncate mt-1 text-[var(--text)]">
            {exam ? state.study.subjects.find((s) => s.id === exam.subjectId)?.name || '—' : 'Sin exámenes'}
          </div>
          <p className="text-[11px] text-[var(--text-soft)] mt-0.5">
            {exam ? `${fmtDate(exam.date)}` : '—'}
          </p>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">✅ % Aprobación</span>
          <div className="text-2xl font-extrabold font-mono mt-1 text-[var(--text)]">
            {pct != null ? `${pct.toFixed(0)}%` : '—'}
          </div>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">📖 Estudio hoy</span>
          <div className="text-2xl font-extrabold font-mono mt-1 text-[var(--text)]">{todayMin} min</div>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">📆 Horas este año</span>
          <div className="text-2xl font-extrabold font-mono mt-1 text-[var(--text)]">{horasAnio.toFixed(1)} h</div>
        </div>
      </div>

      {/* Register Study Log */}
      <div id="qa-focus-estudio" className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-bold text-[var(--text)]">Registrar estudio</h2>
        <form onSubmit={handleAddStudy} className="flex flex-wrap items-end gap-2 p-3 bg-[var(--bg)] border border-dashed border-[var(--border)] rounded-xl">
          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Fecha</label>
            <input
              type="date"
              value={studyDate}
              onChange={(e) => setStudyDate(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Minutos</label>
            <input
              type="number"
              value={studyMinutes}
              onChange={(e) => setStudyMinutes(e.target.value)}
              placeholder="60"
              className="w-24 px-3 py-1.5 text-xs font-mono rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Materia</label>
            <select
              value={studySubjectId}
              onChange={(e) => setStudySubjectId(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden"
            >
              <option value="">General</option>
              {state.study.subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="px-3.5 py-1.5 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
          >
            ＋ Registrar
          </button>
        </form>

        <div className="divide-y divide-[var(--border)]">
          {state.study.studyLog.length === 0 ? (
            <p className="text-center py-6 text-xs text-[var(--text-faint)]">Sin registros de estudio.</p>
          ) : (
            [...state.study.studyLog]
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 10)
              .map((l) => (
                <div key={l.id} className="py-2 flex items-center justify-between text-xs">
                  <span className="font-mono text-[var(--text-soft)]">{fmtDate(l.date)}</span>
                  <span className="font-medium text-[var(--text)]">
                    {state.study.subjects.find((s) => s.id === l.subjectId)?.name || 'General'}
                  </span>
                  <span className="font-mono font-bold text-[var(--blue)]">{l.minutes} min</span>
                  <button
                    onClick={() => handleDeleteStudy(l.id)}
                    className="text-[var(--text-faint)] hover:text-red-500 text-xs px-1"
                  >
                    ✕
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
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
            <form onSubmit={handleAddSubject} className="flex gap-2">
              <input
                type="text"
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                placeholder="Ej: Álgebra"
                className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-bold rounded-lg cursor-pointer"
              >
                ＋
              </button>
            </form>

            <div className="divide-y divide-[var(--border)]">
              {state.study.subjects.length === 0 ? (
                <p className="text-center py-4 text-xs text-[var(--text-faint)]">Sin materias.</p>
              ) : (
                state.study.subjects.map((s) => (
                  <div key={s.id} className="py-2 flex items-center justify-between text-xs sm:text-sm">
                    <span className="font-medium text-[var(--text)]">{s.name}</span>
                    <button
                      onClick={() => handleDeleteSubject(s.id)}
                      className="text-[var(--text-faint)] hover:text-red-500 text-xs px-1"
                    >
                      ✕
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
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
            <form onSubmit={handleAddExam} className="flex gap-2">
              <select
                value={examSubjectId}
                onChange={(e) => setExamSubjectId(e.target.value)}
                className="flex-1 px-2.5 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
              >
                {state.study.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-bold rounded-lg cursor-pointer"
              >
                ＋
              </button>
            </form>

            <div className="divide-y divide-[var(--border)]">
              {state.study.exams.length === 0 ? (
                <p className="text-center py-4 text-xs text-[var(--text-faint)]">Sin exámenes cargados.</p>
              ) : (
                [...state.study.exams]
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((e) => (
                    <div key={e.id} className="py-2 flex items-center justify-between text-xs gap-2">
                      <div className="truncate">
                        <span className="font-medium text-[var(--text)]">
                          {state.study.subjects.find((s) => s.id === e.subjectId)?.name || '—'}
                        </span>
                        <span className="font-mono text-[var(--text-faint)] ml-2">{fmtDate(e.date)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={e.status}
                          onChange={(ev) => handleSetExamStatus(e.id, ev.target.value as any)}
                          className="px-2 py-1 text-xs rounded-md bg-[var(--bg-elevated)] border border-[var(--border)]"
                        >
                          <option value="pendiente">Pendiente</option>
                          <option value="aprobado">Aprobado</option>
                          <option value="desaprobado">Desaprobado</option>
                        </select>
                        <button
                          onClick={() => handleDeleteExam(e.id)}
                          className="text-[var(--text-faint)] hover:text-red-500 text-xs px-1"
                        >
                          ✕
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
