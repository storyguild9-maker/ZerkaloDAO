"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import * as THREE from "three";
import {
  MeshySceneConstructor,
  type TelegramAvatarPose,
  type TelegramPresenceParticipant
} from "@/components/MeshySceneConstructor";
import { assetUrl } from "@/lib/assetUrl";
import type { TelegramAvatarGender } from "@/lib/telegramScene";

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
  delivery?: "sending" | "failed";
};

type ChatRoom = {
  id: string;
  name: string;
  joined: boolean;
  createdAt: string;
  expiresAt: string;
};

type ChatRoomEditorMode = "create" | "join";

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
const PRESENCE_HEARTBEAT_MS = 3000;
const CHAT_POLL_OPEN_MS = 2500;
const CHAT_POLL_CLOSED_MS = 9000;
const AVATAR_MOTION_TOPIC = "room:temple-main:avatar-motion";
const AVATAR_MOTION_EVENT = "avatar-pose";
const AVATAR_IDLE_KEYFRAME_MS = 2000;

type RealtimeAvatarPoseMessage = {
  participantId: string;
  sequence: number;
  sentAt: number;
  pose: TelegramAvatarPose;
};

const realtimeNetworkHz = (participantCount: number) => {
  const count = Math.max(1, participantCount);
  return Math.max(4, Math.min(20, Math.floor(80 / (count * count))));
};

const poseChanged = (previous: TelegramAvatarPose | null, next: TelegramAvatarPose) => {
  if (!previous || previous.animation !== next.animation) return true;
  if (Math.abs(previous.rotationY - next.rotationY) > 0.002) return true;
  return previous.position.some((value, index) => Math.abs(value - next.position[index]) > 0.003);
};

const parseRealtimePose = (value: unknown): RealtimeAvatarPoseMessage | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<RealtimeAvatarPoseMessage>;
  const pose = candidate.pose;
  if (
    typeof candidate.participantId !== "string"
    || !Number.isSafeInteger(candidate.sequence)
    || typeof candidate.sentAt !== "number"
    || !pose
    || !Array.isArray(pose.position)
    || pose.position.length !== 3
    || !pose.position.every(Number.isFinite)
    || !Number.isFinite(pose.rotationY)
    || typeof pose.animation !== "string"
  ) return null;
  return candidate as RealtimeAvatarPoseMessage;
};

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
  const [avatarGender, setAvatarGender] = useState<TelegramAvatarGender | null>(null);
  const [nicknameSaving, setNicknameSaving] = useState(false);
  const [presenceCount, setPresenceCount] = useState(0);
  const [participants, setParticipants] = useState<TelegramPresenceParticipant[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [activeChatRoomId, setActiveChatRoomId] = useState<string | null>(null);
  const [chatRoomEditorMode, setChatRoomEditorMode] = useState<ChatRoomEditorMode | null>(null);
  const [chatRoomNameDraft, setChatRoomNameDraft] = useState("");
  const [chatRoomTargetId, setChatRoomTargetId] = useState<string | null>(null);
  const [chatRoomPasswordDraft, setChatRoomPasswordDraft] = useState("");
  const [chatRoomSaving, setChatRoomSaving] = useState(false);
  const [chatRoomNotice, setChatRoomNotice] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chatUnread, setChatUnread] = useState(0);
  const [chatNewBelow, setChatNewBelow] = useState(0);
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
  const worldLoadOverlayArmedRef = useRef(false);
  const settleTimerRef = useRef<number | null>(null);
  const stallTimerRef = useRef<number | null>(null);
  const chatOpenRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatMessagesRef = useRef<HTMLDivElement | null>(null);
  const chatTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const chatShouldStickRef = useRef(true);
  const lastChatMessageIdRef = useRef("");
  const participantsRef = useRef<TelegramPresenceParticipant[]>([]);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const realtimeSubscribedRef = useRef(false);
  const realtimeSequenceRef = useRef(0);
  const realtimeRemoteSequenceRef = useRef(new Map<string, number>());
  const realtimeLastSentAtRef = useRef(0);
  const realtimeLastIdleKeyframeAtRef = useRef(0);
  const realtimeLastSentPoseRef = useRef<TelegramAvatarPose | null>(null);
  const sendRealtimePoseRef = useRef<(pose: TelegramAvatarPose) => void>(() => undefined);
  const latestAvatarPoseRef = useRef<TelegramAvatarPose>({
    position: [0, 0, 0],
    rotationY: 0,
    animation: "idle"
  });

  const armInitialWorldTimeout = () => {
    if (stallTimerRef.current) window.clearTimeout(stallTimerRef.current);
    stallTimerRef.current = window.setTimeout(() => {
      if (!enteredRef.current || !worldLoadOverlayArmedRef.current) return;
      worldLoadOverlayArmedRef.current = false;
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
    if (chatOpen) {
      setChatUnread(0);
      setChatNewBelow(0);
      chatShouldStickRef.current = true;
      window.requestAnimationFrame(() => {
        const messages = chatMessagesRef.current;
        messages?.scrollTo({ top: messages.scrollHeight });
      });
    }
  }, [chatOpen]);

  useEffect(() => {
    if (!chatOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (chatRoomEditorMode) setChatRoomEditorMode(null);
      else setChatOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [chatOpen, chatRoomEditorMode]);

  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  useEffect(() => {
    if (!entered || !session) return;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return;

    let cancelled = false;
    const client = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        persistSession: true
      }
    });

    const connect = async () => {
      const currentAuth = await client.auth.getSession();
      if (currentAuth.error) throw currentAuth.error;
      let authSession = currentAuth.data.session;
      if (!authSession) {
        const anonymousAuth = await client.auth.signInAnonymously();
        if (anonymousAuth.error) throw anonymousAuth.error;
        authSession = anonymousAuth.data.session;
      }
      if (!authSession) throw new Error("Realtime authentication failed");
      const authorizationResponse = await fetch("/api/telegram/realtime", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ supabaseAccessToken: authSession.access_token })
      });
      if (!authorizationResponse.ok) throw new Error("Realtime authorization failed");
      if (cancelled) return;

      const channel = client.channel(AVATAR_MOTION_TOPIC, {
        config: {
          private: true,
          broadcast: { ack: false, self: false }
        }
      });
      realtimeChannelRef.current = channel;
      channel
        .on("broadcast", { event: AVATAR_MOTION_EVENT }, ({ payload }) => {
          const message = parseRealtimePose(payload);
          if (!message || message.participantId === session.participantId) return;
          if (!participantsRef.current.some((participant) => participant.participantId === message.participantId)) return;
          const previousSequence = realtimeRemoteSequenceRef.current.get(message.participantId) ?? -1;
          if (message.sequence <= previousSequence) return;
          realtimeRemoteSequenceRef.current.set(message.participantId, message.sequence);
          setParticipants((current) => current.map((participant) => participant.participantId === message.participantId
            ? {
              ...participant,
              position: [...message.pose.position] as [number, number, number],
              rotationY: message.pose.rotationY,
              animation: message.pose.animation,
              lastSeenAt: new Date(message.sentAt).toISOString()
            }
            : participant));
        })
        .subscribe((channelStatus) => {
          realtimeSubscribedRef.current = channelStatus === "SUBSCRIBED";
        });

      sendRealtimePoseRef.current = (pose) => {
        if (!realtimeSubscribedRef.current || document.visibilityState !== "visible") return;
        const now = performance.now();
        const count = Math.max(1, participantsRef.current.length);
        const minimumInterval = 1000 / realtimeNetworkHz(count);
        if (now - realtimeLastSentAtRef.current < minimumInterval) return;

        const changed = poseChanged(realtimeLastSentPoseRef.current, pose);
        const moving = pose.animation !== "idle";
        if (!moving && !changed && now - realtimeLastIdleKeyframeAtRef.current < AVATAR_IDLE_KEYFRAME_MS) return;

        realtimeLastSentAtRef.current = now;
        if (!moving) realtimeLastIdleKeyframeAtRef.current = now;
        realtimeLastSentPoseRef.current = {
          position: [...pose.position] as [number, number, number],
          rotationY: pose.rotationY,
          animation: pose.animation
        };
        realtimeSequenceRef.current += 1;
        void channel.send({
          type: "broadcast",
          event: AVATAR_MOTION_EVENT,
          payload: {
            participantId: session.participantId,
            sequence: realtimeSequenceRef.current,
            sentAt: Date.now(),
            pose
          } satisfies RealtimeAvatarPoseMessage
        });
      };
    };

    void connect().catch(() => {
      realtimeSubscribedRef.current = false;
    });

    return () => {
      cancelled = true;
      realtimeSubscribedRef.current = false;
      sendRealtimePoseRef.current = () => undefined;
      const channel = realtimeChannelRef.current;
      realtimeChannelRef.current = null;
      if (channel) void client.removeChannel(channel);
    };
  }, [entered, session]);

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
        if (!enteredRef.current || !worldLoadOverlayArmedRef.current) return;
        worldLoadOverlayArmedRef.current = false;
        loadingFailedRef.current = true;
        setWorldLoading(false);
        setWorldError("Загрузка остановилась. Проверьте соединение и продолжите.");
      }, WORLD_LOAD_STALL_MS);
    };

    const updateProgress = (url: string, itemsLoaded: number, itemsTotal: number) => {
      if (!enteredRef.current || !worldLoadOverlayArmedRef.current) return;
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
      if (!enteredRef.current || !worldLoadOverlayArmedRef.current || loadingFailedRef.current) return;
      worldLoadOverlayArmedRef.current = false;
      if (stallTimerRef.current) window.clearTimeout(stallTimerRef.current);
      setWorldProgress((current) => Math.max(current, 96));
      setWorldItem("Завершаю проявление мира");
      settleTimerRef.current = window.setTimeout(() => {
        setWorldProgress(100);
        settleTimerRef.current = window.setTimeout(() => setWorldLoading(false), 450);
      }, WORLD_LOAD_SETTLE_MS);
    };
    manager.onError = () => {
      if (!enteredRef.current || !worldLoadOverlayArmedRef.current) return;
      clearTimers();
      worldLoadOverlayArmedRef.current = false;
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
        const heartbeatResponse = await fetch("/api/telegram/presence", {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${session.token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(latestAvatarPoseRef.current),
          cache: "no-store"
        });
        if (!heartbeatResponse.ok || cancelled) return;

        const presenceResponse = await fetch("/api/telegram/presence", {
          headers: { Authorization: `Bearer ${session.token}` },
          cache: "no-store"
        });
        if (!presenceResponse.ok || cancelled) return;
        const payload = await presenceResponse.json();
        if (!cancelled && payload.ok && Array.isArray(payload.participants)) {
          const nextParticipants = payload.participants as TelegramPresenceParticipant[];
          setParticipants(nextParticipants);
          setPresenceCount(nextParticipants.length);
        }
      } catch {
        // A later heartbeat will retry without interrupting the 3D scene.
      }
    };

    void heartbeat();
    const interval = window.setInterval(() => void heartbeat(), PRESENCE_HEARTBEAT_MS);
    const resumeHeartbeat = () => {
      if (document.visibilityState === "visible") void heartbeat();
    };
    document.addEventListener("visibilitychange", resumeHeartbeat);
    window.addEventListener("focus", resumeHeartbeat);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", resumeHeartbeat);
      window.removeEventListener("focus", resumeHeartbeat);
    };
  }, [entered, session]);

  useEffect(() => {
    if (!entered || !session) return;
    let cancelled = false;

    const loadRooms = async () => {
      try {
        const response = await fetch("/api/telegram/chat/rooms", {
          headers: { Authorization: `Bearer ${session.token}` },
          cache: "no-store"
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok || cancelled || !Array.isArray(payload.rooms)) return;
        const rooms = payload.rooms as ChatRoom[];
        setChatRooms(rooms);
        setActiveChatRoomId((current) => current && !rooms.some((room) => room.id === current && room.joined) ? null : current);
      } catch {
        if (!cancelled && chatOpenRef.current) setChatRoomNotice("Не удалось обновить список комнат");
      }
    };

    void loadRooms();
    const interval = window.setInterval(() => void loadRooms(), chatOpen ? 8000 : 20000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [chatOpen, entered, session]);
  useEffect(() => {
    lastChatMessageIdRef.current = "";
    chatShouldStickRef.current = true;
    setChatMessages([]);
    setChatNewBelow(0);
    setChatError("");
  }, [activeChatRoomId]);


  useEffect(() => {
    if (!entered || !session) return;
    let cancelled = false;

    const loadChat = async () => {
      try {
        const roomQuery = activeChatRoomId ? `?roomId=${encodeURIComponent(activeChatRoomId)}` : "";
        const response = await fetch(`/api/telegram/chat${roomQuery}`, {
          headers: { Authorization: `Bearer ${session.token}` },
          cache: "no-store"
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok || cancelled || !Array.isArray(payload.messages)) return;
        const messages = payload.messages as ChatMessage[];
        const latestId = messages.at(-1)?.id ?? "";
        const previousId = lastChatMessageIdRef.current;
        const previousIndex = previousId ? messages.findIndex((message) => message.id === previousId) : -1;
        const addedCount = previousId && latestId && latestId !== previousId
          ? Math.max(1, previousIndex >= 0 ? messages.length - previousIndex - 1 : 1)
          : 0;
        if (!chatOpenRef.current && addedCount > 0) {
          setChatUnread((current) => Math.min(99, current + addedCount));
        } else if (chatOpenRef.current && !chatShouldStickRef.current && addedCount > 0) {
          setChatNewBelow((current) => Math.min(99, current + addedCount));
        }
        lastChatMessageIdRef.current = latestId;
        setChatMessages((current) => {
          const transient = current.filter((message) => message.delivery && !messages.some((saved) => (
            saved.mine
            && saved.body === message.body
            && Math.abs(Date.parse(saved.createdAt) - Date.parse(message.createdAt)) < 30_000
          )));
          return [...messages, ...transient];
        });
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
  }, [activeChatRoomId, chatOpen, entered, session]);

  useEffect(() => {
    if (!chatOpen || !chatShouldStickRef.current) return;
    window.requestAnimationFrame(() => {
      chatEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    });
  }, [chatMessages, chatOpen]);

  useEffect(() => {
    const textarea = chatTextareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 112)}px`;
  }, [chatDraft]);

  const saveEntryProfile = async () => {
    if (!session) return false;
    if (!avatarGender) {
      setError("Выберите облик аватара");
      return false;
    }
    const nickname = nicknameDraft.trim();

    setNicknameSaving(true);
    setError("");
    try {
      const response = await fetch("/api/telegram/presence", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ nickname, avatarGender }),
        cache: "no-store"
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Не удалось сохранить ник");
      setSession((current) => current ? {
        ...current,
        nickname: payload.presence.nickname,
        avatarId: payload.presence.avatarId
      } : current);
      setNicknameDraft(payload.presence.nickname);
      setStatus("Аватар готов к входу");
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
    if (!session || !(await saveEntryProfile())) return;
    enteredRef.current = true;
    loadingFailedRef.current = false;
    worldLoadOverlayArmedRef.current = true;
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
    worldLoadOverlayArmedRef.current = true;
    setWorldProgress(0);
    setWorldError("");
    setWorldItem("Продолжаю сборку пространства");
    setWorldLoading(true);
    armInitialWorldTimeout();
    setLoadAttempt((attempt) => attempt + 1);
  };

  const scrollChatToBottom = (behavior: ScrollBehavior = "smooth") => {
    chatShouldStickRef.current = true;
    setChatNewBelow(0);
    window.requestAnimationFrame(() => {
      const messages = chatMessagesRef.current;
      messages?.scrollTo({ top: messages.scrollHeight, behavior });
    });
  };

  const postChatMessage = async (body: string, temporaryId: string) => {
    if (!session || chatSending) return;
    setChatSending(true);
    setChatError("");
    try {
      const response = await fetch("/api/telegram/chat", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message: body, roomId: activeChatRoomId }),
        cache: "no-store"
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Не удалось отправить сообщение");
      const message = payload.message as ChatMessage;
      lastChatMessageIdRef.current = message.id;
      setChatMessages((current) => {
        const withoutTemporary = current.filter((item) => item.id !== temporaryId);
        return withoutTemporary.some((item) => item.id === message.id) ? withoutTemporary : [...withoutTemporary, message];
      });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Не удалось отправить сообщение";
      setChatMessages((current) => current.map((item) => item.id === temporaryId ? { ...item, delivery: "failed" } : item));
      setChatError(message);
    } finally {
      setChatSending(false);
    }
  };

  const sendChatMessage = async (event: FormEvent) => {
    event.preventDefault();
    const body = chatDraft.trim();
    if (!session || chatSending || !body) return;
    const temporaryId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    chatShouldStickRef.current = true;
    setChatMessages((current) => [...current, {
      id: temporaryId,
      nickname: session.nickname,
      body,
      createdAt: new Date().toISOString(),
      mine: true,
      delivery: "sending"
    }]);
    setChatDraft("");
    await postChatMessage(body, temporaryId);
  };

  const sendQuickChatMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!chatDraft.trim() || chatSending) return;
    setChatOpen(true);
    await sendChatMessage(event);
  };

  const retryChatMessage = async (message: ChatMessage) => {
    if (chatSending || message.delivery !== "failed") return;
    setChatMessages((current) => current.map((item) => item.id === message.id ? { ...item, delivery: "sending" } : item));
    chatShouldStickRef.current = true;
    await postChatMessage(message.body, message.id);
  };

  const selectChatRoom = (roomId: string | null) => {
    setActiveChatRoomId(roomId);
    setChatRoomEditorMode(null);
    setChatRoomNotice("");
  };

  const openChatRoomEditor = (mode: ChatRoomEditorMode) => {
    setChatRoomEditorMode(mode);
    setChatRoomNotice("");
    setChatRoomPasswordDraft("");
    setChatRoomTargetId(null);
  };

  const submitChatRoom = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || !chatRoomEditorMode || chatRoomSaving) return;
    setChatRoomSaving(true);
    setChatRoomNotice("");
    try {
      const response = await fetch("/api/telegram/chat/rooms", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(chatRoomEditorMode === "create"
          ? { action: "create", name: chatRoomNameDraft, password: chatRoomPasswordDraft }
          : { action: "join", roomId: chatRoomTargetId, password: chatRoomPasswordDraft }),
        cache: "no-store"
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Не удалось открыть комнату");
      const room = payload.room as ChatRoom;
      setChatRooms((current) => current.some((item) => item.id === room.id)
        ? current.map((item) => item.id === room.id ? room : item)
        : [...current, room]);
      setChatRoomNameDraft("");
      setChatRoomTargetId(null);
      setChatRoomPasswordDraft("");
      setChatRoomEditorMode(null);
      setChatRoomNotice(chatRoomEditorMode === "create" ? "Диалог создан" : "Вход выполнен");
      setActiveChatRoomId(room.id);
    } catch (reason) {
      setChatRoomNotice(reason instanceof Error ? reason.message : "Не удалось открыть комнату");
    } finally {
      setChatRoomSaving(false);
    }
  };


  const activeChatRoom = activeChatRoomId
    ? chatRooms.find((room) => room.id === activeChatRoomId) ?? null
    : null;
  const joinedChatRooms = chatRooms.filter((room) => room.joined);
  const availableChatRooms = chatRooms.filter((room) => !room.joined);
  const targetChatRoom = chatRoomTargetId
    ? availableChatRooms.find((room) => room.id === chatRoomTargetId) ?? null
    : null;


  if (entered && session) {
    return (
      <div className="telegram-mini-app telegram-mini-app--entered">
        <MeshySceneConstructor
          key={"telegram-world-" + loadAttempt}
          onTelegramPose={(pose) => {
            latestAvatarPoseRef.current = pose;
            sendRealtimePoseRef.current(pose);
          }}
          plain
          telegram
          telegramAvatarId={session.avatarId}
          telegramParticipantId={session.participantId}
          telegramParticipantNickname={session.nickname}
          telegramSessionToken={session.token}
          telegramParticipants={participants}
        />
        {!chatOpen ? (
          <form className="telegram-quick-chat" onSubmit={(event) => void sendQuickChatMessage(event)}>
            <input
              aria-label="Быстрое сообщение"
              autoComplete="off"
              maxLength={500}
              onChange={(event) => setChatDraft(event.target.value)}
              placeholder={activeChatRoom ? `Сообщение в «${activeChatRoom.name}»` : "Сообщение в чат"}
              value={chatDraft}
            />
            <button disabled={chatSending || !chatDraft.trim()} type="submit">Отправить</button>
          </form>
        ) : null}
        <div className="telegram-presence-badge" aria-live="polite">
          <strong>{session.nickname}</strong>
          <span>В храме: {Math.max(1, presenceCount)}</span>
          {participants.some((participant) => participant.participantId !== session.participantId) ? (
            <small>
              Рядом: {participants
                .filter((participant) => participant.participantId !== session.participantId)
                .slice(0, 3)
                .map((participant) => participant.nickname)
                .join(", ")}
            </small>
          ) : null}
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
              <button aria-label="Свернуть чат" onClick={() => setChatOpen(false)} title="Свернуть чат" type="button">←</button>
              <div>
                <p className="dao-kicker">Пространство</p>
                <h2>{activeChatRoom?.name ?? "Стена чата"}</h2>
                <span>{activeChatRoom ? "Закрытый диалог" : `Сейчас в храме: ${Math.max(1, presenceCount)}`}</span>
              </div>
            </header>
            <div className="telegram-chat-room-switcher">
              <nav aria-label="Диалоги" className="telegram-chat-rooms">
                <button
                  className={!activeChatRoomId ? "is-active" : ""}
                  onClick={() => selectChatRoom(null)}
                  type="button"
                >
                  Стена
                </button>
                {joinedChatRooms.map((room) => (
                  <button
                    className={activeChatRoomId === room.id ? "is-active" : ""}
                    key={room.id}
                    onClick={() => selectChatRoom(room.id)}
                    title={room.name}
                    type="button"
                  >
                    {room.name}
                  </button>
                ))}
                <button
                  aria-label="Создать или открыть закрытый диалог"
                  className="telegram-chat-rooms__add"
                  onClick={() => {
                    if (chatRoomEditorMode) setChatRoomEditorMode(null);
                    else openChatRoomEditor("join");
                  }}
                  title="Список диалогов"
                  type="button"
                >
                  ≡
                </button>
              </nav>
              {activeChatRoom ? (
                <div className="telegram-chat-room-meta">
                  <span>Закрытый диалог · доступ подтверждён</span>
                </div>
              ) : null}
              {chatRoomEditorMode ? (
                <form className="telegram-chat-room-form" onSubmit={(event) => void submitChatRoom(event)}>
                  <div aria-label="Действие с комнатой" className="telegram-chat-room-form__modes">
                    <button
                      className={chatRoomEditorMode === "create" ? "is-active" : ""}
                      onClick={() => openChatRoomEditor("create")}
                      type="button"
                    >
                      Создать
                    </button>
                    <button
                      className={chatRoomEditorMode === "join" ? "is-active" : ""}
                      onClick={() => openChatRoomEditor("join")}
                      type="button"
                    >
                      Список
                    </button>
                  </div>
                  {chatRoomEditorMode === "create" ? (
                    <label>
                      <span>Название</span>
                      <input
                        autoComplete="off"
                        maxLength={32}
                        onChange={(event) => setChatRoomNameDraft(event.target.value)}
                        placeholder="Например, Совет"
                        required
                        value={chatRoomNameDraft}
                      />
                    </label>
                  ) : (
                    <div className="telegram-chat-room-directory">
                      <p>Доступные диалоги</p>
                      {availableChatRooms.length > 0 ? (
                        <div className="telegram-chat-room-directory__list">
                          {availableChatRooms.map((room) => (
                            <button
                              className={chatRoomTargetId === room.id ? "is-active" : ""}
                              key={room.id}
                              onClick={() => setChatRoomTargetId(room.id)}
                              type="button"
                            >
                              <span>{room.name}</span>
                              <small>По паролю</small>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="telegram-chat-room-directory__empty">Новых диалогов пока нет</span>
                      )}
                      {targetChatRoom ? <small>Выбран: {targetChatRoom.name}</small> : null}
                    </div>
                  )}
                  <label>
                    <span>Пароль</span>
                    <input
                      autoComplete="new-password"
                      maxLength={72}
                      minLength={6}
                      onChange={(event) => setChatRoomPasswordDraft(event.target.value)}
                      placeholder="Не менее 6 символов"
                      type="password"
                      required
                      value={chatRoomPasswordDraft}
                    />
                  </label>
                  <button disabled={chatRoomSaving || (chatRoomEditorMode === "join" && !targetChatRoom)} type="submit">
                    {chatRoomSaving ? "..." : chatRoomEditorMode === "create" ? "Создать комнату" : "Войти в диалог"}
                  </button>
                </form>
              ) : null}
              {chatRoomNotice ? <p className="telegram-chat-room-notice" role="status">{chatRoomNotice}</p> : null}
            </div>
            <div className="telegram-chat-history">
              <div
                aria-live="polite"
                className="telegram-chat-messages"
                onScroll={(event) => {
                  const element = event.currentTarget;
                  const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 64;
                  chatShouldStickRef.current = atBottom;
                  if (atBottom) setChatNewBelow(0);
                }}
                ref={chatMessagesRef}
                role="log"
              >
                {chatMessages.length === 0 ? (
                  <p className="telegram-chat-empty">Здесь пока тихо. Начните разговор.</p>
                ) : chatMessages.map((message) => (
                  <article
                    className={`${message.mine ? "is-mine" : ""}${message.delivery ? ` is-${message.delivery}` : ""}`}
                    key={message.id}
                  >
                    <div>
                      <strong>{message.nickname}</strong>
                      <time dateTime={message.createdAt}>
                        {message.delivery === "sending"
                          ? "отправка"
                          : new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(message.createdAt))}
                      </time>
                    </div>
                    <p>{message.body}</p>
                    {message.delivery === "failed" ? (
                      <button onClick={() => void retryChatMessage(message)} type="button">Повторить отправку</button>
                    ) : null}
                  </article>
                ))}
                <div ref={chatEndRef} />
              </div>
              {chatNewBelow > 0 ? (
                <button className="telegram-chat-new" onClick={() => scrollChatToBottom()} type="button">
                  Новые сообщения · {chatNewBelow} ↓
                </button>
              ) : null}
            </div>
            <form className="telegram-chat-compose" onSubmit={(event) => void sendChatMessage(event)}>
              <label>
                <span className="sr-only">Сообщение</span>
                <textarea
                  aria-label="Сообщение"
                  maxLength={500}
                  onChange={(event) => setChatDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter"
                      && !event.shiftKey
                      && !event.nativeEvent.isComposing
                      && window.matchMedia("(pointer: fine)").matches
                    ) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder={`Сообщение от ${session.nickname}`}
                  ref={chatTextareaRef}
                  rows={1}
                  value={chatDraft}
                />
              </label>
              <button disabled={chatSending || !chatDraft.trim()} type="submit">
                {chatSending ? "..." : "Отправить"}
              </button>
              <p role="status">{chatError || "Анонимно: профиль Telegram скрыт"}</p>
              <span className={chatDraft.length > 420 ? "is-visible" : ""}>{chatDraft.length}/500</span>
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
          <div className="telegram-entry__profile">
            <fieldset className="telegram-avatar-gender">
              <legend>Выберите облик</legend>
              <div>
                <label className={avatarGender === "male" ? "is-selected" : ""}>
                  <input
                    checked={avatarGender === "male"}
                    name="avatar-gender"
                    onChange={() => setAvatarGender("male")}
                    type="radio"
                    value="male"
                  />
                  <span aria-hidden="true">М</span>
                  <strong>Мужской</strong>
                </label>
                <label className={avatarGender === "female" ? "is-selected" : ""}>
                  <input
                    checked={avatarGender === "female"}
                    name="avatar-gender"
                    onChange={() => setAvatarGender("female")}
                    type="radio"
                    value="female"
                  />
                  <span aria-hidden="true">Ж</span>
                  <strong>Женский</strong>
                </label>
              </div>
            </fieldset>
            <label className="telegram-nickname">
              <span>Ник на эту сессию</span>
              <input
                autoComplete="off"
                maxLength={24}
                onChange={(event) => setNicknameDraft(event.target.value)}
                value={nicknameDraft}
              />
            </label>
          </div>
        ) : null}
        <p className="telegram-entry__status" role="status">{error || status}</p>
        <button disabled={!session || !avatarGender || nicknameSaving} type="submit">
          {session ? (nicknameSaving ? "Подготавливаю аватара..." : "Войти в храм") : "Ожидание Telegram"}
        </button>
      </form>
    </section>
  );
}
