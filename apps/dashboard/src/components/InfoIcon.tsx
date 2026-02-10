'use client';

import { useEffect, useRef, useState } from "react";

interface InfoIconProps {
  text: string;
}

export function InfoIcon({ text }: InfoIconProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open]);

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        type="button"
        aria-label="Toggle explanation"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[10px] text-slate-200 transition hover:border-white/40 hover:text-white"
      >
        ⓘ
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-30 mb-2 w-72 max-w-[18rem] rounded-lg border border-white/10 bg-slate-900/90 p-3 text-left text-xs leading-relaxed text-slate-200 shadow-[0_14px_30px_rgba(8,15,40,0.45)]">
          {text}
        </div>
      )}
    </div>
  );
}