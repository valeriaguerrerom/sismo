import { Page } from '../../lib/types';
import { LogoMark } from '../ui/Logo';

interface Props {
  onNavigate?: (page: Page) => void;
}

export function Footer({ onNavigate }: Props) {
  return (
    <footer className="bg-white border-t border-stone-200/60 py-6">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <LogoMark size={26} rounded={0.32} />
            <span className="font-bold text-sm text-[#1A1A2E]">SismoNariño</span>
            <span className="text-stone-300 text-xs">®</span>
          </div>
          <p className="text-stone-400 text-xs text-center">
            Developers: Valeria Guerrero · Luisa Basante — Universidad Mariana, Nariño
            {onNavigate && (
              <>
                {' · '}
                <button onClick={() => onNavigate('about')} className="text-[#C4553A] font-semibold hover:underline">
                  Acerca del proyecto
                </button>
              </>
            )}
          </p>
          <p className="text-stone-300 text-xs">
            Datos: SGC · OVSP · USGS
          </p>
        </div>
      </div>
    </footer>
  );
}
