/**
 * Formulario de retroalimentación reutilizable.
 *
 * Se usa en About (sección pública "Escríbenos") y en MyReports
 * (sección de usuario logueado para sugerir contenido o reportar errores).
 * El envío pasa por POST /api/feedback (backend); no escribe en Supabase directamente.
 */
import { useState } from 'react';
import { DATA_POLICY_URL, CONTACT_EMAIL } from '../../lib/authConsent';
import {
  submitFeedback, FEEDBACK_TYPE_LABELS, FEEDBACK_MAX_LENGTH,
  type FeedbackType,
} from '../../lib/feedback';

const C = {
  ink: '#1A1A2E',
  forest: '#2D6A4F',
  terracotta: '#C4553A',
};

const TYPE_ORDER: FeedbackType[] = ['sugerencia', 'error', 'datos', 'otro'];

export interface FeedbackSectionProps {
  /** Correo prellenado (del usuario autenticado, o vacío). */
  userEmail?: string;
  /**
   * Título del bloque. Por defecto "¿Qué le falta a SismoNariño?".
   * En MyReports se puede personalizar.
   */
  title?: string;
  /** Subtítulo/descripción bajo el título. */
  description?: string;
  /**
   * Items de la lista explicativa (izquierda).
   * Si no se pasa, se usan los tres por defecto (sugerencias, errores, datos).
   */
  items?: { t: string; d: string }[];
  /** Clases extra para el contenedor externo. */
  className?: string;
}

export function FeedbackSection({
  userEmail = '',
  title = '¿Qué le falta a SismoNariño?',
  description = 'Es un proyecto vivo y nos ayuda saber cómo lo usas. No necesitas iniciar sesión.',
  items,
  className = '',
}: FeedbackSectionProps) {
  const defaultItems = [
    { t: 'Sugerencias', d: 'Ideas para mejorar la simulación, el mapa o el centro educativo.' },
    { t: 'Reportes de error', d: 'Algo que no funciona, se ve mal o da un resultado extraño.' },
    { t: 'Solicitudes de datos', d: 'Un evento o una estación que te gustaría ver en la plataforma.' },
  ];
  const listItems = items ?? defaultItems;

  const [type, setType] = useState<FeedbackType>('sugerencia');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(userEmail);
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const hasEmail = email.trim() !== '';
  const needsConsent = hasEmail && !consent;
  const emptyMessage = message.trim() === '';
  const overLimit = message.length > FEEDBACK_MAX_LENGTH;
  const canSend = !emptyMessage && !overLimit && !needsConsent && !sending;

  const disabledReason =
    emptyMessage ? 'Escribe un mensaje para enviar'
      : overLimit ? 'El mensaje es demasiado largo'
        : needsConsent ? 'Autoriza el tratamiento de tu correo'
          : '';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!canSend) return;
    setSending(true);
    const res = await submitFeedback({ type, message, email: email || null, consent, honeypot });
    setSending(false);
    if (res.ok) { setSent(true); setMessage(''); setConsent(false); }
    else setError(res.message);
  }

  return (
    <div className={`grid md:grid-cols-2 gap-10 md:gap-14 items-stretch ${className}`}>
      {/* Columna izquierda: descripción */}
      <div className="flex flex-col justify-center">
        <h2 className="text-2xl md:text-3xl font-black tracking-tight leading-tight" style={{ color: C.ink }}>
          {title}
        </h2>
        <p className="text-stone-500 mt-3 max-w-md text-sm">{description}</p>
        <ul className="mt-5 space-y-3 max-w-md">
          {listItems.map(i => (
            <li key={i.t} className="flex gap-3">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: C.terracotta }} />
              <span className="text-sm text-stone-600 leading-relaxed">
                <span className="font-semibold" style={{ color: C.ink }}>{i.t}.</span> {i.d}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-stone-400 mt-5 max-w-md leading-relaxed">
          También puedes escribirnos a{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold hover:underline" style={{ color: C.forest }}>
            {CONTACT_EMAIL}
          </a>. Respondemos si dejas un correo.
        </p>
      </div>

      {/* Columna derecha: formulario */}
      <div>
        {sent ? (
          <div className="flex flex-col items-center justify-center text-center min-h-[260px] py-10">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: `${C.forest}1a` }}>
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke={C.forest}
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <p className="text-lg font-bold" style={{ color: C.ink }}>Gracias, recibimos tu mensaje.</p>
            <p className="text-sm text-stone-500 mt-1">Te responderemos si dejaste un correo.</p>
            <button onClick={() => setSent(false)}
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white btn-hover"
              style={{ backgroundColor: C.terracotta }}>
              Enviar otro mensaje
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Tipo */}
            <div>
              <label className="block text-xs font-semibold text-stone-500 mb-1.5">Tipo de mensaje</label>
              <div className="flex flex-wrap gap-2">
                {TYPE_ORDER.map(t => (
                  <button key={t} type="button" onClick={() => setType(t)}
                    className="px-3.5 py-2 rounded-xl text-sm font-semibold border transition-colors"
                    style={type === t
                      ? { borderColor: C.terracotta, backgroundColor: `${C.terracotta}14`, color: C.terracotta }
                      : { borderColor: '#E7E5E4', color: '#78716C' }}>
                    {FEEDBACK_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* Mensaje */}
            <div>
              <label className="block text-xs font-semibold text-stone-500 mb-1.5">Mensaje</label>
              <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5}
                maxLength={FEEDBACK_MAX_LENGTH + 100}
                placeholder="Escribe aquí tu mensaje…"
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm resize-y focus:outline-none focus:border-[#C4553A] bg-stone-50" />
              <div className={`text-xs mt-1 text-right ${overLimit ? 'text-red-500' : 'text-stone-400'}`}>
                {message.length}/{FEEDBACK_MAX_LENGTH}
              </div>
            </div>

            {/* Correo */}
            <div>
              <label className="block text-xs font-semibold text-stone-500 mb-1.5">
                Correo <span className="font-normal text-stone-400">(opcional, solo si quieres que te respondamos)</span>
              </label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="tucorreo@ejemplo.com"
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-[#C4553A] bg-stone-50" />
            </div>

            {/* Consentimiento */}
            {hasEmail && (
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[#C4553A]" />
                <span className="text-[12px] leading-snug text-stone-600">
                  Autorizo el tratamiento de mi correo conforme a la Ley 1581 de 2012 y la{' '}
                  <a href={DATA_POLICY_URL} target="_blank" rel="noopener noreferrer"
                    className="font-semibold hover:underline" style={{ color: C.forest }}>
                    Política de protección de datos de la Universidad Mariana
                  </a>, únicamente para responder a este mensaje.
                </span>
              </label>
            )}

            {/* Honeypot */}
            <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
              <label>No llenar
                <input type="text" tabIndex={-1} autoComplete="off"
                  value={honeypot} onChange={e => setHoneypot(e.target.value)} />
              </label>
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2 border border-red-100">{error}</p>
            )}

            <div className="flex items-center gap-3">
              <button type="submit" disabled={!canSend}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white transition-colors"
                style={{ backgroundColor: canSend ? C.terracotta : '#A8A29E', cursor: canSend ? 'pointer' : 'not-allowed' }}>
                {sending ? 'Enviando…' : 'Enviar mensaje'}
              </button>
              {!canSend && disabledReason && (
                <span className="text-xs text-stone-400">{disabledReason}</span>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
