import type { ReactNode } from "react";
import { clsx } from "clsx";

export function DaoDivider({ className }: { className?: string }) {
  return <div aria-hidden className={clsx("dao-divider", className)} />;
}

export function DaoSeal({ variant = "mirror" }: { variant?: "mirror" | "gate" | "bowl" }) {
  const src =
    variant === "gate"
      ? "/images/ui/gate-threshold.png"
      : variant === "bowl"
        ? "/images/ui/empty-bowl-glow.png"
        : "/images/ui/mirror-seal.png";

  return <div aria-hidden className="dao-seal" style={{ backgroundImage: `url(${src})` }} />;
}

export function DaoPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("dao-panel", className)}>{children}</div>;
}

export function DaoCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("dao-card", className)}>{children}</div>;
}

export function DaoKicker({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={clsx("dao-kicker", className)}>{children}</p>;
}

export function DaoProgress({ value, label }: { value: number; label?: string }) {
  const safeValue = Math.max(0, Math.min(100, value));

  return (
    <div className="dao-progress">
      {label ? <div className="flex justify-between text-xs uppercase tracking-[0.24em] text-gold/70"><span>{label}</span><span>{safeValue}%</span></div> : null}
      <div className="dao-progress-track">
        <div className="dao-progress-fill" style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}

export function DaoStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="dao-stat px-4 py-3">
      <p className="text-[0.65rem] uppercase tracking-[0.22em] text-gold/60">{label}</p>
      <p className="mt-1 text-sm text-white">{value}</p>
    </div>
  );
}


