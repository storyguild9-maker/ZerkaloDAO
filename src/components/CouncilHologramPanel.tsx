"use client";

import {
  useIsConnectionRestored,
  useTonAddress,
  useTonConnectUI,
  useTonWallet
} from "@tonconnect/ui-react";
import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import { createPortal } from "react-dom";
import { CouncilGovernancePanel } from "@/components/CouncilGovernancePanel";

type CouncilPanelTab = "wallet" | "votes" | "profile";

type CouncilHologramPanelProps = {
  participantName?: string;
  sessionToken?: string;
  visible: boolean;
  onLeave: () => void;
  panelRef: MutableRefObject<HTMLElement | null>;
};

const PANEL_TABS: Array<{ id: CouncilPanelTab; label: string }> = [
  { id: "wallet", label: "Кошелёк" },
  { id: "votes", label: "Голосования" },
  { id: "profile", label: "DAO-профиль" }
];

const shortenAddress = (address: string) => address.length > 14
  ? `${address.slice(0, 7)}...${address.slice(-6)}`
  : address;

export function CouncilHologramPanel({ participantName, sessionToken, visible, onLeave, panelRef }: CouncilHologramPanelProps) {
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const walletAddress = useTonAddress();
  const connectionRestored = useIsConnectionRestored();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<CouncilPanelTab>("wallet");
  const [collapsed, setCollapsed] = useState(false);
  const [projectorVisible, setProjectorVisible] = useState(true);
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletMessage, setWalletMessage] = useState("");
  const [canManageGovernance, setCanManageGovernance] = useState(false);

  const walletNetwork = wallet
    ? String(wallet.account.chain) === "-239" ? "Основная сеть TON" : "Тестовая сеть TON"
    : "";
  const walletName = wallet?.device.appName || "TON Wallet";
  const compactAddress = useMemo(() => shortenAddress(walletAddress), [walletAddress]);

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
      setWalletMessage("");
    }
  }, [visible]);

  const connectWallet = async () => {
    setWalletBusy(true);
    setWalletMessage("");
    try {
      await tonConnectUI.openModal();
    } catch {
      setWalletMessage("Не удалось открыть выбор кошелька. Попробуйте ещё раз.");
    } finally {
      setWalletBusy(false);
    }
  };

  const disconnectWallet = async () => {
    setWalletBusy(true);
    setWalletMessage("");
    try {
      await tonConnectUI.disconnect();
    } catch {
      setWalletMessage("Не удалось отключить кошелёк.");
    } finally {
      setWalletBusy(false);
    }
  };

  const copyAddress = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setWalletMessage("Адрес скопирован");
    } catch {
      setWalletMessage("Не удалось скопировать адрес");
    }
  };

  if (!visible || !mounted) return null;

  return createPortal(
    <section
      aria-label="Личная консоль участника"
      className="council-hologram"
      data-active-tab={activeTab}
      data-collapsed={collapsed}
      data-projector-visible={projectorVisible}
      data-world-visible="false"
      ref={(node) => {
        panelRef.current = node;
      }}
      style={{
        width: collapsed
          ? "min(27rem, calc(100vw - 0.75rem))"
          : "min(70rem, calc(100vw - 0.75rem))"
      }}
    >
      <div
        className="council-hologram__surface"
        style={collapsed ? undefined : {
          display: "grid",
          gridTemplateRows: "auto auto minmax(0, 1fr) auto",
          height: "min(42rem, calc(100dvh - 8.5rem))"
        }}
      >
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

            <div
              className="council-hologram__content"
              style={{
                minHeight: 0,
                overflowY: "auto",
                overscrollBehavior: "contain",
                scrollbarGutter: "stable"
              }}
            >
              {activeTab === "wallet" ? (
                <div className="council-hologram__wallet" data-connected={Boolean(wallet)} role="tabpanel">
                  <div className="council-hologram__orb" aria-hidden="true">TON</div>
                  <div className="council-hologram__wallet-copy">
                    <p className="council-hologram__eyebrow">{wallet ? walletName : "TON Connect"}</p>
                    <h2>{wallet ? compactAddress : "Кошелёк не подключён"}</h2>
                    <p>
                      {wallet
                        ? `${walletNetwork}. Соединение восстановится при следующем входе.`
                        : "Подключение проходит напрямую через TON Connect. Приложение не получает доступ к ключам."}
                    </p>
                    {walletMessage ? <small role="status">{walletMessage}</small> : null}
                  </div>
                  <div className="council-hologram__wallet-actions">
                    {wallet ? (
                      <>
                        <button onClick={() => void copyAddress()} title={walletAddress} type="button">Копировать</button>
                        <button disabled={walletBusy} onClick={() => void disconnectWallet()} type="button">
                          {walletBusy ? "Отключаю..." : "Отключить"}
                        </button>
                      </>
                    ) : (
                      <button
                        disabled={!connectionRestored || walletBusy}
                        onClick={() => void connectWallet()}
                        type="button"
                      >
                        {!connectionRestored ? "Восстанавливаю..." : walletBusy ? "Открываю..." : "Подключить кошелёк"}
                      </button>
                    )}
                  </div>
                </div>
              ) : null}

              {activeTab === "votes" ? (
                <CouncilGovernancePanel
                  onManagementChange={setCanManageGovernance}
                  sessionToken={sessionToken}
                />
              ) : null}

              {activeTab === "profile" ? (
                <div className="council-hologram__profile" role="tabpanel">
                  <div><span>Статус</span><strong>Присутствует</strong></div>
                  <div><span>Роль</span><strong>{canManageGovernance ? "Управляющий" : "Участник совета"}</strong></div>
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
