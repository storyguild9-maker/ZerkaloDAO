import { DaoShell } from "@/components/DaoShell";
import { accessLabels, archetypeLabels, metricLabels } from "@/lib/labels";
import { decodeJson } from "@/lib/json";
import { prisma } from "@/lib/prisma";
import type { AccessLevel, Archetype, Metrics, RiskFlag } from "@/lib/types";

const accessOptions: AccessLevel[] = ["none", "iskatel", "slyshashchiy", "pustaya_chasha"];

const statusLabels: Record<string, string> = {
  created: "создана",
  completed: "завершена",
  reviewed: "проверена"
};

const riskLabels: Record<RiskFlag, string> = {
  high_status_attachment: "высокая привязка к статусу",
  high_impulsivity: "импульсивность",
  low_self_observation: "слабое самонаблюдение",
  hostile_feedback_response: "жёсткая реакция на обратную связь",
  over_savior_pattern: "паттерн спасателя",
  low_uncertainty_tolerance: "низкая переносимость неопределённости"
};

function formatDate(date?: Date | null) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function compactId(id: string) {
  return id.length > 22 ? `${id.slice(0, 11)}…${id.slice(-7)}` : id;
}

function clampMetric(value: unknown) {
  const number = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function statusLabel(status: string) {
  return statusLabels[status] ?? status;
}

function safePayload(payload: string | null) {
  const decoded = decodeJson<unknown>(payload, null);
  if (!decoded) return "—";
  return JSON.stringify(decoded, null, 2);
}

export default async function AdminPage({
  searchParams
}: {
  searchParams: { password?: string; session?: string };
}) {
  const expected = process.env.ADMIN_PASSWORD ?? "change-me";

  if (searchParams.password !== expected) {
    return (
      <DaoShell eyebrow="Админ" title="Внутренний просмотр" subtitle="Закрытая панель ревью сессий Зеркала Дао.">
        <form method="get" className="admin-auth-panel">
          <label className="grid gap-2 text-sm text-mist/70">
            Пароль доступа
            <input name="password" type="password" className="dao-input p-3" placeholder="Введите пароль" autoComplete="current-password" />
          </label>
          <button className="dao-action px-5 py-3">Войти</button>
        </form>
      </DaoShell>
    );
  }

  const sessions = await prisma.candidateSession.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
    include: {
      profile: true,
      notes: { orderBy: { createdAt: "desc" } },
      attempts: { orderBy: { startedAt: "asc" } },
      events: { orderBy: { timestamp: "asc" } }
    }
  });

  const selected = searchParams.session ? sessions.find((session) => session.id === searchParams.session) : sessions[0];
  const profile = selected?.profile;
  const effectiveAccess = profile ? ((profile.manualAccessLevel ?? profile.accessLevel) as AccessLevel) : "none";
  const metrics = profile ? decodeJson<Metrics>(profile.metrics, {} as Metrics) : ({} as Metrics);
  const metricEntries = Object.keys(metricLabels).map((key) => [key, clampMetric(metrics[key as keyof Metrics])] as const);
  const riskFlags = profile ? decodeJson<RiskFlag[]>(profile.riskFlags, []) : [];
  const strengths = profile ? decodeJson<string[]>(profile.strengths, []) : [];
  const shadows = profile ? decodeJson<string[]>(profile.shadows, []) : [];
  const practices = profile ? decodeJson<string[]>(profile.practices, []) : [];

  const totalCount = sessions.length;
  const completedCount = sessions.filter((session) => session.status === "completed" || session.status === "reviewed").length;
  const reviewedCount = sessions.filter((session) => session.status === "reviewed").length;
  const prospectCount = sessions.filter((session) => session.isProspect).length;
  const contactCount = sessions.filter((session) => Boolean(session.optionalEmail)).length;

  const adminHref = (sessionId?: string) => `/admin?password=${encodeURIComponent(expected)}${sessionId ? `&session=${sessionId}` : ""}`;

  return (
    <DaoShell wide eyebrow="Админ" title="Панель ревью" subtitle="Сводка кандидатов, профили доступа, заметки ревьюера и поведенческая телеметрия.">
      <div className="admin-dashboard">
        <section className="admin-stats" aria-label="Сводка">
          <div className="admin-stat">
            <span>Сессий</span>
            <strong>{totalCount}</strong>
          </div>
          <div className="admin-stat">
            <span>Завершено</span>
            <strong>{completedCount}</strong>
          </div>
          <div className="admin-stat">
            <span>Проверено</span>
            <strong>{reviewedCount}</strong>
          </div>
          <div className="admin-stat">
            <span>Перспективные</span>
            <strong>{prospectCount}</strong>
          </div>
          <div className="admin-stat">
            <span>Контакты</span>
            <strong>{contactCount}</strong>
          </div>
        </section>

        <div className="admin-layout">
          <aside className="admin-sidebar" aria-label="Сессии">
            <div className="admin-section-head">
              <div>
                <p className="dao-kicker">Лента</p>
                <h2>Последние сессии</h2>
              </div>
              <span>{sessions.length}</span>
            </div>

            {sessions.length ? (
              <div className="admin-session-list">
                {sessions.map((session) => {
                  const sessionAccess = session.profile ? ((session.profile.manualAccessLevel ?? session.profile.accessLevel) as AccessLevel) : null;
                  const isActive = selected?.id === session.id;

                  return (
                    <a key={session.id} href={adminHref(session.id)} className={`admin-session-link ${isActive ? "is-active" : ""}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-white">{compactId(session.id)}</p>
                          <p className="mt-1 text-xs text-mist/55">{formatDate(session.startedAt)}</p>
                        </div>
                        <span className={`admin-status admin-status-${session.status}`}>{statusLabel(session.status)}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {sessionAccess ? <span className="admin-badge">{accessLabels[sessionAccess]}</span> : <span className="admin-badge is-muted">без профиля</span>}
                        {session.isProspect ? <span className="admin-badge is-gold">перспективный</span> : null}
                        {session.optionalEmail ? <span className="admin-badge is-jade">контакт</span> : null}
                      </div>
                    </a>
                  );
                })}
              </div>
            ) : (
              <div className="admin-empty">Сессий пока нет.</div>
            )}
          </aside>

          <section className="admin-main">
            {selected ? (
              <div className="grid gap-6">
                <header className="admin-hero-panel">
                  <div className="min-w-0">
                    <p className="dao-kicker">Выбранная сессия</p>
                    <h2 className="mt-3 break-all text-2xl font-semibold text-white">{selected.id}</h2>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className={`admin-status admin-status-${selected.status}`}>{statusLabel(selected.status)}</span>
                      {selected.isProspect ? <span className="admin-badge is-gold">перспективный кандидат</span> : null}
                      <span className="admin-badge">{selected.attempts.length} попыток</span>
                      <span className="admin-badge">{selected.events.length} событий</span>
                    </div>
                  </div>
                  <div className="admin-hero-actions">
                    <p>{formatDate(selected.startedAt)}</p>
                    <a href={`/api/admin/export?password=${encodeURIComponent(expected)}&session=${selected.id}`} className="dao-action px-5 py-3 text-center">
                      Экспорт JSON
                    </a>
                  </div>
                </header>

                <section className="admin-info-grid">
                  <div className="admin-info-item">
                    <span>Контакт</span>
                    <strong>{selected.optionalEmail || "не оставлен"}</strong>
                  </div>
                  <div className="admin-info-item">
                    <span>Текущие врата</span>
                    <strong>{selected.currentGateId || "—"}</strong>
                  </div>
                  <div className="admin-info-item">
                    <span>Согласие</span>
                    <strong>{selected.consentAccepted ? "принято" : "нет"}</strong>
                  </div>
                  <div className="admin-info-item">
                    <span>Завершение</span>
                    <strong>{formatDate(selected.completedAt)}</strong>
                  </div>
                </section>

                {profile ? (
                  <section className="admin-surface">
                    <div className="admin-section-head">
                      <div>
                        <p className="dao-kicker">Профиль</p>
                        <h2>{archetypeLabels[profile.archetype as Archetype]}</h2>
                      </div>
                      <span>{accessLabels[effectiveAccess]}</span>
                    </div>
                    <p className="mt-4 leading-8 text-mist/78">{profile.summary}</p>
                    <div className="admin-three-cols mt-5">
                      <div>
                        <h3>Сильные стороны</h3>
                        <ul>{strengths.length ? strengths.map((item) => <li key={item}>{item}</li>) : <li>нет данных</li>}</ul>
                      </div>
                      <div>
                        <h3>Тени</h3>
                        <ul>{shadows.length ? shadows.map((item) => <li key={item}>{item}</li>) : <li>нет данных</li>}</ul>
                      </div>
                      <div>
                        <h3>Практики</h3>
                        <ul>{practices.length ? practices.map((item) => <li key={item}>{item}</li>) : <li>нет данных</li>}</ul>
                      </div>
                    </div>
                  </section>
                ) : (
                  <section className="admin-surface admin-empty">Профиль ещё не рассчитан.</section>
                )}

                {profile ? (
                  <form action="/api/admin/session" method="post" className="admin-surface admin-review-form">
                    <input type="hidden" name="password" value={expected} />
                    <input type="hidden" name="sessionId" value={selected.id} />
                    <div className="admin-section-head">
                      <div>
                        <p className="dao-kicker">Ревью</p>
                        <h2>Ручное решение</h2>
                      </div>
                      <span>{profile.accessConfirmed ? "подтверждено" : "ожидает"}</span>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-2 text-sm text-mist/75">
                        Уровень доступа
                        <select name="accessLevel" defaultValue={effectiveAccess} className="dao-input p-3">
                          {accessOptions.map((level) => (
                            <option key={level} value={level}>{accessLabels[level]}</option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-2 text-sm text-mist/75">
                        Ревьюер
                        <input name="reviewer" className="dao-input p-3" placeholder="Имя или роль" />
                      </label>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="dao-check flex gap-3 p-3">
                        <input name="confirmAccess" type="checkbox" defaultChecked={profile.accessConfirmed} />
                        <span className="leading-7 text-mist/80">подтвердить доступ</span>
                      </label>
                      <label className="dao-check flex gap-3 p-3">
                        <input name="isProspect" type="checkbox" defaultChecked={selected.isProspect} />
                        <span className="leading-7 text-mist/80">перспективный кандидат</span>
                      </label>
                    </div>
                    <textarea name="note" className="dao-input min-h-28 p-3" placeholder="Внутренняя заметка ревьюера" />
                    <button className="dao-action w-fit px-5 py-3">Сохранить ревью</button>
                  </form>
                ) : null}

                {profile ? (
                  <section className="admin-surface">
                    <div className="admin-section-head">
                      <div>
                        <p className="dao-kicker">Метрики</p>
                        <h2>Профиль внимания</h2>
                      </div>
                      <span>{riskFlags.length ? `${riskFlags.length} флаг(а)` : "без флагов"}</span>
                    </div>
                    <div className="admin-metrics-grid">
                      {metricEntries.map(([key, value]) => (
                        <div key={key} className="admin-metric">
                          <div className="flex justify-between gap-3 text-sm text-mist/75">
                            <span>{metricLabels[key] ?? key}</span>
                            <strong>{value}</strong>
                          </div>
                          <div className="admin-meter"><span style={{ width: `${value}%` }} /></div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {riskFlags.length ? riskFlags.map((flag) => <span key={flag} className="admin-badge is-warn">{riskLabels[flag] ?? flag}</span>) : <span className="admin-badge is-jade">флаги риска не выражены</span>}
                    </div>
                  </section>
                ) : null}

                <section className="admin-surface">
                  <div className="admin-section-head">
                    <div>
                      <p className="dao-kicker">Ответы</p>
                      <h2>Попытки по вратам</h2>
                    </div>
                    <span>{selected.attempts.length}</span>
                  </div>
                  {selected.attempts.length ? (
                    <div className="admin-attempt-list">
                      {selected.attempts.map((attempt) => {
                        const metadata = decodeJson<Record<string, unknown>>(attempt.metadata, {});
                        const scoreDelta = decodeJson<Record<string, unknown>>(attempt.scoreDelta, {});
                        return (
                          <article key={attempt.id} className="admin-attempt">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <h3>{attempt.gateId}</h3>
                              <span className="admin-badge">{attempt.status}</span>
                            </div>
                            <p className="mt-3 text-sm text-mist/68">choice: {attempt.primaryChoice ?? "—"}</p>
                            <p className="mt-3 leading-7 text-mist/82">{attempt.reflectionText || "Без рефлексии"}</p>
                            <div className="mt-4 grid gap-3 xl:grid-cols-2">
                              <pre className="admin-pre">{JSON.stringify(scoreDelta, null, 2)}</pre>
                              <pre className="admin-pre">{JSON.stringify(metadata, null, 2)}</pre>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="admin-empty">Ответов пока нет.</div>
                  )}
                </section>

                <section className="admin-surface">
                  <div className="admin-section-head">
                    <div>
                      <p className="dao-kicker">События</p>
                      <h2>Поведенческая лента</h2>
                    </div>
                    <span>{selected.events.length}</span>
                  </div>
                  <div className="admin-table-shell">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Время</th>
                          <th>Врата</th>
                          <th>Событие</th>
                          <th>ms</th>
                          <th>Payload</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.events.map((event) => (
                          <tr key={event.id}>
                            <td>{formatDate(event.timestamp)}</td>
                            <td>{event.gateId ?? "—"}</td>
                            <td>{event.eventType}</td>
                            <td>{event.elapsedMs ?? "—"}</td>
                            <td><pre>{safePayload(event.payload)}</pre></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="admin-surface">
                  <div className="admin-section-head">
                    <div>
                      <p className="dao-kicker">Заметки</p>
                      <h2>История ревью</h2>
                    </div>
                    <span>{selected.notes.length}</span>
                  </div>
                  {selected.notes.length ? (
                    <div className="grid gap-3">
                      {selected.notes.map((note) => (
                        <article key={note.id} className="admin-note">
                          <p>{note.reviewer || "ревьюер"} · {formatDate(note.createdAt)}</p>
                          <div>{note.note}</div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="admin-empty">Заметок пока нет.</div>
                  )}
                </section>
              </div>
            ) : (
              <section className="admin-surface admin-empty">Сессий пока нет. После первого прохождения здесь появится карточка кандидата.</section>
            )}
          </section>
        </div>
      </div>
    </DaoShell>
  );
}
