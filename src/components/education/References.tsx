/**
 * Referencias bibliográficas y técnicas del proyecto (RF-24).
 */
import { BookOpen, Globe, Code2 } from '../../lib/icons';

interface Ref {
  text: string;
  url?: string;
}

const BOOKS: Ref[] = [
  { text: 'Aki, K., & Richards, P. G. (2002). Quantitative Seismology (2.ª ed.). University Science Books.' },
  { text: 'Stein, S., & Wysession, M. (2003). An Introduction to Seismology, Earthquakes, and Earth Structure. Blackwell Publishing.' },
  { text: 'Shearer, P. M. (2019). Introduction to Seismology (3.ª ed.). Cambridge University Press.' },
  { text: 'Moczo, P., Kristek, J., & Gális, M. (2014). The Finite-Difference Modelling of Earthquake Motions: Waves and Ruptures. Cambridge University Press.' },
  { text: 'Virieux, J. (1986). P-SV wave propagation in heterogeneous media: Velocity-stress finite-difference method. Geophysics, 51(4), 889–901.' },
  { text: 'Courant, R., Friedrichs, K., & Lewy, H. (1928). Über die partiellen Differenzengleichungen der mathematischen Physik. Mathematische Annalen, 100, 32–74.' },
  { text: 'Kennett, B. L. N., & Engdahl, E. R. (1991). Traveltimes for global earthquake location and phase identification (IASP91). Geophysical Journal International, 105(2), 429–465.' },
  { text: 'Schwaber, K., & Sutherland, J. (2020). The Scrum Guide.' },
  { text: 'ISO/IEC 25010:2011. Systems and software engineering — Systems and software Quality Requirements and Evaluation (SQuaRE).' },
];

const SOFTWARE: Ref[] = [
  { text: 'Krischer, L. et al. (2015). ObsPy: A bridge for seismology into the scientific Python ecosystem. Computational Science & Discovery, 8(1).', url: 'https://docs.obspy.org' },
  { text: 'van Driel, M. et al. (2015). Instaseis: instant global seismograms based on a broadband waveform database. Solid Earth, 6, 701–717.', url: 'https://instaseis.net' },
  { text: 'IRIS/EarthScope Syngine — servicio de sismogramas sintéticos.', url: 'https://service.iris.edu/irisws/syngine/1/' },
  { text: 'Cabieces, R. et al. (2022). Integrated Seismic Program (ISP): A new Python GUI-based software for earthquake seismology and seismic signal processing. Seismological Research Letters.' },
  { text: 'MTUQ (2025). Moment tensor uncertainty quantification — paquete Python de código abierto.', url: 'https://uafgeotools.github.io/mtuq/' },
  { text: 'Three.js — biblioteca de gráficos 3D para la web.', url: 'https://threejs.org' },
  { text: 'FastAPI — framework web moderno para APIs en Python.', url: 'https://fastapi.tiangolo.com' },
];

const OFFICIAL: Ref[] = [
  { text: 'Servicio Geológico Colombiano. Catálogo sísmico y Red Sismológica Nacional de Colombia.', url: 'https://www.sgc.gov.co' },
  { text: 'Servicio Geológico Colombiano. Observatorio Vulcanológico y Sismológico de Pasto — boletines del volcán Galeras.', url: 'https://www2.sgc.gov.co/sgc/volcanes' },
  { text: 'FDSN — International Federation of Digital Seismograph Networks. Estándares MiniSEED, StationXML y QuakeML.', url: 'https://www.fdsn.org' },
  { text: 'QuakeML — Quake Markup Language 1.2. Especificación del formato.', url: 'https://quake.ethz.ch/quakeml' },
  { text: 'USGS Earthquake Hazards Program — catálogo global.', url: 'https://earthquake.usgs.gov' },
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
        <h3 className="flex items-center gap-2 font-bold text-[#1A1A2E] mb-4"><BookOpen size={17} className="text-[#C4553A]" /> Fundamentos y método numérico</h3>
        <RefList items={BOOKS} />
      </section>
      <section className="bg-white rounded-2xl border border-stone-200/60 p-6">
        <h3 className="flex items-center gap-2 font-bold text-[#1A1A2E] mb-4"><Code2 size={17} className="text-[#6B5B95]" /> Software y antecedentes</h3>
        <RefList items={SOFTWARE} />
      </section>
      <section className="bg-white rounded-2xl border border-stone-200/60 p-6">
        <h3 className="flex items-center gap-2 font-bold text-[#1A1A2E] mb-4"><Globe size={17} className="text-[#2D6A4F]" /> Fuentes oficiales y estándares de datos</h3>
        <RefList items={OFFICIAL} />
      </section>
    </div>
  );
}
