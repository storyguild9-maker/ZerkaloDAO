"use client";

import { useEffect, useState } from "react";
import * as THREE from "three";
import { MeshySceneConstructor } from "@/components/MeshySceneConstructor";
import { assetUrl } from "@/lib/assetUrl";

type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

type TelegramWebApp = {
  initData: string;
  ready: () => void;
  expand: () => void;
  requestFullscreen?: () => void;
  lockOrientation?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  enableClosingConfirmation?: () => void;
  isVersionAtLeast?: (version: string) => boolean;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function TelegramMiniAppShell() {
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [status, setStatus] = useState("Проверяем вход через Telegram...");
  const [error, setError] = useState("");
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    THREE.DefaultLoadingManager.setURLModifier(assetUrl);
    return () => {
      THREE.DefaultLoadingManager.setURLModifier((url) => url);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const telegram = window.Telegram?.WebApp;
    telegram?.setHeaderColor?.("#07100d");
    telegram?.setBackgroundColor?.("#020706");
    telegram?.expand();
    telegram?.ready();

    const initData = telegram?.initData ?? "";
    const devMode = process.env.NEXT_PUBLIC_TELEGRAM_DEV_MODE === "true";
    if (!initData && !devMode) {
      setStatus("");
      setError("Откройте «Зеркало Дао» кнопкой внутри Telegram-бота.");
      return;
    }

    void fetch("/api/telegram/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData })
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error || "Вход не подтверждён");
        if (!cancelled) {
          setUser(payload.user);
          setStatus("Вход подтверждён");
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setStatus("");
          setError(reason instanceof Error ? reason.message : "Не удалось войти");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const enterTemple = () => {
    setEntered(true);
    const telegram = window.Telegram?.WebApp;
    try { telegram?.expand(); } catch {}
    if (telegram?.isVersionAtLeast?.("8.0")) {
      try { telegram.requestFullscreen?.(); } catch {}
      try { telegram.lockOrientation?.(); } catch {}
    }
    try { telegram?.enableClosingConfirmation?.(); } catch {}
  };

  if (entered && user) {
    return (
      <div className="telegram-mini-app telegram-mini-app--entered">
        <MeshySceneConstructor plain telegram />
      </div>
    );
  }

  return (
    <section
      className="telegram-mini-app telegram-entry"
      style={{
        backgroundImage: `linear-gradient(90deg, rgba(1, 7, 5, 0.84), rgba(1, 7, 5, 0.28)), url("${assetUrl("/images/dao-intro-poster-4k.jpg")}")`
      }}
    >
      <div className="telegram-entry__veil" />
      <div className="telegram-entry__content">
        <p className="dao-kicker">Зеркало Дао</p>
        <h1>{user ? `Добро пожаловать, ${user.first_name}` : "Вход в пространство"}</h1>
        <p className="telegram-entry__status" role="status">{error || status}</p>
        <button disabled={!user} onClick={enterTemple} type="button">
          {user ? "Войти в храм" : "Ожидание Telegram"}
        </button>
      </div>
    </section>
  );
}

