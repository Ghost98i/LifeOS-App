import React from 'react';

interface AppErrorBoundaryProps {
  children?: any;
  fallbackTitle?: string;
  onReset?: () => void;
  inline?: boolean;
  key?: any;
}

interface State {
  failed: boolean;
  error: Error | null;
}

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, State> {
  declare readonly props: AppErrorBoundaryProps;
  declare setState: (state: Partial<State> | ((prevState: State) => Partial<State>)) => void;
  state: State = { failed: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { failed: true, error };
  }

  componentDidCatch(error: unknown): void {
    console.error('Celestian LifeOS recovered from a screen error:', error);
  }

  handleReset = () => {
    this.setState({ failed: false, error: null });
    this.props.onReset?.();
  };

  render(): React.ReactNode {
    if (!this.state.failed) return this.props.children;

    const title = this.props.fallbackTitle || 'Esta pantalla tuvo un problema';
    const isInline = this.props.inline;

    const content = (
      <section className="max-w-md w-full rounded-3xl border border-rose-500/25 bg-[var(--card)] p-6 text-center shadow-xl space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500 text-2xl font-bold">
          ⚠️
        </div>
        <div>
          <h2 className="text-lg font-extrabold text-[var(--text)]">{title}</h2>
          <p className="mt-1.5 text-xs text-[var(--text-soft)]">
            Tus datos siguen a salvo y guardados en tu dispositivo. Podés reintentar cargar esta vista o volver al panel principal.
          </p>
        </div>

        {this.state.error?.message && (
          <details className="text-left text-[11px] bg-[var(--bg)] p-2.5 rounded-xl border border-[var(--border)] text-[var(--text-faint)]">
            <summary className="cursor-pointer font-semibold text-[var(--text-soft)] hover:underline">
              Detalle técnico
            </summary>
            <p className="mt-1 font-mono break-all text-rose-500/90">{this.state.error.message}</p>
          </details>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-1">
          <button
            type="button"
            onClick={this.handleReset}
            className="w-full sm:w-auto rounded-xl bg-[var(--blue)] px-4 py-2.5 text-xs font-extrabold text-white hover:bg-[var(--blue-hover)] transition cursor-pointer shadow-xs"
          >
            Reintentar vista
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full sm:w-auto rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-xs font-bold text-[var(--text-soft)] hover:text-[var(--text)] transition cursor-pointer"
          >
            Recargar Celestian LifeOS
          </button>
        </div>
      </section>
    );

    if (isInline) {
      return <div className="flex w-full items-center justify-center py-12 px-4">{content}</div>;
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6 text-[var(--text)]">
        {content}
      </main>
    );
  }
}
