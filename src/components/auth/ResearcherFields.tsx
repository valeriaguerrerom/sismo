/**
 * Campos del perfil de investigador, compartidos por el registro manual y
 * por el paso "Completar perfil" (registro con Google o perfiles antiguos).
 */
import { User, Building, Briefcase, FlaskConical, MapPin, Globe, MessageSquare } from '../../lib/icons';
import type { ResearcherSignUp } from '../../lib/auth';

export const OCCUPATIONS = [
  'Estudiante de pregrado', 'Estudiante de posgrado', 'Docente', 'Investigador(a)',
  'Profesional (geociencias / ingeniería)', 'Funcionario(a) de entidad pública', 'Otro',
];

export const inputCls = 'w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-[#C4553A] bg-stone-50';

export function Field({ icon, label, children, optional }: { icon: React.ReactNode; label: string; children: React.ReactNode; optional?: boolean }) {
  return (
    <div>
      <label className="text-xs font-semibold text-stone-500 mb-1 block">{label}{optional && <span className="text-stone-300 font-normal"> (opcional)</span>}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none">{icon}</span>
        {children}
      </div>
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
    <div className="grid sm:grid-cols-2 gap-4">
      {showName && (
        <div className="sm:col-span-2">
          <Field icon={<User size={16} />} label="Nombre completo">
            <input type="text" value={form.fullName} onChange={e => onChange('fullName', e.target.value)} placeholder="Nombre y apellidos" required className={inputCls} />
          </Field>
        </div>
      )}
      <Field icon={<Building size={16} />} label="Institución">
        <input type="text" value={form.institution} onChange={e => onChange('institution', e.target.value)} placeholder="Universidad Mariana" required className={inputCls} />
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
        <input type="text" value={form.city} onChange={e => onChange('city', e.target.value)} placeholder="San Juan de Pasto" required className={inputCls} />
      </Field>
      <Field icon={<Globe size={16} />} label="País">
        <input type="text" value={form.country} onChange={e => onChange('country', e.target.value)} placeholder="Colombia" required className={inputCls} />
      </Field>
      <div className={showName ? 'sm:col-span-1' : 'sm:col-span-2'}>
        <Field icon={<MessageSquare size={16} />} label="¿Para qué usarás la plataforma?" optional>
          <input type="text" value={form.usagePurpose} onChange={e => onChange('usagePurpose', e.target.value)} placeholder="Tesis, docencia, análisis de eventos del Galeras…" className={inputCls} />
        </Field>
      </div>
    </div>
  );
}
