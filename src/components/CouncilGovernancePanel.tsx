"use client";

import { useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type GovernanceProposal = {
  id: string;
  title: string;
  description: string;
  options: string[];
  quorum: number;
  status: "open" | "closed" | "cancelled";
  createdAt: string;
  closesAt: string;
  totalVotes: number;
  quorumReached: boolean;
  myChoice: string | null;
  results: Array<{ choice: string; count: number }>;
};

type CouncilGovernancePanelProps = {
  sessionToken?: string;
  onManagementChange?: (canManage: boolean) => void;
};

type GovernanceResponse = {
  ok: boolean;
  error?: string;
  proposals?: GovernanceProposal[];
  canManage?: boolean;
  challenge?: { id: string; text: string; expiresAt: string };
};

const formatDeadline = (value: string) => new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit"
}).format(new Date(value));

export function CouncilGovernancePanel({ sessionToken, onManagementChange }: CouncilGovernancePanelProps) {
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const [proposals, setProposals] = useState<GovernanceProposal[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [notice, setNotice] = useState("");
  const [showCreator, setShowCreator] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [optionsText, setOptionsText] = useState("За\nПротив\nВоздержаться");
  const [quorum, setQuorum] = useState("1");
  const [durationHours, setDurationHours] = useState("72");

  const request = useCallback(async (method: "GET" | "POST", body?: Record<string, unknown>) => {
    if (!sessionToken) throw new Error("Приватная сессия недоступна");
    const response = await fetch("/api/telegram/governance", {
      method,
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store"
    });
    const payload = await response.json() as GovernanceResponse;
    if (!response.ok || !payload.ok) throw new Error(payload.error || "Голосование временно недоступно");
    return payload;
  }, [sessionToken]);

  const loadProposals = useCallback(async (quiet = false) => {
    if (!sessionToken) {
      setLoading(false);
      return;
    }
    if (!quiet) setLoading(true);
    try {
      const payload = await request("GET");
      setProposals(payload.proposals ?? []);
      setCanManage(Boolean(payload.canManage));
      onManagementChange?.(Boolean(payload.canManage));
      if (!quiet) setNotice("");
    } catch (reason) {
      if (!quiet) setNotice(reason instanceof Error ? reason.message : "Не удалось загрузить голосования");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [onManagementChange, request, sessionToken]);

  useEffect(() => {
    void loadProposals();
    const timer = window.setInterval(() => void loadProposals(true), 12000);
    return () => window.clearInterval(timer);
  }, [loadProposals]);

  const openProposals = useMemo(
    () => proposals.filter((proposal) => proposal.status === "open"),
    [proposals]
  );

  const createProposal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyKey("create");
    setNotice("");
    try {
      await request("POST", {
        action: "create",
        title,
        description,
        options: optionsText.split("\n").map((option) => option.trim()).filter(Boolean),
        quorum: Number(quorum),
        durationHours: Number(durationHours)
      });
      setTitle("");
      setDescription("");
      setOptionsText("За\nПротив\nВоздержаться");
      setShowCreator(false);
      setNotice("Голосование открыто");
      await loadProposals(true);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Не удалось создать голосование");
    } finally {
      setBusyKey("");
    }
  };

  const closeProposal = async (proposalId: string) => {
    setBusyKey(`close:${proposalId}`);
    setNotice("");
    try {
      await request("POST", { action: "close", proposalId });
      setNotice("Голосование закрыто");
      await loadProposals(true);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Не удалось закрыть голосование");
    } finally {
      setBusyKey("");
    }
  };

  const vote = async (proposal: GovernanceProposal, choice: string) => {
    if (!wallet) {
      setNotice("Сначала подключите TON-кошелёк во вкладке «Кошелёк»");
      return;
    }
    if (!wallet.account.walletStateInit) {
      setNotice("Кошелёк не передал данные, необходимые для проверки подписи");
      return;
    }
    const key = `vote:${proposal.id}:${choice}`;
    setBusyKey(key);
    setNotice("");
    try {
      const challengePayload = await request("POST", {
        action: "challenge",
        proposalId: proposal.id,
        choice,
        walletAddress: wallet.account.address,
        walletNetwork: String(wallet.account.chain)
      });
      const challenge = challengePayload.challenge;
      if (!challenge) throw new Error("Не удалось подготовить подпись");
      const result = await tonConnectUI.signData({
        type: "text",
        text: challenge.text,
        network: wallet.account.chain,
        from: wallet.account.address
      });
      await request("POST", {
        action: "vote",
        challengeId: challenge.id,
        result,
        walletStateInit: wallet.account.walletStateInit
      });
      setNotice(`Голос «${choice}» подтверждён TON-подписью`);
      await loadProposals(true);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Не удалось подписать голос";
      setNotice(/reject|declin|отмен/i.test(message) ? "Подписание отменено" : message);
    } finally {
      setBusyKey("");
    }
  };

  return (
    <div className="council-governance" role="tabpanel">
      <div className="council-governance__heading">
        <div>
          <p className="council-hologram__eyebrow">Совет Зеркала</p>
          <h2>{openProposals.length ? `Открыто: ${openProposals.length}` : "Нет активных голосований"}</h2>
        </div>
        <div className="council-governance__heading-actions">
          <button disabled={loading} onClick={() => void loadProposals()} type="button">Обновить</button>
          {canManage ? (
            <button aria-expanded={showCreator} onClick={() => setShowCreator((value) => !value)} type="button">
              {showCreator ? "Закрыть форму" : "Создать"}
            </button>
          ) : null}
        </div>
      </div>

      {canManage && showCreator ? (
        <form className="council-governance__creator" onSubmit={(event) => void createProposal(event)}>
          <label>
            <span>Предложение</span>
            <input maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="Что решает совет?" required value={title} />
          </label>
          <label>
            <span>Описание</span>
            <textarea maxLength={2000} onChange={(event) => setDescription(event.target.value)} placeholder="Контекст, последствия и условия" rows={3} value={description} />
          </label>
          <label>
            <span>Варианты, каждый с новой строки</span>
            <textarea onChange={(event) => setOptionsText(event.target.value)} rows={3} value={optionsText} />
          </label>
          <div className="council-governance__creator-row">
            <label>
              <span>Кворум</span>
              <input min={1} onChange={(event) => setQuorum(event.target.value)} required step={1} type="number" value={quorum} />
            </label>
            <label>
              <span>Срок, часов</span>
              <input max={720} min={1} onChange={(event) => setDurationHours(event.target.value)} required step={1} type="number" value={durationHours} />
            </label>
          </div>
          <button disabled={busyKey === "create"} type="submit">
            {busyKey === "create" ? "Открываю..." : "Открыть голосование"}
          </button>
        </form>
      ) : null}

      {notice ? <p className="council-governance__notice" role="status">{notice}</p> : null}
      {loading ? <p className="council-governance__loading">Синхронизация решений...</p> : null}

      <div className="council-governance__list">
        {!loading && proposals.length === 0 ? (
          <div className="council-governance__empty">
            <p>Управляющий может открыть первое предложение. Каждый голос подтверждается лично в TON-кошельке.</p>
          </div>
        ) : null}
        {proposals.map((proposal) => (
          <article className="council-governance__proposal" data-status={proposal.status} key={proposal.id}>
            <header>
              <div>
                <span>{proposal.status === "open" ? `До ${formatDeadline(proposal.closesAt)}` : "Завершено"}</span>
                <h3>{proposal.title}</h3>
              </div>
              <strong>{proposal.totalVotes}/{proposal.quorum}</strong>
            </header>
            {proposal.description ? <p>{proposal.description}</p> : null}
            <div className="council-governance__choices">
              {proposal.results.map((result) => {
                const percent = proposal.totalVotes ? Math.round(result.count / proposal.totalVotes * 100) : 0;
                const selected = proposal.myChoice === result.choice;
                return (
                  <button
                    aria-pressed={selected}
                    disabled={proposal.status !== "open" || Boolean(proposal.myChoice) || Boolean(busyKey)}
                    key={result.choice}
                    onClick={() => void vote(proposal, result.choice)}
                    type="button"
                  >
                    <span><b>{result.choice}</b><em>{result.count} · {percent}%</em></span>
                    <i aria-hidden="true" style={{ width: `${percent}%` }} />
                  </button>
                );
              })}
            </div>
            <footer>
              <span>{proposal.myChoice ? `Ваш голос: ${proposal.myChoice}` : proposal.quorumReached ? "Кворум достигнут" : "Ожидается кворум"}</span>
              {canManage && proposal.status === "open" ? (
                <button disabled={Boolean(busyKey)} onClick={() => void closeProposal(proposal.id)} type="button">
                  {busyKey === `close:${proposal.id}` ? "Закрываю..." : "Завершить"}
                </button>
              ) : null}
            </footer>
          </article>
        ))}
      </div>
    </div>
  );
}
