/**
 * Error Boundary global y por página.
 *
 * Captura CUALQUIER error de render (incluyendo chunks dinámicos que fallan
 * tras un redeploy) y muestra un mensaje en español con botones de reintentar
 * y volver al inicio, en vez de dejar la pantalla en blanco.
 *
 * Si el error parece ser un chunk desactualizado ("dynamically imported module",
 * "Loading chunk", "Failed to fetch"), recarga la página UNA VEZ automáticamente
 * para traer el index.html nuevo.
 *
 * @module components/ui/ErrorBoundary
 */
import { Component, type ReactNode } from 'react';
import { LogoMark } from './Logo';

interface Props {
  children: ReactNode;
  /** Nombre de la página (para el mensaje). Si no se pasa, es error global. */
  pageName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/** Detecta si el error es por un chunk/módulo dinámico que no se pudo cargar. */
function isChunkError(error: Error): boolean {
  const msg = error.message + (error.name || '');
  return /dynamically imported module|loading chunk|failed to fetch|load module|importing a module/i.test(msg);
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // Log en consola para diagnóstico.
    console.error(
      `[ErrorBoundary${this.props.pageName ? ` · ${this.props.pageName}` : ''}] Error capturado:`,
      error,
      info.componentStack,
    );

    // Si es un chunk desactualizado, recargar UNA VEZ automáticamente.
    if (isChunkError(error)) {
      const KEY = 'sn-chunk-reload';
      if (!sessionStorage.getItem(KEY)) {
        sessionStorage.setItem(KEY, '1');
        window.location.reload();
        return;
      }
    }
  }

  private handleRetry = () => {
    // Limpiar el flag de recarga para que un siguiente error pueda reintentar.
    sessionStorage.removeItem('sn-chunk-reload');
    this.setState({ hasError: false, error: null });
  };

  private handleGoHome = () => {
    sessionStorage.removeItem('sn-chunk-reload');
    window.location.href = '/';
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { pageName } = this.props;
    const isChunk = this.state.error ? isChunkError(this.state.error) : false;

    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <div className="w-full max-w-md text-center">
          <div className="flex justify-center mb-4">
            <LogoMark size={56} />
          </div>
          <h2 className="text-lg font-bold text-[#1A1A2E] mb-2">
            {pageName ? `Error en ${pageName}` : 'Algo salió mal'}
          </h2>
          <p className="text-sm text-stone-500 leading-relaxed mb-5">
            {isChunk
              ? 'Hubo una actualización de la plataforma. Recarga la página para continuar.'
              : 'Ocurrió un error inesperado. Puedes reintentar o volver al inicio.'}
          </p>
          {this.state.error && (
            <p className="text-[10px] text-stone-400 bg-stone-50 border border-stone-200 rounded-lg p-2 mb-4 break-all max-h-20 overflow-auto">
              {this.state.error.message}
            </p>
          )}
          <div className="flex gap-3 justify-center">
            <button
              onClick={this.handleRetry}
              className="px-5 py-2.5 rounded-xl bg-[#C4553A] text-white font-bold text-sm shadow-md shadow-[#C4553A]/20"
            >
              Reintentar
            </button>
            <button
              onClick={this.handleGoHome}
              className="px-5 py-2.5 rounded-xl border-2 border-stone-200 text-stone-600 font-bold text-sm"
            >
              Ir al inicio
            </button>
          </div>
        </div>
      </div>
    );
  }
}
