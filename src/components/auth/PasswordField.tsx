/**
 * Campo de contraseña con botón de ojo para mostrar u ocultar el texto.
 * La contraseña NUNCA se transforma ni se cifra en el cliente: Supabase la
 * guarda con hash en el servidor.
 */
import { useState } from 'react';
import { Lock, Eye, EyeSlash } from '../../lib/icons';
import { Field } from './ResearcherFields';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}

export function PasswordField({ value, onChange, placeholder = 'Contraseña', autoComplete = 'current-password' }: Props) {
  const [show, setShow] = useState(false);
  return (
    <Field icon={<Lock size={16} />} label="Contraseña">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required
        autoComplete={autoComplete}
        className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-[#C4553A] bg-stone-50"
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
        aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        title={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      >
        {show ? <EyeSlash size={16} /> : <Eye size={16} />}
      </button>
    </Field>
  );
}
