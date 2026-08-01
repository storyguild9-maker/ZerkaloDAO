"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { MeshySceneConstructor } from "@/components/MeshySceneConstructor";
import { assetUrl } from "@/lib/assetUrl";

type PrivateTelegramSession = {
  participantId: string;
  token: string;
  nickname: string;
  avatarId: string;
  expiresAt: string;
};

type ChatMessage = {
  id: string;
  nickname: string;
  body: string;
  createdAt: string;
  mine: boolean;
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
const PRESENCE_HEARTBEAT_MS = 30000;
const CHAT_POLL_OPEN_MS = 2500;
const CHAT_POLL_CLOSED_MS = 9000;

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
  const [session, setSession] = useState<PrivateTelegramSession | null>(null);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [nicknameSaving, setNicknameSaving] = useState(false);
  const [presenceCount, setPresenceCount] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chatUnread, setChatUnread] = useState(0);
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
  const chatOpenRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const lastChatMessageIdRef = useRef("");

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
    chatOpenRef.current = chatOpen;
    if (chatOpen) setChatUnread(0);
  }, [chatOpen]);

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
    const controller = new AbortController();
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
      return () => controller.abort();
    }

    void fetch("/api/telegram/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
      cache: "no-store",
      signal: controller.signal
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error || "Вход не подтверждён");
        const nextSession = payload.session as PrivateTelegramSession;
        setSession(nextSession);
        setNicknameDraft(nextSession.nickname);
        setStatus("Приватная сессия создана");
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        setStatus("");
        setError(reason instanceof Error ? reason.message : "Не удалось войти");
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!entered || !session) return;
    let cancelled = false;

    const heartbeat = async () => {
      try {
        const [heartbeatResponse, presenceResponse] = await Promise.all([
          fetch("/api/telegram/presence", {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${session.token}`,
              "Content-Type": "application/json"
            },
            body: "{}",
            cache: "no-store"
          }),
          fetch("/api/telegram/presence", {
            headers: { Authorization: `Bearer ${session.token}` },
            cache: "no-store"
          })
        ]);
        if (!heartbeatResponse.ok || !presenceResponse.ok || cancelled) return;
        const payload = await presenceResponse.json();
        if (!cancelled && payload.ok && Array.isArray(payload.participants)) {
          setPresenceCount(payload.participants.length);
        }
      } catch {
        // A later heartbeat will retry without interrupting the 3D scene.
      }
    };

    void heartbeat();
    const interval = window.setInterval(() => void heartbeat(), PRESENCE_HEARTBEAT_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [entered, session]);

  useEffect(() => {
    if (!entered || !session) return;
    let cancelled = false;

    const loadChat = async () => {
      try {
        const response = await fetch("/api/telegram/chat", {
          headers: { Authorization: `Bearer ${session.token}` },
          cache: "no-store"
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok || cancelled || !Array.isArray(payload.messages)) return;
        const messages = payload.messages as ChatMessage[];
        const latestId = messages.at(-1)?.id ?? "";
        const previousId = lastChatMessageIdRef.current;
        if (!chatOpenRef.current && previousId && latestId && latestId !== previousId) {
          const previousIndex = messages.findIndex((message) => message.id === previousId);
          setChatUnread((current) => Math.min(99, current + (previousIndex >= 0 ? messages.length - previousIndex - 1 : 1)));
        }
        lastChatMessageIdRef.current = latestId;
        setChatMessages(messages);
        setChatError("");
      } catch {
        if (!cancelled && chatOpenRef.current) setChatError("Не удалось обновить сообщения");
      }
    };

    void loadChat();
    const interval = window.setInterval(() => void loadChat(), chatOpen ? CHAT_POLL_OPEN_MS : CHAT_POLL_CLOSED_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [chatOpen, entered, session]);

  useEffect(() => {
    if (!chatOpen) return;
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [chatMessages, chatOpen]);

  const saveNickname = async () => {
    if (!session) return false;
    const nickname = nicknameDraft.trim();
    if (nickname === session.nickname) return true;

    setNicknameSaving(true);
    setError("");
    try {
      const response = await fetch("/api/telegram/presence", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ nickname }),
        cache: "no-store"
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Не удалось сохранить ник");
      setSession((current) => current ? { ...current, nickname: payload.presence.nickname } : current);
      setNicknameDraft(payload.presence.nickname);
      setStatus("Ник сохранён для этой сессии");
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить ник");
      return false;
    } finally {
      setNicknameSaving(false);
    }
  };

  const enterTemple = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!session || !(await saveNickname())) return;
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

  const sendChatMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || chatSending || !chatDraft.trim()) return;
    setChatSending(true);
    setChatError("");
    try {
      const response = await fetch("/api/telegram/chat", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message: chatDraft }),
        cache: "no-store"
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Не удалось отправить сообщение");
      const message = payload.message as ChatMessage;
      lastChatMessageIdRef.current = message.id;
      setChatMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      setChatDraft("");
    } catch (reason) {
      setChatError(reason instanceof Error ? reason.message : "Не удалось отправить сообщение");
    } finally {
      setChatSending(false);
    }
  };

  if (entered && session) {
    return (
      <div className="telegram-mini-app telegram-mini-app--entered">
        <MeshySceneConstructor
          key={"telegram-world-" + loadAttempt}
          plain
          telegram
          telegramAvatarId={session.avatarId}
        />
        <div className="telegram-presence-badge" aria-live="polite">
          <strong>{session.nickname}</strong>
          <span>В храме: {Math.max(1, presenceCount)}</span>
        </div>
        <button
          aria-expanded={chatOpen}
          className="telegram-chat-toggle"
          onClick={() => setChatOpen(true)}
          type="button"
        >
          Чат{chatUnread > 0 ? <span>{chatUnread}</span> : null}
        </button>
        {chatOpen ? (
          <aside aria-label="Чат пространства" className="telegram-chat-panel">
            <header className="telegram-chat-panel__header">
              <div>
                <p className="dao-kicker">Пространство</p>
                <h2>Внутренний чат</h2>
              </div>
              <button aria-label="Закрыть чат" onClick={() => setChatOpen(false)} title="Закрыть" type="button">×</button>
            </header>
            <div aria-live="polite" className="telegram-chat-messages" role="log">
              {chatMessages.length === 0 ? (
                <p className="telegram-chat-empty">Здесь пока тихо. Начните разговор.</p>
              ) : chatMessages.map((message) => (
                <article className={message.mine ? "is-mine" : ""} key={message.id}>
                  <div>
                    <strong>{message.nickname}</strong>
                    <time dateTime={message.createdAt}>
                      {new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(message.createdAt))}
                    </time>
                  </div>
                  <p>{message.body}</p>
                </article>
              ))}
              <div ref={chatEndRef} />
            </div>
            <form className="telegram-chat-compose" onSubmit={(event) => void sendChatMessage(event)}>
              <label>
                <span className="sr-only">Сообщение</span>
                <textarea
                  aria-label="Сообщение"
                  maxLength={500}
                  onChange={(event) => setChatDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="Написать от имени временного ника"
                  rows={2}
                  value={chatDraft}
                />
              </label>
              <button disabled={chatSending || !chatDraft.trim()} type="submit">
                {chatSending ? "..." : "Отправить"}
              </button>
              <p role="status">{chatError || "Профили Telegram участникам не показываются"}</p>
            </form>
          </aside>
        ) : null}
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
      <form className="telegram-entry__content" onSubmit={(event) => void enterTemple(event)}>
        <p className="dao-kicker">Зеркало Дао</p>
        <h1>{session ? `Добро пожаловать, ${session.nickname}` : "Вход в пространство"}</h1>
        {session ? (
          <label className="telegram-nickname">
            <span>Ник на эту сессию</span>
            <input
              autoComplete="off"
              maxLength={24}
              onChange={(event) => setNicknameDraft(event.target.value)}
              value={nicknameDraft}
            />
          </label>
        ) : null}
        <p className="telegram-entry__status" role="status">{error || status}</p>
        <button disabled={!session || nicknameSaving} type="submit">
          {session ? (nicknameSaving ? "Сохраняю..." : "Войти в храм") : "Ожидание Telegram"}
        </button>
      </form>
    </section>
  );
}
