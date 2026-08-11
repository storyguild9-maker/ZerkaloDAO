"use client";

import { useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import { useCallback, useEffect, useState } from "react";

type GrantStatus = {
  network: "-3";
  amount: "100";
  amountRaw: string;
  walletAddress: string;
  distributorAddress: string | null;
  distributorBalanceRaw: string;
  availableClaims: number;
  ready: boolean;
  claimed: boolean;
  state: "available" | "pending" | "submitted" | "claimed" | "unavailable";
  messageHash: string | null;
  reason: string;
};

type TestnetGramGrantProps = {
  sessionToken?: string;
};

const TESTNET_CHAIN = "-3";

function shortHash(value: string | null) {
  if (!value) return "";
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-8)}` : value;
}

export function TestnetGramGrant({ sessionToken }: TestnetGramGrantProps) {
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const [status, setStatus] = useState<GrantStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  const request = useCallback(async (method: "GET" | "POST", body?: Record<string, unknown>) => {
    if (!sessionToken) throw new Error("Сессия участника не найдена");
    if (!wallet) throw new Error("Сначала подключите TON-кошелёк");
    const query = method === "GET"
      ? `?walletAddress=${encodeURIComponent(wallet.account.address)}&walletNetwork=${encodeURIComponent(String(wallet.account.chain))}`
      : "";
    const response = await fetch(`/api/telegram/testnet-gram${query}`, {
      method,
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        ...(method === "POST" ? { "Content-Type": "application/json" } : {})
      },
      ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
      cache: "no-store"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Не удалось проверить выдачу test GRAM");
    return payload;
  }, [sessionToken, wallet]);

  const refresh = useCallback(async (quiet = false) => {
    if (!wallet || String(wallet.account.chain) !== TESTNET_CHAIN || !sessionToken) {
      setStatus(null);
      return;
    }
    if (!quiet) setLoading(true);
    try {
      const payload = await request("GET");
      setStatus(payload.status ?? null);
      if (!quiet) setNotice("");
    } catch (error) {
      if (!quiet) setNotice(error instanceof Error ? error.message : "Выдача временно недоступна");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [request, sessionToken, wallet]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (status?.state !== "submitted") return;
    const timer = window.setInterval(() => void refresh(true), 4_000);
    return () => window.clearInterval(timer);
  }, [refresh, status?.state]);

  const claim = async () => {
    if (!wallet) return;
    if (String(wallet.account.chain) !== TESTNET_CHAIN) {
      setNotice("Переключите подключённый кошелёк на TON Testnet");
      return;
    }
    if (!wallet.account.walletStateInit) {
      setNotice("Кошелёк не передал данные, необходимые для проверки подписи");
      return;
    }
    setLoading(true);
    setNotice("");
    try {
      const challengePayload = await request("POST", {
        action: "challenge",
        walletAddress: wallet.account.address,
        walletNetwork: String(wallet.account.chain)
      });
      const challenge = challengePayload.challenge;
      if (!challenge?.id || !challenge?.text) throw new Error("Не удалось подготовить выдачу");
      const result = await tonConnectUI.signData({
        type: "text",
        text: challenge.text,
        network: wallet.account.chain,
        from: wallet.account.address
      });
      const claimPayload = await request("POST", {
        action: "claim",
        challengeId: challenge.id,
        result,
        walletStateInit: wallet.account.walletStateInit
      });
      setStatus(claimPayload.status ?? null);
      setNotice("Выдача отправлена автоматически. Ожидаем подтверждение TON Testnet.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось получить test GRAM";
      setNotice(/reject|declin|отмен/i.test(message) ? "Подписание отменено" : message);
    } finally {
      setLoading(false);
    }
  };

  if (!wallet) {
    return (
      <section className="testnet-gram-grant" aria-label="Тестовая выдача GRAM">
        <div className="testnet-gram-grant__amount"><strong>100</strong><span>test GRAM</span></div>
        <div className="testnet-gram-grant__copy">
          <p>Тестовый баланс участника</p>
          <h3>Подключите TON-кошелёк</h3>
          <small>После подключения кошелька в Testnet здесь появится разовая автоматическая выдача.</small>
        </div>
      </section>
    );
  }

  const isTestnet = String(wallet.account.chain) === TESTNET_CHAIN;
  const claimed = status?.state === "claimed";
  const submitted = status?.state === "submitted";
  return (
    <section className="testnet-gram-grant" data-state={status?.state ?? (isTestnet ? "loading" : "wrong-network")} aria-label="Тестовая выдача GRAM">
      <div className="testnet-gram-grant__amount"><strong>100</strong><span>test GRAM</span></div>
      <div className="testnet-gram-grant__copy">
        <p>Разовая выдача · TON Testnet</p>
        <h3>{!isTestnet ? "Нужна тестовая сеть" : status?.reason || "Проверяю раздатчик…"}</h3>
        <small>
          {!isTestnet
            ? "Переключите сеть в приложении кошелька и вернитесь в Зеркало."
            : claimed
              ? "Повторная выдача этому участнику или адресу заблокирована контрактом."
              : "Подтвердите безопасную подпись: средства из вашего кошелька не списываются."}
        </small>
        {status?.messageHash ? <code title={status.messageHash}>Сообщение {shortHash(status.messageHash)}</code> : null}
        {notice ? <em role="status">{notice}</em> : null}
      </div>
      <div className="testnet-gram-grant__actions">
        <button
          disabled={!isTestnet || loading || claimed || submitted || !status?.ready}
          onClick={() => void claim()}
          type="button"
        >
          {loading
            ? "Проверяю…"
            : claimed
              ? "Получено"
              : submitted
                ? "Подтверждается…"
                : "Получить 100"}
        </button>
        {isTestnet && status ? <small>Доступно выдач: {status.availableClaims}</small> : null}
      </div>
    </section>
  );
}
