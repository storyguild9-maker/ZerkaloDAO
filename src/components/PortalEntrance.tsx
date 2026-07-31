"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PortalEntrance() {
  const router = useRouter();
  const [opening, setOpening] = useState(false);

  function enterPortal() {
    if (opening) return;
    setOpening(true);
    window.setTimeout(() => router.push("/inner"), 1650);
  }

  return (
    <button
      type="button"
      className={`portal-gate ${opening ? "is-opening" : ""}`}
      aria-label="Войти во внутренний раздел"
      onClick={enterPortal}
    >
      <span className="portal-gate__aura" />
      <span className="portal-gate__ring" />
      <span className="portal-gate__surface">
        <span className="portal-gate__liquid portal-gate__liquid-a" />
        <span className="portal-gate__liquid portal-gate__liquid-b" />
        <span className="portal-gate__liquid portal-gate__liquid-c" />
        <span className="portal-gate__shine" />
        <span className="portal-gate__ripple" />
      </span>
      <span className="portal-gate__label">Войти</span>
    </button>
  );
}
