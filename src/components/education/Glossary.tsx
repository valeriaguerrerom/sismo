/**
 * Glosario de términos sismológicos y numéricos.
 *
 * Lista compacta en dos columnas, ordenada alfabéticamente, con un índice de
 * letras para saltar y un buscador. La categoría de cada término se muestra
 * como texto pequeño de color, no como etiqueta. Cada término queda anclado por
 * su letra inicial para que el índice lo lleve directo.
 *
 * @module education/Glossary
 */
import { useMemo, useState } from 'react';
import { Search } from '../../lib/icons';
import { GLOSSARY, Term } from './glossaryData';

/** Color de cada categoría (texto, no fondo). */
const CAT_COLOR: Record<Term['cat'], string> = {
  'sismología': '#C4553A',
  'ondas': '#2D6A4F',
  'numérico': '#6B5B95',
  'región': '#B8860B',
};

/** Primera letra (mayúscula, sin acentos) de un término, para el índice. */
function initial(term: string): string {
  const c = term.trim()[0]?.toUpperCase() ?? '#';
  return c.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function Glossary() {
  const [q, setQ] = useState('');

  const sorted = useMemo(
    () => [...GLOSSARY].sort((a, b) => a.term.localeCompare(b.term, 'es')),
    [],
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return sorted;
    return sorted.filter(t => t.term.toLowerCase().includes(s) || t.def.toLowerCase().includes(s));
  }, [sorted, q]);

  // Letras presentes en la lista filtrada (para habilitar/atenuar el índice).
  const letters = useMemo(() => {
    const set = new Set(filtered.map(t => initial(t.term)));
    return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l => ({ l, has: set.has(l) }));
  }, [filtered]);

  // Agrupa por letra inicial para pintar encabezados y anclas.
  const groups = useMemo(() => {
    const map = new Map<string, Term[]>();
    for (const t of filtered) {
      const l = initial(t.term);
      if (!map.has(l)) map.set(l, []);
      map.get(l)!.push(t);
    }
    return [...map.entries()];
  }, [filtered]);

  const jump = (l: string) => {
    document.getElementById(`glosario-${l}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div>
      {/* Buscador */}
      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar término o definición…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-stone-200 bg-white text-sm focus:outline-none focus:border-[#C4553A]" />
      </div>

      {/* Índice de letras */}
      <div className="flex flex-wrap gap-1 mb-4">
        {letters.map(({ l, has }) => (
          <button
            key={l}
            onClick={() => has && jump(l)}
            disabled={!has}
            className={`w-6 h-6 rounded text-[11px] font-bold transition-colors ${
              has ? 'text-[#C4553A] hover:bg-[#C4553A]/10' : 'text-stone-300 cursor-default'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-stone-400 text-sm py-10">Sin resultados para "{q}".</p>
      ) : (
        <div className="space-y-5">
          {groups.map(([letter, terms]) => (
            <div key={letter} id={`glosario-${letter}`} className="scroll-mt-20">
              <div className="text-xs font-black text-stone-300 mb-1.5">{letter}</div>
              <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                {terms.map(t => (
                  <div key={t.term}>
                    <dt className="text-sm font-bold text-[#1A1A2E]">
                      {t.term}
                      <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: CAT_COLOR[t.cat] }}>{t.cat}</span>
                    </dt>
                    <dd className="text-xs text-stone-500 leading-relaxed mt-0.5">{t.def}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-stone-400 mt-4">{filtered.length} de {GLOSSARY.length} términos</p>
    </div>
  );
}
