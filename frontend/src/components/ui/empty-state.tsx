import clsx from "clsx";
import { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  variant?: "default" | "info" | "warning" | "error";
  className?: string;
}

const variantStyles = {
  default: "border-slate-600/40 bg-slate-800/30",
  info: "border-sky-400/40 bg-sky-500/10",
  warning: "border-amber-400/40 bg-amber-500/10",
  error: "border-rose-400/40 bg-rose-500/10",
};

const variantTextStyles = {
  default: "text-slate-300",
  info: "text-sky-200",
  warning: "text-amber-200",
  error: "text-rose-200",
};

export function EmptyState({
  title,
  description,
  icon,
  action,
  variant = "default",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={clsx(
        "rounded-3xl border p-8 text-center backdrop-blur",
        variantStyles[variant],
        className
      )}
    >
      {icon && (
        <div className="mb-4 flex justify-center text-4xl opacity-50">{icon}</div>
      )}
      <h3
        className={clsx(
          "text-lg font-semibold",
          variantTextStyles[variant]
        )}
      >
        {title}
      </h3>
      {description && (
        <p className={clsx("mt-2 text-sm", variantTextStyles[variant])}>
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}