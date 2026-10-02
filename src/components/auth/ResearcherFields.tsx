/**
 * Campos del perfil de investigador, compartidos por el registro manual y
 * por el paso "Completar perfil" (registro con Google o perfiles antiguos).
 *
 * Varios campos son listas desplegables con una opción "Otro/Otra" que, al
 * elegirla, muestra un campo de texto libre. El valor que se guarda es el texto
 * final (el de la lista o el escrito a mano), así que el resto de la app no
 * cambia. Los valores por defecto sugeridos son Colombia / Nariño / Pasto.
 */
import { useState } from 'react';
import { User, Building, Briefcase, FlaskConical, MapPin, Globe, MessageSquare } from '../../lib/icons';
import type { ResearcherSignUp } from '../../lib/authTypes';
import {
  OCCUPATIONS, INSTITUTIONS, USAGE_PURPOSES, COUNTRIES, CITIES, OTHER_VALUES, inputCls,
} from './researcherFieldsConstants';

export function Field({ icon, label, children, optional }: { icon: React.ReactNode; label: string; children: React.ReactNode; optional?: boolean }) {
  return (
    <div>
      <label className="text-xs font-semibold text-stone-500 mb-1 block">{label}{optional && <span className="text-stone-400 font-normal"> (opcional)</span>}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none">{icon}</span>
        {children}
      </div>
    </div>
  );
}

/**
 * Desplegable con opción "Otro/Otra": si el valor guardado está en la lista, se
 * muestra seleccionado; si no (y no está vacío), se asume "Otro" y aparece el
 * campo de texto libre con ese valor. El `otherLabel` es la opción que dispara
 * el input ("Otro" u "Otra"). Siempre guarda el texto final en `value`.
 */
function SelectOrOther({
  value, onChange, options, otherLabel, placeholder, required,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  otherLabel: string;
  placeholder: string;
  required?: boolean;
}) {
  // ¿El valor actual corresponde a una opción de la lista (distinta de "Otro")?
  const inList = value !== '' && options.includes(value) && !OTHER_VALUES.includes(value);
  // "Modo otro": el usuario eligió Otro, o el valor guardado no está en la lista.
  const [forceOther, setForceOther] = useState(false);
  const isOther = forceOther || (value !== '' && !inList);

  return (
    <div className="space-y-2">
      <select
        value={isOther ? otherLabel : value}
        required={required}
        onChange={e => {
          if (OTHER_VALUES.includes(e.target.value)) { setForceOther(true); onChange(''); }
          else { setForceOther(false); onChange(e.target.value); }
        }}
        className={inputCls}
      >
        <option value="">Selecciona…</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      {isOther && (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          // El icono del Field ocupa la izquierda; este input va sin icono.
          className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-[#C4553A] bg-stone-50"
        />
      )}
    </div>
  );
}

interface Props {
  form: ResearcherSignUp;
  onChange: <K extends keyof ResearcherSignUp>(key: K, value: ResearcherSignUp[K]) => void;
  /** Oculta el nombre cuando ya viene de Google y se muestra aparte. */
  showName?: boolean;
}

export function ResearcherFields({ form, onChange, showName = true }: Props) {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {showName && (
        <div className="sm:col-span-2">
          <Field icon={<User size={16} />} label="Nombre completo">
            <input type="text" value={form.fullName} onChange={e => onChange('fullName', e.target.value)} placeholder="Nombre y apellidos" required className={inputCls} />
          </Field>
        </div>
      )}
      <Field icon={<Building size={16} />} label="Institución">
        <SelectOrOther
          value={form.institution}
          onChange={v => onChange('institution', v)}
          options={INSTITUTIONS}
          otherLabel="Otra"
          placeholder="Escribe tu institución"
          required
        />
      </Field>
      <Field icon={<Briefcase size={16} />} label="Ocupación">
        <select value={form.occupation} onChange={e => onChange('occupation', e.target.value)} required className={inputCls}>
          <option value="">Selecciona…</option>
          {OCCUPATIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </Field>
      <Field icon={<FlaskConical size={16} />} label="Área de investigación o interés">
        <input type="text" value={form.researchArea} onChange={e => onChange('researchArea', e.target.value)} placeholder="Sismología, vulcanología, geotecnia…" required className={inputCls} />
      </Field>
      <Field icon={<MapPin size={16} />} label="Ciudad">
        <SelectOrOther
          value={form.city}
          onChange={v => onChange('city', v)}
          options={CITIES}
          otherLabel="Otra"
          placeholder="Escribe tu ciudad"
          required
        />
      </Field>
      <Field icon={<Globe size={16} />} label="País">
        <SelectOrOther
          value={form.country}
          onChange={v => onChange('country', v)}
          options={COUNTRIES}
          otherLabel="Otro"
          placeholder="Escribe tu país"
          required
        />
      </Field>
      <div className={showName ? 'sm:col-span-1' : 'sm:col-span-2'}>
        <Field icon={<MessageSquare size={16} />} label="¿Para qué usarás la plataforma?" optional>
          <SelectOrOther
            value={form.usagePurpose}
            onChange={v => onChange('usagePurpose', v)}
            options={USAGE_PURPOSES}
            otherLabel="Otro"
            placeholder="Cuéntanos para qué la usarás"
          />
        </Field>
      </div>
    </div>
  );
}
