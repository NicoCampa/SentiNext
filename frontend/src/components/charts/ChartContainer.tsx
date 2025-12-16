import { ReactNode } from "react";
import { ThemeDefinition } from "@/types";
import { hexToRgba } from "@/utils/colors";
import { InfoIcon } from "../InfoIcon";

interface ChartContainerProps {
  title: string;
  helper?: string;
  theme: ThemeDefinition;
  children: ReactNode;
  actions?: ReactNode;
}

export function ChartContainer({ title, helper, theme, children, actions }: ChartContainerProps) {
  return (
    <div
      className="rounded-2xl border p-5 shadow-[0_20px_45px_rgba(8,15,40,0.45)] backdrop-blur"
      style={{
        borderColor: theme.palette.border,
        background: hexToRgba(theme.palette.surface_alt, 0.72),
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h4 className="text-base font-semibold text-white">{title}</h4>
          {helper && <InfoIcon text={helper} />}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}