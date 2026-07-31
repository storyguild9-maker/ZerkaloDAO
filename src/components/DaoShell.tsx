import type { ReactNode } from "react";
import Link from "next/link";
import { DaoDivider } from "@/components/DaoDesign";

export function DaoShell({
  eyebrow,
  title,
  subtitle,
  children,
  wide = false
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  seal?: "mirror" | "gate" | "bowl";
  wide?: boolean;
}) {
  return (
    <section className={`dao-shell mx-auto flex min-h-[calc(100vh-4rem)] w-full flex-col justify-center ${wide ? "max-w-[82rem]" : "max-w-[54rem]"}`}>
      <div className="dao-topbar mb-6 flex items-center justify-between gap-5 rounded-full px-5 py-3 text-[0.68rem] uppercase tracking-[0.32em] text-gold/75 sm:px-6">
        <Link href="/" className="transition hover:text-gold">
          Основная
        </Link>
        <span className="hidden h-px flex-1 bg-gradient-to-r from-gold/20 via-emerald-200/10 to-transparent sm:block" />
        <span className="text-right">{eyebrow ?? "Лабиринт самонаблюдения"}</span>
      </div>

      <div className="dao-frame">
        <div className="dao-content">
          <div className="max-w-3xl">
            <p className="dao-kicker mb-4">{eyebrow ?? "Порог"}</p>
            <h1 className="dao-title max-w-4xl text-4xl font-semibold leading-[1.05] text-white sm:text-6xl">{title}</h1>
            {subtitle ? <p className="dao-subtitle mt-5 max-w-3xl text-lg leading-8 text-mist/75">{subtitle}</p> : null}
          </div>
          <DaoDivider className="my-8" />
          <div>{children}</div>
        </div>
      </div>
    </section>
  );
}
