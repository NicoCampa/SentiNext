import clsx from 'clsx';

type LogoSize = 'sm' | 'md' | 'lg' | 'xl';

interface SentiNextLogoProps {
  size?: LogoSize;
  glow?: boolean;
  className?: string;
}

const sizeConfig: Record<LogoSize, { box: string; border: string; corner: string; cornerPos: string; text: string }> = {
  sm: { box: 'w-10 h-10', border: 'border', corner: 'w-2 h-2', cornerPos: '-top-[2px] -left-[2px] -right-[2px] -bottom-[2px]', text: 'text-xl' },
  md: { box: 'w-20 h-20', border: 'border-2', corner: 'w-3 h-3', cornerPos: '-top-[2px] -left-[2px] -right-[2px] -bottom-[2px]', text: 'text-2xl' },
  lg: { box: 'w-24 h-24', border: 'border-2', corner: 'w-3 h-3', cornerPos: '-top-1 -left-1 -right-1 -bottom-1', text: 'text-4xl' },
  xl: { box: 'w-28 h-28', border: 'border-2', corner: 'w-4 h-4', cornerPos: '-top-1 -left-1 -right-1 -bottom-1', text: 'text-5xl' },
};

export function SentiNextLogo({ size = 'md', glow = false, className }: SentiNextLogoProps) {
  const cfg = sizeConfig[size];
  // Parse corner positions into individual values
  const positions = cfg.cornerPos.split(' ');
  const top = positions[0]; // e.g. "-top-[2px]" or "-top-1"
  const left = positions[1]; // e.g. "-left-[2px]" or "-left-1"
  const right = positions[2]; // e.g. "-right-[2px]" or "-right-1"
  const bottom = positions[3]; // e.g. "-bottom-[2px]" or "-bottom-1"

  const borderWidth = size === 'sm' ? 'border-t border-l' : 'border-t-2 border-l-2';
  const borderWidthTR = size === 'sm' ? 'border-t border-r' : 'border-t-2 border-r-2';
  const borderWidthBL = size === 'sm' ? 'border-b border-l' : 'border-b-2 border-l-2';
  const borderWidthBR = size === 'sm' ? 'border-b border-r' : 'border-b-2 border-r-2';

  return (
    <div className={clsx(cfg.box, cfg.border, 'border-[rgb(0,255,255)] flex items-center justify-center relative', glow && 'group', className)}>
      {/* Top-left corner — cyan */}
      <div className={clsx('absolute', top, left, cfg.corner, borderWidth, 'border-[rgb(0,255,255)]')} />
      {/* Top-right corner — cyan */}
      <div className={clsx('absolute', top, right, cfg.corner, borderWidthTR, 'border-[rgb(0,255,255)]')} />
      {/* Bottom-left corner — magenta */}
      <div className={clsx('absolute', bottom, left, cfg.corner, borderWidthBL, 'border-[rgb(255,0,128)]')} />
      {/* Bottom-right corner — magenta */}
      <div className={clsx('absolute', bottom, right, cfg.corner, borderWidthBR, 'border-[rgb(255,0,128)]')} />

      <span className={clsx('text-white font-bold', cfg.text)}>SN</span>

      {glow && (
        <div className="absolute inset-0 bg-[rgb(0,255,255)] opacity-0 group-hover:opacity-10 blur-xl transition-opacity" />
      )}
    </div>
  );
}
