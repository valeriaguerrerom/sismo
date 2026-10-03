/**
 * Glosario de términos sismológicos y numéricos (RF-24).
 */
import { useEffect, useMemo, useState } from 'react';
import { Search } from '../../lib/icons';
import { Pagination } from '../ui/Pagination';
import { GLOSSARY, Term } from './glossaryData';

/** Términos por página en el glosario. */
const TERMS_PER_PAGE = 12;


const CATS: { id: Term['cat'] | 'todos'; label: string; color: string }[] = [
  { id: 'todos', label: 'Todos', color: '#1A1A2E' },
  { id: 'sismología', label: 'Sismología', color: '#C4553A' },
  { id: 'ondas', label: 'Ondas', color: '#2D6A4F' },
  { id: 'numérico', label: 'Método numérico', color: '#1A1A2E' },
  { id: 'región', label: 'Nariño', color: '#D4A853' },
];

export function Glossary() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Term['cat'] | 'todos'>('todos');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return GLOSSARY
      .filter(t => cat === 'todos' || t.cat === cat)
      .filter(t => !s || t.term.toLowerCase().includes(s) || t.def.toLowerCase().includes(s))
      .sort((a, b) => a.term.localeCompare(b.term, 'es'));
  }, [q, cat]);

  // Al cambiar la búsqueda o la categoría, vuelve a la primera página.
  useEffect(() => { setPage(1); }, [q, cat]);

  // Términos de la página actual.
  const paged = filtered.slice((page - 1) * TERMS_PER_PAGE, page * TERMS_PER_PAGE);

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar término…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-stone-200 bg-white text-sm focus:outline-none focus:border-[#C4553A]" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CATS.map(c => (
            <button key={c.id} onClick={() => setCat(c.id)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${cat === c.id ? 'text-white border-transparent' : 'bg-white text-stone-500 border-stone-200'}`}
              style={cat === c.id ? { backgroundColor: c.color } : {}}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-stone-400 mb-3">{filtered.length} de {GLOSSARY.length} términos</p>
      <div className="grid md:grid-cols-2 gap-3">
        {paged.map(t => {
          const c = CATS.find(x => x.id === t.cat)!;
          return (
            <div key={t.term} className="bg-white rounded-xl border border-stone-200/60 p-4 card-hover">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-sm text-[#1A1A2E]">{t.term}</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white flex-shrink-0" style={{ backgroundColor: c.color }}>{c.label}</span>
              </div>
              <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">{t.def}</p>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full text-center text-stone-400 text-sm py-10">Sin resultados para "{q}".</div>
        )}
      </div>
      <Pagination
        page={page}
        totalItems={filtered.length}
        pageSize={TERMS_PER_PAGE}
        onChange={setPage}
        className="mt-4"
      />
    </div>
  );
}
