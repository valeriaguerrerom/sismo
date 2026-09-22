import { SimProgress } from '../../lib/types';

interface Props {
  progress: SimProgress;
}

export function ProgressBar({ progress }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-[#1A1A2E]">Resolviendo ecuación de onda elástica...</span>
          <span className="text-sm font-bold text-[#C4553A]">{progress.percent}%</span>
        </div>
        <div className="w-full h-3 bg-stone-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#C4553A] to-[#D4A853] rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
        <p className="text-xs text-stone-400 mt-2 text-center font-mono">
          Paso {progress.step.toLocaleString()} / {progress.totalSteps.toLocaleString()} · Diferencias Finitas 2D
        </p>
      </div>
    </div>
  );
}
