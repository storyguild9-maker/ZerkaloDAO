"use client";

import { CSSProperties, useEffect, useMemo, useState } from "react";
import {
  HOME_ARTIFACT_EVENT,
  HOME_ARTIFACT_STORAGE_KEY,
  HomeArtifactInstance,
  findHomeArtifact,
  parseHomeArtifacts
} from "@/lib/homeArtifacts";

type HomeArtifactLayerProps = {
  className?: string;
  interactive?: boolean;
  items?: HomeArtifactInstance[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onMove?: (id: string, x: number, y: number) => void;
};

export function HomeArtifactLayer({
  className,
  interactive = false,
  items,
  selectedId,
  onSelect,
  onMove
}: HomeArtifactLayerProps) {
  const [storedItems, setStoredItems] = useState<HomeArtifactInstance[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    if (items) {
      return;
    }

    const readItems = () => {
      setStoredItems(parseHomeArtifacts(window.localStorage.getItem(HOME_ARTIFACT_STORAGE_KEY)));
    };

    readItems();
    window.addEventListener("storage", readItems);
    window.addEventListener(HOME_ARTIFACT_EVENT, readItems);

    return () => {
      window.removeEventListener("storage", readItems);
      window.removeEventListener(HOME_ARTIFACT_EVENT, readItems);
    };
  }, [items]);

  const visibleItems = useMemo(() => {
    return (items ?? storedItems).filter((item) => item.visible);
  }, [items, storedItems]);

  return (
    <div className={`home-artifact-layer ${interactive ? "home-artifact-layer--interactive" : ""} ${className ?? ""}`}>
      {visibleItems.map((item) => {
        const artifact = findHomeArtifact(item.artifactId);
        if (!artifact) {
          return null;
        }

        const glow = Math.round(item.glow * 100);
        const style = {
          "--artifact-x": `${item.x}%`,
          "--artifact-y": `${item.y}%`,
          "--artifact-width": `${item.width}vw`,
          "--artifact-opacity": item.opacity,
          "--artifact-rotation": `${item.rotation}deg`,
          "--artifact-blur": `${item.blur}px`,
          "--artifact-brightness": item.brightness,
          "--artifact-glow": `${glow}px`,
          zIndex: item.zIndex,
          mixBlendMode: item.blendMode
        } as CSSProperties;

        return (
          <button
            aria-label={artifact.title}
            className={`home-artifact ${selectedId === item.id ? "is-selected" : ""}`}
            data-artifact={artifact.id}
            key={item.id}
            onClick={() => onSelect?.(item.id)}
            onPointerDown={(event) => {
              if (!interactive || !onMove) {
                return;
              }

              event.currentTarget.setPointerCapture(event.pointerId);
              setDraggingId(item.id);
              onSelect?.(item.id);
            }}
            onPointerMove={(event) => {
              if (!interactive || draggingId !== item.id || !onMove) {
                return;
              }

              const parent = event.currentTarget.parentElement;
              if (!parent) {
                return;
              }

              const rect = parent.getBoundingClientRect();
              const x = ((event.clientX - rect.left) / rect.width) * 100;
              const y = ((event.clientY - rect.top) / rect.height) * 100;
              onMove(item.id, Math.min(100, Math.max(0, x)), Math.min(100, Math.max(0, y)));
            }}
            onPointerUp={(event) => {
              if (interactive) {
                event.currentTarget.releasePointerCapture(event.pointerId);
                setDraggingId(null);
              }
            }}
            style={style}
            tabIndex={interactive ? 0 : -1}
            aria-hidden={!interactive}
            type="button"
          >
            <img alt="" draggable={false} src={artifact.src} />
          </button>
        );
      })}
    </div>
  );
}


