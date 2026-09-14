import React from 'react';

interface State { failed: boolean }

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  declare readonly props: React.PropsWithChildren;
  state: State = { failed: false };

  static getDerivedStateFromError(): State { return { failed: true }; }

  componentDidCatch(error: unknown): void {
    console.error('LifeOS recovered from a screen error:', error);
  }

  render(): React.ReactNode {
    if (!this.state.failed) return this.props.children;
    return <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6 text-[var(--text)]"><section className="max-w-md rounded-3xl border border-rose-500/25 bg-[var(--card)] p-6 text-center shadow-xl"><h1 className="text-xl font-extrabold">Esta pantalla tuvo un problema</h1><p className="mt-2 text-sm text-[var(--text-soft)]">Tus datos siguen guardados. Recargá LifeOS para volver; si se repite, exportá el backup desde Configuración.</p><button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-[var(--blue)] px-4 py-2.5 text-sm font-extrabold text-white">Recargar LifeOS</button></section></main>;
  }
}
