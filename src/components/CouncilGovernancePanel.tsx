"use client";

import { useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import weighted from "./CouncilGovernanceWeighted.module.css";

type FinancialActionType =
  | "stake"
  | "unstake"
  | "allocate"
  | "withdraw"
  | "external_transfer"
  | "policy_change";

type FundVault = {
  slug: string;
  displayName: string;
  assetSymbol: string;
  assetDecimals: number;
  network: "-239" | "-3";
  status: "active" | "paused" | "closed";
  totalShareUnits: string;
  myShareUnits: string;
  myShareBps: number;
};

type GovernanceProposal = {
  id: string;
  title: string;
  description: string;
  options: string[];
  quorum: number;
  kind: "standard" | "financial";
  status: "open" | "closed" | "cancelled";
  decisionStatus: "pending" | "completed" | "approved" | "rejected" | "cancelled";
  winningChoice: string | null;
  createdAt: string;
  closesAt: string;
  totalVotes: number;
  quorumReached: boolean;
  myChoice: string | null;
  results: Array<{ choice: string; count: number; weightUnits: string; percentBps: number }>;
  financial: null | {
    vaultSlug: string;
    vaultName: string;
    assetSymbol: string;
    assetDecimals: number;
    actionType: FinancialActionType;
    amountRaw: string | null;
    destination: string;
    actionHash: string;
    snapshotTotalShareUnits: string;
    myShareUnits: string;
    myShareBps: number;
    participatingShareUnits: string;
    participationBps: number;
    capitalQuorumBps: number;
    approvalBps: number;
    approvalThresholdBps: number;
  };
};

type CouncilGovernancePanelProps = {
  sessionToken?: string;
  onManagementChange?: (canManage: boolean) => void;
};

type GovernanceResponse = {
  ok: boolean;
  error?: string;
  proposals?: GovernanceProposal[];
  funds?: FundVault[];
  canManage?: boolean;
  challenge?: { id: string; text: string; expiresAt: string };
};

const ACTION_LABELS: Record<FinancialActionType, string> = {
  stake: "Разместить под доход",
  unstake: "Вернуть из размещения",
  allocate: "Распределить резерв",
  withdraw: "Забрать из фонда",
  external_transfer: "Перевести получателю",
  policy_change: "Изменить правила фонда"
};

const ACTION_RULES: Record<FinancialActionType, { quorum: string; approval: string; members: number }> = {
  stake: { quorum: "50%", approval: ">50%", members: 1 },
  unstake: { quorum: "50%", approval: ">50%", members: 1 },
  allocate: { quorum: "60%", approval: "60%", members: 2 },
  withdraw: { quorum: "60%", approval: "60%", members: 2 },
  external_transfer: { quorum: "67%", approval: "66,67%", members: 2 },
  policy_change: { quorum: "75%", approval: "75%", members: 2 }
};

async function readGovernanceResponse(response: Response) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    const blockedByVercel = response.headers.get("x-vercel-mitigated") === "challenge";
    throw new Error(blockedByVercel
      ? "Защита сети заблокировала запрос. Отключите VPN и откройте приложение заново."
      : "Сервер голосований вернул неверный ответ");
  }

  try {
    return await response.json() as GovernanceResponse;
  } catch {
    throw new Error("Сервер голосований вернул повреждённый ответ");
  }
}

const formatDeadline = (value: string) => new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit"
}).format(new Date(value));

function formatPercent(bps: number) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: bps % 100 === 0 ? 0 : 1,
    maximumFractionDigits: 2
  }).format(bps / 100);
}

function formatAssetAmount(raw: string | null, decimals: number, symbol: string) {
  if (raw === null) return "Без фиксированной суммы";
  const normalized = raw.padStart(decimals + 1, "0");
  const whole = decimals ? normalized.slice(0, -decimals) : normalized;
  const fraction = decimals ? normalized.slice(-decimals).replace(/0+$/, "").slice(0, 6) : "";
  return `${whole}${fraction ? `,${fraction}` : ""} ${symbol}`;
}

function decisionLabel(proposal: GovernanceProposal) {
  if (proposal.decisionStatus === "approved") return "Одобрено";
  if (proposal.decisionStatus === "rejected") return "Отклонено";
  if (proposal.decisionStatus === "cancelled") return "Отменено";
  return proposal.winningChoice ? `Результат: ${proposal.winningChoice}` : "Завершено";
}

export function CouncilGovernancePanel({ sessionToken, onManagementChange }: CouncilGovernancePanelProps) {
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const [proposals, setProposals] = useState<GovernanceProposal[]>([]);
  const [funds, setFunds] = useState<FundVault[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [notice, setNotice] = useState("");
  const [showCreator, setShowCreator] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [proposalKind, setProposalKind] = useState<"standard" | "financial">("standard");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [optionsText, setOptionsText] = useState("За\nПротив\nВоздержаться");
  const [quorum, setQuorum] = useState("1");
  const [durationHours, setDurationHours] = useState("72");
  const [fundVaultSlug, setFundVaultSlug] = useState("ton-main");
  const [financialActionType, setFinancialActionType] = useState<FinancialActionType>("stake");
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("Tonstakers / tsTON");

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
    const payload = await readGovernanceResponse(response);
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
      setFunds(payload.funds ?? []);
      if (payload.funds?.length && !payload.funds.some((fund) => fund.slug === fundVaultSlug)) {
        setFundVaultSlug(payload.funds[0].slug);
      }
      setCanManage(Boolean(payload.canManage));
      onManagementChange?.(Boolean(payload.canManage));
      if (!quiet) setNotice("");
    } catch (reason) {
      if (!quiet) setNotice(reason instanceof Error ? reason.message : "Не удалось загрузить голосования");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [fundVaultSlug, onManagementChange, request, sessionToken]);

  useEffect(() => {
    void loadProposals();
    const timer = window.setInterval(() => void loadProposals(true), 12000);
    return () => window.clearInterval(timer);
  }, [loadProposals]);

  const openProposals = useMemo(
    () => proposals.filter((proposal) => proposal.status === "open"),
    [proposals]
  );

  const archivedProposals = useMemo(
    () => proposals.filter((proposal) => proposal.status !== "open"),
    [proposals]
  );

  const selectedFund = funds.find((fund) => fund.slug === fundVaultSlug) ?? funds[0];
  const firstFund = funds[0];

  const selectActionType = (actionType: FinancialActionType) => {
    setFinancialActionType(actionType);
    if (actionType === "stake") setDestination("Tonstakers / tsTON");
    else if (actionType === "policy_change") setDestination("");
    else setDestination("");
  };

  const createProposal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyKey("create");
    setNotice("");
    try {
      await request("POST", {
        action: "create",
        kind: proposalKind,
        title,
        description,
        options: optionsText.split("\n").map((option) => option.trim()).filter(Boolean),
        quorum: Number(quorum),
        durationHours: Number(durationHours),
        fundVaultSlug,
        financialActionType,
        amount,
        destination
      });
      setTitle("");
      setDescription("");
      setOptionsText("За\nПротив\nВоздержаться");
      setAmount("");
      setShowCreator(false);
      setNotice(proposalKind === "financial" ? "Финансовое голосование открыто, доли зафиксированы" : "Голосование открыто");
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
      setNotice("Голосование закрыто и результат зафиксирован");
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
          <h2>{openProposals.length ? "Активные решения" : "Нет активных решений"}</h2>
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
          <div className={weighted.kindSwitch} role="group" aria-label="Тип голосования">
            <button
              aria-pressed={proposalKind === "standard"}
              onClick={() => setProposalKind("standard")}
              type="button"
            >
              <b>Общее решение</b><small>Один участник — один голос</small>
            </button>
            <button
              aria-pressed={proposalKind === "financial"}
              onClick={() => setProposalKind("financial")}
              type="button"
            >
              <b>Решение фонда</b><small>Вес равен доле капитала</small>
            </button>
          </div>
          <label>
            <span>Предложение</span>
            <input maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="Что решает совет?" required value={title} />
          </label>
          <label>
            <span>Описание</span>
            <textarea maxLength={2000} onChange={(event) => setDescription(event.target.value)} placeholder="Контекст, последствия и условия" rows={3} value={description} />
          </label>

          {proposalKind === "standard" ? (
            <>
              <label>
                <span>Варианты, каждый с новой строки</span>
                <textarea onChange={(event) => setOptionsText(event.target.value)} rows={3} value={optionsText} />
              </label>
              <div className="council-governance__creator-row">
                <label>
                  <span>Кворум участников</span>
                  <input min={1} onChange={(event) => setQuorum(event.target.value)} required step={1} type="number" value={quorum} />
                </label>
                <label>
                  <span>Срок, часов</span>
                  <input max={720} min={1} onChange={(event) => setDurationHours(event.target.value)} required step={1} type="number" value={durationHours} />
                </label>
              </div>
            </>
          ) : (
            <div className={weighted.financialFields}>
              <div className="council-governance__creator-row">
                <label>
                  <span>Фонд</span>
                  <select onChange={(event) => setFundVaultSlug(event.target.value)} required value={fundVaultSlug}>
                    {funds.map((fund) => (
                      <option disabled={fund.status !== "active"} key={fund.slug} value={fund.slug}>
                        {fund.displayName} · {fund.assetSymbol}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Действие</span>
                  <select
                    onChange={(event) => selectActionType(event.target.value as FinancialActionType)}
                    value={financialActionType}
                  >
                    {(Object.keys(ACTION_LABELS) as FinancialActionType[]).map((actionType) => (
                      <option key={actionType} value={actionType}>{ACTION_LABELS[actionType]}</option>
                    ))}
                  </select>
                </label>
              </div>
              {financialActionType !== "policy_change" ? (
                <div className="council-governance__creator-row">
                  <label>
                    <span>Сумма, {selectedFund?.assetSymbol ?? "TON"}</span>
                    <input inputMode="decimal" onChange={(event) => setAmount(event.target.value)} placeholder="10" required value={amount} />
                  </label>
                  <label>
                    <span>Куда / для чего</span>
                    <input maxLength={240} onChange={(event) => setDestination(event.target.value)} placeholder="Протокол или получатель" required value={destination} />
                  </label>
                </div>
              ) : null}
              <label>
                <span>Срок, часов</span>
                <input max={720} min={1} onChange={(event) => setDurationHours(event.target.value)} required step={1} type="number" value={durationHours} />
              </label>
              <div className={weighted.ruleCard}>
                <span>Правило этого решения</span>
                <b>Участие {ACTION_RULES[financialActionType].quorum} капитала · «За» {ACTION_RULES[financialActionType].approval}</b>
                <small>Минимум участников: {ACTION_RULES[financialActionType].members}. Доли фиксируются при открытии и блокируются до завершения.</small>
              </div>
              {selectedFund ? (
                <div className={weighted.personalShare}>
                  <span>Ваша текущая доля</span>
                  <b>{formatPercent(selectedFund.myShareBps)}%</b>
                </div>
              ) : <p className={weighted.noFund}>Нет настроенного фонда с подтверждёнными долями.</p>}
            </div>
          )}

          <button disabled={busyKey === "create" || (proposalKind === "financial" && !selectedFund)} type="submit">
            {busyKey === "create" ? "Открываю..." : "Открыть голосование"}
          </button>
        </form>
      ) : null}

      {notice ? <p className="council-governance__notice" role="status">{notice}</p> : null}
      {loading ? <p className="council-governance__loading">Синхронизация решений...</p> : null}

      <div className="council-governance__workspace">
        <div className="council-governance__active">
          <div className="council-governance__list">
            {!loading && openProposals.length === 0 ? (
              <div className="council-governance__empty">
                <strong>Совет ожидает нового решения</strong>
                <p>Управляющий может открыть предложение. Каждый голос подтверждается лично в TON-кошельке.</p>
              </div>
            ) : null}
            {openProposals.map((proposal) => {
              const hasFinancialShare = proposal.kind !== "financial" || BigInt(proposal.financial?.myShareUnits ?? "0") > 0n;
              return (
                <article className="council-governance__proposal" data-status={proposal.status} key={proposal.id}>
                  <header>
                    <div>
                      <span className="council-governance__status">
                        <i aria-hidden="true" />
                        {proposal.kind === "financial" ? "Фонд · " : ""}Открыто до {formatDeadline(proposal.closesAt)}
                      </span>
                      <h3>{proposal.title}</h3>
                    </div>
                    {proposal.financial ? (
                      <strong className="council-governance__quorum">
                        {formatPercent(proposal.financial.participationBps)}%
                        <small>капитала</small>
                      </strong>
                    ) : (
                      <strong className="council-governance__quorum">{proposal.totalVotes}/{proposal.quorum}<small>кворум</small></strong>
                    )}
                  </header>
                  {proposal.description ? <p>{proposal.description}</p> : null}
                  {proposal.financial ? (
                    <div className={weighted.actionCard}>
                      <div><span>Действие</span><b>{ACTION_LABELS[proposal.financial.actionType]}</b></div>
                      <div><span>Сумма</span><b>{formatAssetAmount(proposal.financial.amountRaw, proposal.financial.assetDecimals, proposal.financial.assetSymbol)}</b></div>
                      {proposal.financial.destination ? <div><span>Назначение</span><b>{proposal.financial.destination}</b></div> : null}
                    </div>
                  ) : null}
                  <div className="council-governance__choices">
                    {proposal.results.map((result) => {
                      const percent = result.percentBps / 100;
                      const selected = proposal.myChoice === result.choice;
                      return (
                        <button
                          aria-pressed={selected}
                          disabled={proposal.status !== "open" || Boolean(proposal.myChoice) || Boolean(busyKey) || !hasFinancialShare}
                          key={result.choice}
                          onClick={() => void vote(proposal, result.choice)}
                          type="button"
                        >
                          <span>
                            <b>{result.choice}</b>
                            <em>{proposal.kind === "financial"
                              ? `${formatPercent(result.percentBps)}% капитала · ${result.count} уч.`
                              : `${result.count} · ${formatPercent(result.percentBps)}%`}</em>
                          </span>
                          <i aria-hidden="true" style={{ width: `${percent}%` }} />
                        </button>
                      );
                    })}
                  </div>
                  <footer>
                    <span>
                      {proposal.myChoice
                        ? <><b>Ваш голос:</b> {proposal.myChoice}</>
                        : !hasFinancialShare
                          ? "На снимке нет вашей доли фонда"
                          : proposal.quorumReached
                            ? "Кворум достигнут"
                            : "Ожидается кворум"}
                    </span>
                    {canManage && proposal.status === "open" ? (
                      <button disabled={Boolean(busyKey)} onClick={() => void closeProposal(proposal.id)} type="button">
                        {busyKey === `close:${proposal.id}` ? "Закрываю..." : "Завершить голосование"}
                      </button>
                    ) : null}
                  </footer>
                  {proposal.financial ? (
                    <div className={weighted.thresholdLine}>
                      <span>Ваш вес: <b>{formatPercent(proposal.financial.myShareBps)}%</b></span>
                      <span>Порог участия: <b>{formatPercent(proposal.financial.capitalQuorumBps)}%</b></span>
                      <span>«За» среди За/Против: <b>{formatPercent(proposal.financial.approvalBps)}%</b></span>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>

        <aside className="council-governance__sidebar" aria-label="Состояние Совета">
          <p className="council-hologram__eyebrow">Состояние Совета</p>
          {firstFund ? (
            <div className={weighted.fundSummary}>
              <span>{firstFund.displayName}</span>
              <b>{formatPercent(firstFund.myShareBps)}%</b>
              <small>ваша доля финансового голоса</small>
            </div>
          ) : null}
          <div className="council-governance__stat"><strong>{openProposals.length}</strong><span>активных</span></div>
          <div className="council-governance__stat"><strong>{archivedProposals.length}</strong><span>в архиве</span></div>
          <button
            aria-expanded={showArchive}
            className="council-governance__archive-toggle"
            disabled={archivedProposals.length === 0}
            onClick={() => setShowArchive((value) => !value)}
            type="button"
          >
            <span><small>Завершённые</small><b>Архив голосований</b></span>
            <strong>{archivedProposals.length}</strong>
          </button>
          <small className="council-governance__sidebar-note">В рабочей области отображаются только действующие решения.</small>
        </aside>
      </div>

      {showArchive && archivedProposals.length ? (
        <section className="council-governance__archive" aria-label="Архив голосований">
          <header>
            <div><p className="council-hologram__eyebrow">Архив</p><h2>Завершённые решения</h2></div>
            <button onClick={() => setShowArchive(false)} type="button">Скрыть</button>
          </header>
          <div className="council-governance__archive-list">
            {archivedProposals.map((proposal) => (
              <article key={proposal.id}>
                <div>
                  <span>{proposal.kind === "financial" ? "Фонд · " : ""}{decisionLabel(proposal)} · {formatDeadline(proposal.closesAt)}</span>
                  <h3>{proposal.title}</h3>
                  {proposal.description ? <p>{proposal.description}</p> : null}
                </div>
                <strong>{proposal.financial ? `${formatPercent(proposal.financial.participationBps)}%` : `${proposal.totalVotes}/${proposal.quorum}`}</strong>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
