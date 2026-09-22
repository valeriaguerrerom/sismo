interface BadgeProps {
  label: string;
  variant?: 'tectonic' | 'volcanic' | 'default';
}

export function Badge({ label, variant = 'default' }: BadgeProps) {
  const styles = {
    tectonic: 'bg-[#2D6A4F]/10 text-[#2D6A4F] border border-[#2D6A4F]/20',
    volcanic: 'bg-[#C4553A]/10 text-[#C4553A] border border-[#C4553A]/20',
    default: 'bg-stone-100 text-stone-600 border border-stone-200',
  };

  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${styles[variant]}`}>
      {label}
    </span>
  );
}
