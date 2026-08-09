import React, { useState } from 'react';
import { LifeOSState } from '../types';
import { uid, todayISO } from '../lib/storage';

interface IAViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
}

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
}

export const IAView: React.FC<IAViewProps> = ({ state, onUpdateState }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: '¡Hola! Soy tu asistente de IA en LifeOS. Puedo ayudarte a analizar tus finanzas, planificar tus rutinas, sugerirte ideas de negocio o reventa, y organizar tus hábitos. ¿En qué te ayudo hoy?',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async (textToSend?: string) => {
    const text = textToSend || prompt.trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id: uid(),
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setPrompt('');
    setLoading(true);

    try {
      // Build summary of state to provide context to Gemini
      const context = {
        profileName: state.profile.name,
        accountsBalance: state.finance.accounts.reduce((sum, a) => sum + (a.balance || 0), 0),
        transactionCount: state.finance.transactions.length,
        subjects: state.study.subjects.map((s) => s.name),
        examsCount: state.study.exams.length,
        routineTemplates: state.gym.routineTemplates.map((r) => r.name),
        opportunitiesCount: state.resale.opportunities.length,
        inventoryCount: state.resale.inventory.length,
        applicationsCount: state.jobs.applications.length,
        goals: state.goals.map((g) => ({ name: g.name, current: g.current, target: g.target })),
      };

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: text,
          context,
          history: messages.slice(-6).map((m) => ({ role: m.sender === 'user' ? 'user' : 'model', text: m.text })),
        }),
      });

      if (!res.ok) {
        throw new Error('Error al consultar servidor de IA');
      }

      const data = await res.json();
      const aiMsg: Message = {
        id: uid(),
        sender: 'ai',
        text: data.reply || 'No recibí respuesta de la IA.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      console.error(err);
      const errorMsg: Message = {
        id: uid(),
        sender: 'ai',
        text: '⚠️ Ocurrió un error al consultar a la IA. Asegurate de tener configurada la API Key o probá más tarde.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveIdea = (text: string) => {
    onUpdateState((draft) => {
      draft.ideas.push({
        id: uid(),
        text,
        date: todayISO(),
        source: 'ia',
      });
    });
    alert('Idea guardada en tu lista de ideas.');
  };

  const handleDeleteIdea = (id: string) => {
    onUpdateState((draft) => {
      draft.ideas = draft.ideas.filter((i) => i.id !== id);
    });
  };

  const quickPrompts = [
    '💡 Sugerime 3 ideas de reventa de hardware o gadgets',
    '📊 Analizá mis finanzas y sugerime un consejo de ahorro',
    '🏋️ ¿Cómo optimizar mi rutina de entrenamiento?',
    '📚 Recomendame una técnica de estudio para mis próximos exámenes',
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">Asistente de IA</h1>
        <p className="text-sm text-[var(--text-soft)]">
          Impulsado por Gemini. Hace preguntas, analiza tus datos y guarda ideas valiosas.
        </p>
      </div>

      {/* Quick Prompts */}
      <div className="flex flex-wrap gap-2">
        {quickPrompts.map((p, idx) => (
          <button
            key={idx}
            onClick={() => sendMessage(p)}
            disabled={loading}
            className="px-3 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:border-[var(--blue)] hover:bg-[var(--blue-soft)] text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--blue)] transition-all cursor-pointer text-left shadow-2xs"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Chat Container */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 flex flex-col h-[480px] shadow-xs">
        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-3.5 text-xs sm:text-sm leading-relaxed ${
                  m.sender === 'user'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-br-none shadow-xs font-medium'
                    : 'bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] rounded-bl-none shadow-2xs font-normal'
                }`}
              >
                <p className="whitespace-pre-wrap">{m.text}</p>
                {m.sender === 'ai' && m.id !== 'welcome' && (
                  <div className="mt-2.5 pt-2 border-t border-[var(--border)] flex items-center justify-between gap-2">
                    <span className="text-[10px] text-[var(--text-faint)] font-mono">{m.timestamp}</span>
                    <button
                      onClick={() => handleSaveIdea(m.text.slice(0, 200))}
                      className="text-[10px] font-extrabold text-[var(--blue)] hover:underline cursor-pointer"
                    >
                      💡 Guardar como idea
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--blue)] bg-[var(--blue-soft)] px-3 py-2 rounded-xl w-fit border border-blue-500/20 animate-pulse">
              <span>🌀</span> Pensando respuesta con Gemini...
            </div>
          )}
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="mt-3 pt-3 border-t border-[var(--border)] flex gap-2"
        >
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Preguntale algo a la IA sobre tus hábitos, finanzas o rutinas..."
            className="flex-1 px-4 py-2.5 text-xs sm:text-sm rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] focus:ring-2 focus:ring-[var(--blue)]/20 outline-hidden transition-all text-[var(--text)]"
          />
          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="px-5 py-2.5 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-extrabold rounded-xl hover:opacity-90 disabled:opacity-40 transition-all cursor-pointer shadow-2xs shrink-0"
          >
            Enviar
          </button>
        </form>
      </div>

      {/* Ideas Saved */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-[var(--text)]">Ideas guardadas 💡</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {state.ideas.length === 0 ? (
            <p className="text-xs text-[var(--text-faint)] col-span-2">No guardaste ideas todavía.</p>
          ) : (
            state.ideas.map((i) => (
              <div key={i.id} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 text-xs space-y-2 relative">
                <button
                  onClick={() => handleDeleteIdea(i.id)}
                  className="absolute top-3 right-3 text-xs text-[var(--text-faint)] hover:text-red-500"
                >
                  ✕
                </button>
                <p className="text-[var(--text)] font-medium pr-4">{i.text}</p>
                <span className="text-[10px] text-[var(--text-faint)] block">
                  {i.source === 'ia' ? '🤖 Generada por IA' : '✏️ Manual'} · {i.date}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
