import clsx from "clsx";

interface SkeletonProps {
  className?: string;
  variant?: "text" | "rect" | "circle";
  width?: string | number;
  height?: string | number;
}

export function Skeleton({ className, variant = "rect", width, height }: SkeletonProps) {
  const baseClasses = "animate-pulse bg-slate-700/50";

  const variantClasses = {
    text: "h-4 rounded",
    rect: "rounded-lg",
    circle: "rounded-full",
  };

  const style = {
    width: width ? (typeof width === "number" ? `${width}px` : width) : undefined,
    height: height ? (typeof height === "number" ? `${height}px` : height) : undefined,
  };

  return (
    <div
      className={clsx(baseClasses, variantClasses[variant], className)}
      style={style}
    />
  );
}

export function MetricCardSkeleton() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
      <Skeleton variant="text" className="mb-4 w-24" />
      <Skeleton variant="text" className="h-8 w-16" />
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
      <Skeleton variant="text" className="mb-4 w-32" />
      <Skeleton variant="rect" className="h-64 w-full" />
    </div>
  );
}

export function TableRowSkeleton() {
  return (
    <tr className="border-t border-white/5">
      <td className="px-4 py-3">
        <Skeleton variant="text" className="w-full" />
        <Skeleton variant="text" className="mt-2 w-3/4" />
      </td>
      <td className="px-4 py-3">
        <Skeleton variant="text" className="w-16" />
      </td>
      <td className="px-4 py-3">
        <Skeleton variant="text" className="w-24" />
      </td>
    </tr>
  );
}