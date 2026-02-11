import clsx from 'clsx';

type LogoSize = 'sm' | 'md' | 'lg' | 'xl';

interface SentiNextLogoProps {
  size?: LogoSize;
  glow?: boolean;
  className?: string;
}

const sizeConfig: Record<LogoSize, { box: string; text: string }> = {
  sm: { box: 'w-10 h-10', text: 'text-xl' },
  md: { box: 'w-20 h-20', text: 'text-2xl' },
  lg: { box: 'w-24 h-24', text: 'text-4xl' },
  xl: { box: 'w-28 h-28', text: 'text-5xl' },
};

export function SentiNextLogo({ size = 'md', glow = false, className }: SentiNextLogoProps) {
  const cfg = sizeConfig[size];

  return (
    <div className={clsx(cfg.box, 'flex items-center justify-center relative', glow && 'group', className)}>
      <span className={clsx('font-bold', cfg.text)}>
        <span className="text-[rgb(0,255,255)]">S</span>
        <span className="text-[rgb(255,0,128)]">N</span>
      </span>

      {glow && (
        <div className="absolute inset-0 bg-[rgb(0,255,255)] opacity-0 group-hover:opacity-10 blur-xl transition-opacity" />
      )}
    </div>
  );
}
