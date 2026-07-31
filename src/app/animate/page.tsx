import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { InitiateAnimationPreview } from "@/components/InitiateAnimationPreview";

type MotionSlot = {
  id: string;
  label: string;
  actionId?: number;
  actionName?: string;
};

type MotionTask = MotionSlot & {
  status?: string;
  progress?: number | null;
  taskId?: string;
  localModel?: string;
};

type AvatarRecord = {
  id: string;
  baseId: string;
  title: string;
  gender: string;
  direction: string;
  role: string;
  variant: string;
  sourceImage: string;
  motions: MotionSlot[];
  status?: string;
  progress?: number | null;
  taskId?: string;
  localModel?: string;
  rigStatus?: string;
  riggedModel?: string;
  basicAnimations?: Record<string, string>;
  animationTasks?: Record<string, MotionTask>;
};

type AvatarManifest = {
  updatedAt: string | null;
  avatars: AvatarRecord[];
};

const manifestPath = path.join(process.cwd(), "public", "models", "initiates", "manifest.json");

function readManifest(): AvatarManifest {
  if (!fs.existsSync(manifestPath)) return { updatedAt: null, avatars: [] };
  const text = fs.readFileSync(manifestPath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(text);
}

function statusLabel(status?: string) {
  const value = String(status || "planned").toLowerCase();
  if (["succeeded", "success", "finished", "completed"].includes(value)) return "готово";
  if (["created", "pending", "in_progress", "processing"].includes(value)) return "идет";
  if (["failed", "failure", "canceled", "cancelled", "error"].includes(value)) return "ошибка";
  return "план";
}

function doneMotionCount(avatar: AvatarRecord) {
  return Object.values(avatar.animationTasks || {}).filter((task) => task.localModel).length;
}

export default function AnimatePage() {
  const manifest = readManifest();
  const avatars = manifest.avatars;
  const modelCount = avatars.filter((avatar) => avatar.localModel).length;
  const riggedCount = avatars.filter((avatar) => avatar.riggedModel).length;
  const basicWalkCount = avatars.filter((avatar) => avatar.basicAnimations?.walking).length;
  const actionCount = avatars.reduce((sum, avatar) => sum + doneMotionCount(avatar), 0);

  return (
    <section className="animate-page">
      <header className="animate-page__topbar">
        <div>
          <p className="dao-kicker">Аватары / оживить</p>
          <h1>Оживить посвященных</h1>
        </div>
        <nav aria-label="Навигация оживления">
          <Link href="/initiates">Посвященные</Link>
          <Link href="/assembled-room">Комната</Link>
          <Link href="/inner">Конструктор</Link>
        </nav>
      </header>

      <div className="animate-page__summary animate-page__summary--wide">
        <article>
          <span>{modelCount}/{avatars.length}</span>
          <p>3D модели</p>
        </article>
        <article>
          <span>{riggedCount}/{avatars.length}</span>
          <p>скелеты</p>
        </article>
        <article>
          <span>{basicWalkCount}/{avatars.length}</span>
          <p>базовая походка</p>
        </article>
        <article>
          <span>{actionCount}</span>
          <p>action-анимаций</p>
        </article>
      </div>

      {avatars.length ? <InitiateAnimationPreview avatars={avatars} /> : null}

      <div className="animate-page__grid">
        {avatars.map((avatar) => {
          const motionCount = doneMotionCount(avatar);
          return (
            <article className="animate-avatar" key={avatar.id}>
              <div className="animate-avatar__preview">
                <img alt={avatar.title} src={avatar.sourceImage} />
              </div>
              <div className="animate-avatar__body">
                <p className="dao-kicker">{avatar.direction} / {avatar.gender}</p>
                <h2>{avatar.title}</h2>
                <div className="animate-avatar__meta">
                  <span data-status={statusLabel(avatar.status)}>3D {statusLabel(avatar.status)}</span>
                  <span data-status={statusLabel(avatar.rigStatus)}>скелет {statusLabel(avatar.rigStatus)}</span>
                  {avatar.localModel ? <span>GLB</span> : null}
                  {avatar.riggedModel ? <span>rigged</span> : null}
                  <span>{motionCount} движ.</span>
                </div>
                <div className="animate-avatar__motions">
                  {avatar.motions.map((motion) => {
                    const task = avatar.animationTasks?.[motion.id];
                    return (
                      <span data-ready={task?.localModel ? "true" : "false"} key={motion.id}>
                        {motion.label}
                      </span>
                    );
                  })}
                </div>
                <small>{avatar.riggedModel || avatar.localModel || avatar.taskId || "ожидает отправки в Meshy"}</small>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
