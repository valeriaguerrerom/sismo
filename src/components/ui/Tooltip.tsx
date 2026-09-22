import { useState, ReactNode } from 'react';
import { Info } from '../../lib/icons';

interface TooltipProps {
  content: string;
  children?: ReactNode;
  showIcon?: boolean;
}

export function Tooltip({ content, children, showIcon = false }: TooltipProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span className="relative inline-flex items-center gap-1" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
      {children}
      {showIcon && <Info size={13} className="text-stone-400 cursor-help" />}
      {visible && (
        <span className="absolute z-50 top-full left-0 mt-2 w-52 bg-[#1A1A2E] text-white text-[11px] rounded-lg px-3 py-2 shadow-xl leading-relaxed pointer-events-none">
          {content}
          <span className="absolute bottom-full left-4 border-4 border-transparent border-b-[#1A1A2E]" />
        </span>
      )}
    </span>
  );
}
