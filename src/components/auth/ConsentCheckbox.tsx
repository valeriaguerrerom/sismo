/**
 * Casilla obligatoria de autorización de datos personales (Ley 1581 de 2012)
 * compartida por el registro y por "Completa tu perfil". No crea una página de
 * política propia: enlaza a la política institucional de la Universidad Mariana.
 */
import { DATA_POLICY_URL } from '../../lib/authConsent';

interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
}

export function ConsentCheckbox({ checked, onChange }: Props) {
  return (
    <div>
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          required
          className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[#C4553A]"
        />
        <span className="text-[12px] leading-snug text-stone-600">
          Autorizo el tratamiento de mis datos personales conforme a la Ley 1581 de 2012 y la{' '}
          <a href={DATA_POLICY_URL} target="_blank" rel="noopener noreferrer" className="text-[#2D6A4F] font-semibold hover:underline">
            Política de protección de datos de la Universidad Mariana
          </a>.
        </span>
      </label>
      <p className="text-[11px] text-stone-400 leading-relaxed mt-2">
        Tus datos se usan únicamente para caracterizar a los usuarios de la plataforma.
      </p>
    </div>
  );
}
