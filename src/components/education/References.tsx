/**
 * Referencias de la sección de aprendizaje (RF-24).
 *
 * Separadas en dos grupos, según pidió la revisión:
 *  · "Para aprender": fuentes y lecturas para entender la sismología y la
 *    historia sísmica/volcánica de Nariño.
 *  · "Base técnica del proyecto": fundamentos del método numérico, software y
 *    fuentes de datos en que se apoya el simulador.
 *
 * Se retiró la Guía de Scrum: es una referencia de la metodología de desarrollo,
 * no del contenido educativo.
 */
import { BookOpen, Code2, Globe } from '../../lib/icons';

interface Ref {
  text: string;
  url?: string;
}

// ── Para aprender (sismología, región, historia) ──
const LEARN: Ref[] = [
  { text: 'Shearer, P. M. (2019). Introduction to Seismology (3.ª ed.). Cambridge University Press.' },
  { text: 'Stein, S., & Wysession, M. (2003). An Introduction to Seismology, Earthquakes, and Earth Structure. Blackwell Publishing.' },
  { text: 'Sarabia, A. M., & Cifuentes, H. G. (2018). Evaluación del grado de daño en la ciudad de Pasto (Colombia) a causa de sismos históricos. Boletín Geológico, 44, 133–152. Servicio Geológico Colombiano.', url: 'https://granate.sgc.gov.co/index.php/boletingeo/article/download/413/363/455' },
  { text: 'Narváez, L., Torres, R., Gómez, D., Cortés, G., Cepeda, H., & Stix, J. (1997). "Tornillo"-type seismic signals at Galeras volcano, Colombia, 1992–1993. Journal of Volcanology and Geothermal Research, 77(1–4), 159–171.', url: 'https://doi.org/10.1016/S0377-0273(96)00092-3' },
  { text: 'Gómez, D. M., & Torres, R. A. (1997). Unusual low-frequency volcanic seismic events with slowly decaying coda waves observed at Galeras and other volcanoes. Journal of Volcanology and Geothermal Research, 77(1–4), 173–193. (Señales de largo período y tremor en Galeras).', url: 'https://doi.org/10.1016/S0377-0273(96)00093-5' },
  { text: 'Baxter, P. J., & Gresham, A. (1997). Deaths and injuries in the eruption of Galeras Volcano, Colombia, 14 January 1993. Journal of Volcanology and Geothermal Research, 77(1–4), 325–338.', url: 'https://doi.org/10.1016/S0377-0273(96)00103-5' },
  { text: 'Servicio Geológico Colombiano, Observatorio Vulcanológico y Sismológico de Pasto (OVSP). Boletines del volcán Galeras.', url: 'https://www2.sgc.gov.co/sgc/volcanes' },
];

// ── Base técnica del proyecto (método numérico, software, datos) ──
const TECH: Ref[] = [
  { text: 'Aki, K., & Richards, P. G. (2002). Quantitative Seismology (2.ª ed.). University Science Books.' },
  { text: 'Moczo, P., Kristek, J., & Gális, M. (2014). The Finite-Difference Modelling of Earthquake Motions: Waves and Ruptures. Cambridge University Press.' },
  { text: 'Virieux, J. (1986). P-SV wave propagation in heterogeneous media: Velocity-stress finite-difference method. Geophysics, 51(4), 889–901.' },
  { text: 'Courant, R., Friedrichs, K., & Lewy, H. (1928). Über die partiellen Differenzengleichungen der mathematischen Physik. Mathematische Annalen, 100, 32–74. (Condición de estabilidad CFL).' },
  { text: 'Cerjan, C., Kosloff, D., Kosloff, R., & Reshef, M. (1985). A nonreflecting boundary condition for discrete acoustic and elastic wave equations. Geophysics, 50(4), 705–708. (Borde absorbente usado por el motor).' },
  { text: 'Kennett, B. L. N., & Engdahl, E. R. (1991). Traveltimes for global earthquake location and phase identification (IASP91). Geophysical Journal International, 105(2), 429–465.' },
  { text: 'Krischer, L. et al. (2015). ObsPy: A bridge for seismology into the scientific Python ecosystem. Computational Science & Discovery, 8(1).', url: 'https://docs.obspy.org' },
];

const OFFICIAL: Ref[] = [
  { text: 'Servicio Geológico Colombiano. Catálogo sísmico y Red Sismológica Nacional de Colombia.', url: 'https://www.sgc.gov.co' },
  { text: 'FDSN — International Federation of Digital Seismograph Networks. Estándares MiniSEED, StationXML y QuakeML.', url: 'https://www.fdsn.org' },
  { text: 'USGS Earthquake Hazards Program — catálogo global de sismos.', url: 'https://earthquake.usgs.gov' },
  { text: 'EarthScope Consortium (IRIS) — metadatos de estaciones y datos federados.', url: 'https://www.earthscope.org' },
];

function RefList({ items }: { items: Ref[] }) {
  return (
    <ol className="space-y-2.5">
      {items.map((r, i) => (
        <li key={i} className="flex gap-3 text-sm text-stone-600 leading-relaxed">
          <span className="text-stone-300 font-mono text-xs pt-0.5 flex-shrink-0 w-6">[{i + 1}]</span>
          <span>
            {r.text}
            {r.url && (
              <> <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-[#C4553A] hover:underline break-all">{r.url}</a></>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function References() {
  return (
    <div className="space-y-5">
      <section className="bg-white rounded-2xl border border-stone-200/60 p-6">
        <h3 className="flex items-center gap-2 font-bold text-[#1A1A2E] mb-4"><BookOpen size={17} className="text-[#C4553A]" /> Para aprender</h3>
        <RefList items={LEARN} />
      </section>
      <section className="bg-white rounded-2xl border border-stone-200/60 p-6">
        <h3 className="flex items-center gap-2 font-bold text-[#1A1A2E] mb-4"><Code2 size={17} className="text-[#2D6A4F]" /> Base técnica del proyecto</h3>
        <RefList items={TECH} />
      </section>
      <section className="bg-white rounded-2xl border border-stone-200/60 p-6">
        <h3 className="flex items-center gap-2 font-bold text-[#1A1A2E] mb-4"><Globe size={17} className="text-[#2D6A4F]" /> Fuentes oficiales y estándares de datos</h3>
        <RefList items={OFFICIAL} />
      </section>
    </div>
  );
}
