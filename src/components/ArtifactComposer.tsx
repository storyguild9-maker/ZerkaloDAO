"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { HomeArtifactLayer } from "@/components/HomeArtifactLayer";
import {
  DEFAULT_HOME_ARTIFACT,
  HOME_ARTIFACT_EVENT,
  HOME_ARTIFACT_STORAGE_KEY,
  HOME_ARTIFACTS,
  HomeArtifactInstance,
  findHomeArtifact,
  parseHomeArtifacts
} from "@/lib/homeArtifacts";

const starterItems: HomeArtifactInstance[] = [
  {
    ...DEFAULT_HOME_ARTIFACT,
    id: "starter-mirror",
    artifactId: "mirror",
    x: 21,
    y: 66,
    width: 18,
    opacity: 0.48,
    zIndex: 4
  },
  {
    ...DEFAULT_HOME_ARTIFACT,
    id: "starter-bowl",
    artifactId: "bowl",
    x: 54,
    y: 74,
    width: 17,
    opacity: 0.54,
    glow: 0.26,
    zIndex: 5
  },
  {
    ...DEFAULT_HOME_ARTIFACT,
    id: "starter-lantern",
    artifactId: "lantern",
    x: 81,
    y: 72,
    width: 12,
    opacity: 0.62,
    glow: 0.34,
    zIndex: 6
  }
];

export function ArtifactComposer() {
  const [items, setItems] = useState<HomeArtifactInstance[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelsHidden, setPanelsHidden] = useState(false);

  useEffect(() => {
    const storedItems = parseHomeArtifacts(window.localStorage.getItem(HOME_ARTIFACT_STORAGE_KEY));
    setItems(storedItems);
    setSelectedId(storedItems[0]?.id ?? null);
  }, []);

  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);
  const selectedArtifact = selected ? findHomeArtifact(selected.artifactId) : null;

  const saveItems = (nextItems = items) => {
    window.localStorage.setItem(HOME_ARTIFACT_STORAGE_KEY, JSON.stringify(nextItems));
    window.dispatchEvent(new Event(HOME_ARTIFACT_EVENT));
  };

  const updateSelected = (patch: Partial<HomeArtifactInstance>) => {
    if (!selectedId) {
      return;
    }

    setItems((currentItems) => currentItems.map((item) => (item.id === selectedId ? { ...item, ...patch } : item)));
  };

  const addArtifact = (artifactId: string) => {
    const artifactIndex = items.filter((item) => item.artifactId === artifactId).length;
    const nextItem: HomeArtifactInstance = {
      ...DEFAULT_HOME_ARTIFACT,
      id: `${artifactId}-${Date.now()}`,
      artifactId,
      x: 24 + ((items.length * 13) % 52),
      y: 62 + ((artifactIndex * 7) % 18),
      width: artifactId === "lantern" ? 11 : artifactId === "gate" ? 16 : 18,
      opacity: artifactId === "scroll" ? 0.5 : DEFAULT_HOME_ARTIFACT.opacity,
      zIndex: Math.min(20, 4 + items.length)
    };

    setItems((currentItems) => [...currentItems, nextItem]);
    setSelectedId(nextItem.id);
    setPanelsHidden(false);
  };

  const removeSelected = () => {
    if (!selectedId) {
      return;
    }

    setItems((currentItems) => {
      const nextItems = currentItems.filter((item) => item.id !== selectedId);
      setSelectedId(nextItems[0]?.id ?? null);
      return nextItems;
    });
  };

  const loadStarter = () => {
    setItems(starterItems);
    setSelectedId(starterItems[0].id);
    setPanelsHidden(false);
  };

  const clearItems = () => {
    setItems([]);
    setSelectedId(null);
  };

  return (
    <section className={`artifact-composer ${panelsHidden ? "is-clean" : ""}`} aria-label="Конструктор основного экрана">
      <HomeArtifactLayer
        className="artifact-composer__workspace"
        interactive
        items={items}
        onMove={(id, x, y) => {
          setItems((currentItems) => currentItems.map((item) => (item.id === id ? { ...item, x, y } : item)));
        }}
        onSelect={setSelectedId}
        selectedId={selectedId}
      />

      <header className="artifact-composer__floating-top">
        <div>
          <p className="dao-kicker">Конструктор экрана</p>
          <h1>Рабочий стол</h1>
        </div>
        <nav aria-label="Навигация конструктора">
          <Link href="/">Основная</Link>
          <Link href="/space">Пространство</Link>
          <button onClick={() => saveItems()} type="button">
            Сохранить
          </button>
          <button onClick={() => setPanelsHidden((value) => !value)} type="button">
            {panelsHidden ? "Показать панели" : "Скрыть панели"}
          </button>
        </nav>
      </header>

      <aside className="artifact-composer__panel artifact-composer__panel--library">
        <div className="artifact-composer__section">
          <p className="artifact-composer__label">Предметы</p>
          <div className="artifact-library">
            {HOME_ARTIFACTS.map((artifact) => (
              <button key={artifact.id} onClick={() => addArtifact(artifact.id)} type="button">
                <img alt="" src={artifact.src} />
                <span>{artifact.title}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="artifact-composer__section">
          <p className="artifact-composer__label">Композиция</p>
          <div className="artifact-composer__actions">
            <button onClick={loadStarter} type="button">
              Пример
            </button>
            <button onClick={clearItems} type="button">
              Очистить
            </button>
          </div>
        </div>
      </aside>

      <aside className="artifact-composer__panel artifact-composer__panel--settings">
        {selected && selectedArtifact ? (
          <>
            <div className="artifact-selected">
              <img alt="" src={selectedArtifact.src} />
              <div>
                <p className="artifact-composer__label">Выбран</p>
                <strong>{selectedArtifact.title}</strong>
              </div>
            </div>

            <ComposerSlider label="Заметность" max={1} min={0} onChange={(opacity) => updateSelected({ opacity })} step={0.01} value={selected.opacity} />
            <ComposerSlider label="Размер" max={44} min={6} onChange={(width) => updateSelected({ width })} step={0.2} suffix="vw" value={selected.width} />
            <ComposerSlider label="По горизонтали" max={100} min={0} onChange={(x) => updateSelected({ x })} step={0.2} suffix="%" value={selected.x} />
            <ComposerSlider label="По вертикали" max={100} min={0} onChange={(y) => updateSelected({ y })} step={0.2} suffix="%" value={selected.y} />
            <ComposerSlider label="Поворот" max={30} min={-30} onChange={(rotation) => updateSelected({ rotation })} step={0.5} suffix="°" value={selected.rotation} />
            <ComposerSlider label="Размытие" max={8} min={0} onChange={(blur) => updateSelected({ blur })} step={0.1} suffix="px" value={selected.blur} />
            <ComposerSlider label="Свечение" max={0.65} min={0} onChange={(glow) => updateSelected({ glow })} step={0.01} value={selected.glow} />
            <ComposerSlider label="Яркость" max={1.6} min={0.45} onChange={(brightness) => updateSelected({ brightness })} step={0.01} value={selected.brightness} />

            <label className="composer-field">
              <span>Слой</span>
              <input max={20} min={1} onChange={(event) => updateSelected({ zIndex: Number(event.target.value) })} type="number" value={selected.zIndex} />
            </label>

            <label className="composer-field">
              <span>Наложение</span>
              <select onChange={(event) => updateSelected({ blendMode: event.target.value as HomeArtifactInstance["blendMode"] })} value={selected.blendMode}>
                <option value="normal">Обычное</option>
                <option value="screen">Свет</option>
                <option value="lighten">Осветление</option>
                <option value="multiply">Тень</option>
              </select>
            </label>

            <div className="artifact-composer__actions">
              <button onClick={() => updateSelected({ visible: !selected.visible })} type="button">
                {selected.visible ? "Скрыть" : "Показать"}
              </button>
              <button onClick={removeSelected} type="button">
                Удалить
              </button>
            </div>
          </>
        ) : (
          <div className="artifact-empty">
            <p className="dao-kicker">Пусто</p>
            <p>Добавь предмет слева, затем двигай его прямо по основному экрану.</p>
          </div>
        )}
      </aside>

      <div className="artifact-composer__hint" aria-hidden="true">
        Перетаскивай предметы прямо по рабочему столу
      </div>
    </section>
  );
}

function ComposerSlider({
  label,
  max,
  min,
  onChange,
  step,
  suffix = "",
  value
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  suffix?: string;
  value: number;
}) {
  return (
    <label className="composer-slider">
      <span>
        {label}
        <strong>
          {Number.isInteger(value) ? value : value.toFixed(step < 0.1 ? 2 : 1)}
          {suffix}
        </strong>
      </span>
      <input max={max} min={min} onChange={(event) => onChange(Number(event.target.value))} step={step} type="range" value={value} />
    </label>
  );
}

