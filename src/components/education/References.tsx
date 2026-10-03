/**
 * Referencias del centro de aprendizaje, en formato APA.
 *
 * Agrupadas en "Para aprender" (sismología, región, historia) y "Base técnica
 * del proyecto" (método numérico, software y datos). Los enlaces largos se
 * muestran de forma corta (el DOI o el dominio) para no romper el diseño, y
 * cada cita tiene un botón para copiarla.
 *
 * @module education/References
 */
import { useState } from 'react';

interface Ref {
  cita: string;
  url?: string;
}

// ── Para aprender ──
const LEARN: Ref[] = [
  { cita: 'Shearer, P. M. (2019). Introduction to seismology (3.ª ed.). Cambridge University Press.' },
  { cita: 'Stein, S., & Wysession, M. (2003). An introduction to seismology, earthquakes, and earth structure. Blackwell Publishing.' },
  { cita: 'Sarabia, A. M., & Cifuentes, H. G. (2018). Evaluación del grado de daño en la ciudad de Pasto (Colombia) a causa de sismos históricos. Boletín Geológico, 44, 133–152. Servicio Geológico Colombiano.', url: 'https://granate.sgc.gov.co/index.php/boletingeo/article/download/413/363/455' },
  { cita: 'Vargas, C. A., & Mann, P. (2013). Tearing and breaking off of subducted slabs as the result of collision of the Panama arc-indenter with northwestern South America. Bulletin of the Seismological Society of America, 103(3), 2025–2046.', url: 'https://doi.org/10.1785/0120120328' },
  { cita: 'Hanks, T. C., & Kanamori, H. (1979). A moment magnitude scale. Journal of Geophysical Research, 84(B5), 2348–2350.', url: 'https://doi.org/10.1029/JB084iB05p02348' },
  { cita: 'Baxter, P. J., & Gresham, A. (1997). Deaths and injuries in the eruption of Galeras Volcano, Colombia, 14 January 1993. Journal of Volcanology and Geothermal Research, 77(1–4), 325–338.', url: 'https://doi.org/10.1016/S0377-0273(96)00103-5' },
  { cita: 'Servicio Geológico Colombiano, Observatorio Vulcanológico y Sismológico de Pasto (OVSP). Boletines del volcán Galeras.', url: 'https://www2.sgc.gov.co/sgc/volcanes' },
];

// ── Base técnica del proyecto ──
const TECH: Ref[] = [
  { cita: 'Aki, K., & Richards, P. G. (2002). Quantitative seismology (2.ª ed.). University Science Books.' },
  { cita: 'Moczo, P., Kristek, J., & Gális, M. (2014). The finite-difference modelling of earthquake motions: Waves and ruptures. Cambridge University Press.' },
  { cita: 'Virieux, J. (1986). P-SV wave propagation in heterogeneous media: Velocity-stress finite-difference method. Geophysics, 51(4), 889–901.', url: 'https://doi.org/10.1190/1.1442147' },
  { cita: 'Courant, R., Friedrichs, K., & Lewy, H. (1928). Über die partiellen Differenzengleichungen der mathematischen Physik. Mathematische Annalen, 100, 32–74.', url: 'https://doi.org/10.1007/BF01448839' },
  { cita: 'Cerjan, C., Kosloff, D., Kosloff, R., & Reshef, M. (1985). A nonreflecting boundary condition for discrete acoustic and elastic wave equations. Geophysics, 50(4), 705–708.', url: 'https://doi.org/10.1190/1.1441945' },
  { cita: 'Kennett, B. L. N., & Engdahl, E. R. (1991). Traveltimes for global earthquake location and phase identification. Geophysical Journal International, 105(2), 429–465.', url: 'https://doi.org/10.1111/j.1365-246X.1991.tb06724.x' },
  { cita: 'Krischer, L., Megies, T., Barsch, R., Beyreuther, M., Lecocq, T., Caudron, C., & Wassermann, J. (2015). ObsPy: A bridge for seismology into the scientific Python ecosystem. Computational Science & Discovery, 8(1), 014003.', url: 'https://doi.org/10.1088/1749-4699/8/1/014003' },
];

/** Versión corta de un enlace: el DOI (sin el prefijo) o el dominio. */
function shortLink(url: string): string {
  const doi = url.match(/doi\.org\/(.+)$/);
  if (doi) return `doi: ${doi[1]}`;
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function RefList({ items }: { items: Ref[] }) {
  const [copied, setCopied] = useState<number | null>(null);
  const copy = async (i: number, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(i); setTimeout(() => setCopied(c => (c === i ? null : c)), 1500); } catch { /* sin portapapeles */ }
  };
  return (
    <ol className="space-y-3">
      {items.map((r, i) => (
        <li key={i} className="flex gap-3 text-sm text-stone-600 leading-relaxed">
          <span className="text-stone-300 font-mono text-xs pt-0.5 flex-shrink-0 w-5">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <span>{r.cita}</span>
            {r.url && (
              <> <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-[#C4553A] hover:underline">{shortLink(r.url)}</a></>
            )}
            <button
              onClick={() => copy(i, r.url ? `${r.cita} ${r.url}` : r.cita)}
              className="ml-2 text-[11px] font-semibold text-stone-400 hover:text-[#C4553A]"
            >
              {copied === i ? 'copiado' : 'copiar'}
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function References() {
  return (
    <div className="space-y-5">
      <section className="bg-white rounded-2xl border border-stone-200/60 p-5">
        <h3 className="font-bold text-[#1A1A2E] mb-3">Para aprender</h3>
        <RefList items={LEARN} />
      </section>
      <section className="bg-white rounded-2xl border border-stone-200/60 p-5">
        <h3 className="font-bold text-[#1A1A2E] mb-3">Base técnica del proyecto</h3>
        <RefList items={TECH} />
      </section>
    </div>
  );
}
