/**
 * Glosario de términos sismológicos y numéricos.
 *
 * Lista compacta en dos columnas, ordenada alfabéticamente, con un índice de
 * letras y un buscador. Para que el scroll no sea largo, se pagina: al tocar una
 * letra del índice se salta a la página donde empieza esa letra. La categoría de
 * cada término se muestra como texto pequeño de color, no como etiqueta.
 *
 * @module education/Glossary
 */
import { useEffect, useMemo, useState } from 'react';
import { Search } from '../../lib/icons';
import { Pagination } from '../ui/Pagination';
import { GLOSSARY, Term } from './glossaryData';

/** Términos por página. */
const TERMS_PER_PAGE = 12;

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
  const [page, setPage] = useState(1);

  const sorted = useMemo(
    () => [...GLOSSARY].sort((a, b) => a.term.localeCompare(b.term, 'es')),
    [],
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return sorted;
    return sorted.filter(t => t.term.toLowerCase().includes(s) || t.def.toLowerCase().includes(s));
  }, [sorted, q]);

  // Al buscar, vuelve a la primera página.
  useEffect(() => { setPage(1); }, [q]);

  // Página actual de términos.
  const paged = filtered.slice((page - 1) * TERMS_PER_PAGE, page * TERMS_PER_PAGE);

  // Letras presentes en la lista filtrada; cada una guarda la página donde
  // aparece su primer término, para que el índice salte a esa página.
  const letterPage = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((t, i) => {
      const l = initial(t.term);
      if (!map.has(l)) map.set(l, Math.floor(i / TERMS_PER_PAGE) + 1);
    });
    return map;
  }, [filtered]);

  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l => ({ l, page: letterPage.get(l) }));

  // Agrupa los términos de la página actual por letra inicial (encabezados).
  const groups = useMemo(() => {
    const map = new Map<string, Term[]>();
    for (const t of paged) {
      const l = initial(t.term);
      if (!map.has(l)) map.set(l, []);
      map.get(l)!.push(t);
    }
    return [...map.entries()];
  }, [paged]);

  return (
    <div>
      {/* Buscador */}
      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar término o definición…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-stone-200 bg-white text-sm focus:outline-none focus:border-[#C4553A]" />
      </div>

      {/* Índice de letras: salta a la página donde empieza cada letra */}
      <div className="flex flex-wrap gap-1 mb-4">
        {letters.map(({ l, page: lp }) => (
          <button
            key={l}
            onClick={() => lp && setPage(lp)}
            disabled={!lp}
            className={`w-6 h-6 rounded text-[11px] font-bold transition-colors ${
              lp ? 'text-[#C4553A] hover:bg-[#C4553A]/10' : 'text-stone-300 cursor-default'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-stone-400 text-sm py-10">Sin resultados para "{q}".</p>
      ) : (
        <>
          <div className="space-y-5">
            {groups.map(([letter, terms]) => (
              <div key={letter}>
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
          <Pagination
            page={page}
            totalItems={filtered.length}
            pageSize={TERMS_PER_PAGE}
            onChange={setPage}
            className="mt-5"
          />
        </>
      )}
    </div>
  );
}
