"use client";

import { useEffect, useRef, useState } from "react";
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

const WORLD_LOAD_SETTLE_MS = 2400;
const WORLD_LOAD_STALL_MS = 35000;

const formatWorldItem = (url: string) => {
  const normalized = url.toLowerCase();
  if (normalized.includes("solar") || normalized.includes("sun")) return "Формирую Солнце";
  if (normalized.includes("floor")) return "Проявляю пол храма";
  if (normalized.includes("table")) return "Собираю круглый стол";
  if (normalized.includes("chair") || normalized.includes("seat")) return "Расставляю кресла";
  if (normalized.includes("initiate") || normalized.includes("avatar")) return "Призываю ваш аватар";
  if (normalized.includes("manifest")) return "Читаю карту пространства";
  return "Собираю пространство";
};
export function TelegramMiniAppShell() {
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [status, setStatus] = useState("Проверяем вход через Telegram...");
  const [error, setError] = useState("");
  const [entered, setEntered] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [worldProgress, setWorldProgress] = useState(0);
  const [worldLoading, setWorldLoading] = useState(false);
  const [worldError, setWorldError] = useState("");
  const [worldItem, setWorldItem] = useState("Открываю пространство");
  const enteredRef = useRef(false);
  const loadingFailedRef = useRef(false);
  const settleTimerRef = useRef<number | null>(null);
  const stallTimerRef = useRef<number | null>(null);

  const armInitialWorldTimeout = () => {
    if (stallTimerRef.current) window.clearTimeout(stallTimerRef.current);
    stallTimerRef.current = window.setTimeout(() => {
      if (!enteredRef.current) return;
      loadingFailedRef.current = true;
      setWorldLoading(false);
      setWorldError("Загрузка остановилась. Проверьте соединение и продолжите.");
    }, WORLD_LOAD_STALL_MS);
  };

  useEffect(() => {
    enteredRef.current = entered;
  }, [entered]);

  useEffect(() => {
    const manager = THREE.DefaultLoadingManager;
    const previousOnStart = manager.onStart;
    const previousOnProgress = manager.onProgress;
    const previousOnLoad = manager.onLoad;
    const previousOnError = manager.onError;

    const clearTimers = () => {
      if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
      if (stallTimerRef.current) window.clearTimeout(stallTimerRef.current);
    };

    const restartStallTimer = () => {
      if (stallTimerRef.current) window.clearTimeout(stallTimerRef.current);
      stallTimerRef.current = window.setTimeout(() => {
        if (!enteredRef.current) return;
        loadingFailedRef.current = true;
        setWorldLoading(false);
        setWorldError("Загрузка остановилась. Проверьте соединение и продолжите.");
      }, WORLD_LOAD_STALL_MS);
    };

    const updateProgress = (url: string, itemsLoaded: number, itemsTotal: number) => {
      if (!enteredRef.current) return;
      if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
      setWorldLoading(true);
      setWorldItem(formatWorldItem(url));
      const nextProgress = itemsTotal > 0 ? Math.round((itemsLoaded / itemsTotal) * 88) + 4 : 4;
      setWorldProgress((current) => Math.max(current, Math.min(92, nextProgress)));
      restartStallTimer();
    };

    manager.setURLModifier(assetUrl);
    manager.onStart = updateProgress;
    manager.onProgress = updateProgress;
    manager.onLoad = () => {
      if (!enteredRef.current || loadingFailedRef.current) return;
      if (stallTimerRef.current) window.clearTimeout(stallTimerRef.current);
      setWorldProgress((current) => Math.max(current, 96));
      setWorldItem("Завершаю проявление мира");
      settleTimerRef.current = window.setTimeout(() => {
        setWorldProgress(100);
        settleTimerRef.current = window.setTimeout(() => setWorldLoading(false), 450);
      }, WORLD_LOAD_SETTLE_MS);
    };
    manager.onError = () => {
      if (!enteredRef.current) return;
      clearTimers();
      loadingFailedRef.current = true;
      setWorldLoading(false);
      setWorldError("Не удалось загрузить часть мира. Уже полученные данные сохранены.");
    };

    return () => {
      clearTimers();
      manager.onStart = previousOnStart;
      manager.onProgress = previousOnProgress;
      manager.onLoad = previousOnLoad;
      manager.onError = previousOnError;
      manager.setURLModifier((url) => url);
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
    enteredRef.current = true;
    loadingFailedRef.current = false;
    setWorldProgress(0);
    setWorldError("");
    setWorldItem("Открываю пространство");
    setWorldLoading(true);
    armInitialWorldTimeout();
    setEntered(true);
    const telegram = window.Telegram?.WebApp;
    try { telegram?.expand(); } catch {}
    if (telegram?.isVersionAtLeast?.("8.0")) {
      try { telegram.requestFullscreen?.(); } catch {}
      try { telegram.lockOrientation?.(); } catch {}
    }
    try { telegram?.enableClosingConfirmation?.(); } catch {}
  };

  const continueLoading = () => {
    loadingFailedRef.current = false;
    setWorldProgress(0);
    setWorldError("");
    setWorldItem("Продолжаю сборку пространства");
    setWorldLoading(true);
    armInitialWorldTimeout();
    setLoadAttempt((attempt) => attempt + 1);
  };

  if (entered && user) {
    return (
      <div className="telegram-mini-app telegram-mini-app--entered">
        <MeshySceneConstructor key={"telegram-world-" + loadAttempt} plain telegram telegramUserId={user.id} />
        {(worldLoading || worldError) && (
          <section className={"telegram-world-loader " + (worldError ? "is-error" : "")} aria-live="polite">
            <div className="telegram-world-loader__content">
              <p className="dao-kicker">Сборка пространства</p>
              <strong>{worldError ? "Связь прервана" : worldProgress + "%"}</strong>
              <div
                aria-label="Загрузка мира"
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={worldProgress}
                className="telegram-world-loader__track"
                role="progressbar"
              >
                <span style={{ width: worldProgress + "%" }} />
              </div>
              <p>{worldError || worldItem}</p>
              {worldError && <button onClick={continueLoading} type="button">Продолжить загрузку</button>}
            </div>
          </section>
        )}
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

