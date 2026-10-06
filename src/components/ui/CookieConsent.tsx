/**
 * Aviso de cookies con Consent Mode v2 (Google Analytics).
 *
 * Por defecto el consentimiento está DENEGADO (lo fija analytics.js). Este
 * banner permite al usuario Aceptar o Rechazar. La decisión se guarda en
 * localStorage para no volver a preguntar. Al aceptar/rechazar se llama a
 * window.snSetConsent(bool) (definido en public/analytics.js) para actualizar
 * el consentimiento de GA.
 *
 * @module components/ui/CookieConsent
 */
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'sn-cookie-consent'; // 'granted' | 'denied'

declare global {
  interface Window {
    snSetConsent?: (granted: boolean) => void;
  }
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Mostrar solo si el usuario aún no ha decidido.
    let decision: string | null = null;
    try { decision = localStorage.getItem(STORAGE_KEY); } catch { /* sin storage */ }
    if (decision === 'granted') {
      window.snSetConsent?.(true); // re-aplicar en cada carga
    } else if (decision !== 'denied') {
      setVisible(true); // nunca decidió: preguntar
    }
  }, []);

  const decide = (granted: boolean) => {
    try { localStorage.setItem(STORAGE_KEY, granted ? 'granted' : 'denied'); } catch { /* ignore */ }
    window.snSetConsent?.(granted);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Aviso de cookies"
      className="fixed bottom-0 left-0 right-0 z-[300] bg-[#1A1A2E] text-stone-100 px-4 py-3 shadow-2xl"
    >
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="text-xs leading-relaxed flex-1">
          Usamos cookies de <strong>Google Analytics</strong> para medir el uso de la plataforma y
          mejorarla. No se activan hasta que las aceptes. Puedes rechazarlas y seguir usando todo
          con normalidad. Más detalle en el aviso de tratamiento de datos.
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => decide(false)}
            className="px-4 py-2 rounded-lg border border-white/25 text-stone-200 text-xs font-bold hover:bg-white/10"
          >
            Rechazar
          </button>
          <button
            onClick={() => decide(true)}
            className="px-4 py-2 rounded-lg bg-[#C4553A] text-white text-xs font-bold"
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}
