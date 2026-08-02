"use client";

import { useEffect, useState, type MutableRefObject } from "react";
import { createPortal } from "react-dom";

type CouncilPanelTab = "wallet" | "votes" | "profile";

type CouncilHologramPanelProps = {
  participantName?: string;
  visible: boolean;
  onLeave: () => void;
  panelRef: MutableRefObject<HTMLElement | null>;
};

const PANEL_TABS: Array<{ id: CouncilPanelTab; label: string }> = [
  { id: "wallet", label: "Кошелёк" },
  { id: "votes", label: "Голосования" },
  { id: "profile", label: "DAO-профиль" }
];

export function CouncilHologramPanel({ participantName, visible, onLeave, panelRef }: CouncilHologramPanelProps) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<CouncilPanelTab>("wallet");
  const [collapsed, setCollapsed] = useState(false);
  const [projectorVisible, setProjectorVisible] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const toggleFromCrystal = () => setProjectorVisible((value) => !value);
    window.addEventListener("council-projector-crystal-toggle", toggleFromCrystal);
    return () => window.removeEventListener("council-projector-crystal-toggle", toggleFromCrystal);
  }, []);

  useEffect(() => {
    if (!visible) {
      setActiveTab("wallet");
      setCollapsed(false);
      setProjectorVisible(true);
    }
  }, [visible]);

  if (!visible || !mounted) return null;

  return createPortal(
    <section
      aria-label="Личная консоль участника"
      className="council-hologram"
      data-collapsed={collapsed}
      data-projector-visible={projectorVisible}
      data-world-visible="false"
      ref={(node) => {
        panelRef.current = node;
      }}
    >

      <div className="council-hologram__surface">
        <header className="council-hologram__header">
          <div>
            <p>Личный контур</p>
            <strong>{participantName || "Участник совета"}</strong>
          </div>
          <div className="council-hologram__header-actions">
            <span>Место активно</span>
            <button
              aria-label={collapsed ? "Развернуть личную консоль" : "Свернуть личную консоль"}
              onClick={() => setCollapsed((value) => !value)}
              type="button"
            >
              {collapsed ? "◇" : "—"}
            </button>
          </div>
        </header>

        {!collapsed ? (
          <>
            <nav aria-label="Разделы личной консоли" className="council-hologram__tabs">
              {PANEL_TABS.map((tab) => (
                <button
                  aria-selected={activeTab === tab.id}
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  role="tab"
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            <div className="council-hologram__content">
              {activeTab === "wallet" ? (
                <div className="council-hologram__wallet" role="tabpanel">
                  <div className="council-hologram__orb" aria-hidden="true">TON</div>
                  <div>
                    <p className="council-hologram__eyebrow">TON Connect</p>
                    <h2>Кошелёк не подключён</h2>
                    <p>Адрес и баланс появятся здесь после безопасного подтверждения в кошельке.</p>
                  </div>
                  <button disabled title="Подключение TON Connect будет добавлено следующим этапом" type="button">
                    Подключение готовится
                  </button>
                </div>
              ) : null}

              {activeTab === "votes" ? (
                <div className="council-hologram__empty" role="tabpanel">
                  <p className="council-hologram__eyebrow">Совет Зеркала</p>
                  <h2>Нет активных голосований</h2>
                  <p>Когда предложение откроется, здесь появятся срок, кворум и подтверждение через TON.</p>
                </div>
              ) : null}

              {activeTab === "profile" ? (
                <div className="council-hologram__profile" role="tabpanel">
                  <div><span>Статус</span><strong>Присутствует</strong></div>
                  <div><span>Роль</span><strong>Гость храма</strong></div>
                  <div><span>Сила голоса</span><strong>Не определена</strong></div>
                </div>
              ) : null}
            </div>

            <footer className="council-hologram__footer">
              <span>Данные консоли видны только владельцу места</span>
              <button onClick={onLeave} type="button">Выйти из-за стола</button>
            </footer>
          </>
        ) : null}
      </div>
    </section>,
    document.body
  );
}
