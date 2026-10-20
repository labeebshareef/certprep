import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Flag } from "lucide-react";
import { createStore, del, get, set } from "idb-keyval";
import { useData } from "@/state/app";
import { isCorrect } from "@/lib/content";
import { MOCK_QUESTIONS, planMock, scaledEstimate } from "@/lib/session";
import { cn, shuffle, MINUTE } from "@/lib/utils";
import { Badge, Button, buttonVariants, Card, CardContent, CardDescription, CardHeader, CardTitle, Progress } from "@/components/ui";
import { QuestionCard } from "@/components/QuestionCard";
import { celebrate } from "@/components/SessionRunner";
import { clock, pct } from "@/components/format";

type MockState = {
  startedAt: string;
  ids: string[];
  orders: Record<string, string[]>;
  answers: Record<string, string[]>;
  unsure: string[];
  flagged: string[];
  times: Record<string, number>;
  index: number;
};

const kv = createStore("certprep-mock", "kv");
const key = (uid: string) => `${uid}:mock`;

function useMockState() {
  const { snap } = useData();
  const [state, setState] = useState<MockState | null | undefined>(undefined);
  useEffect(() => {
    void get<MockState>(key(snap.userId), kv).then((s) => setState(s ?? null));
  }, [snap.userId]);
  const save = useCallback(
    (s: MockState | null) => {
      setState(s);
      void (s ? set(key(snap.userId), s, kv) : del(key(snap.userId), kv));
    },
    [snap.userId],
  );
  return [state, save] as const;
}

export function MockHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { snap, content } = useData();
  const [state, save] = useMockState();
  const minutes = content.course.minutes;
  const count = Math.min(MOCK_QUESTIONS, content.questions.length);

  const history = useMemo(
    () =>
      Object.values(snap.sessions)
        .filter((s) => s.kind === "mock" && s.completed)
        .sort((a, b) => b.started_at.localeCompare(a.started_at))
        .map((s) => ({ s, pct: s.answered ? s.correct / s.answered : 0 })),
    [snap.sessions],
  );

  const start = () => {
    const ids = planMock(content, count);
    save({
      startedAt: new Date().toISOString(),
      ids,
      orders: Object.fromEntries(ids.map((id) => [id, shuffle(content.byId.get(id)!.choices.map((c) => c.id))])),
      answers: {},
      unsure: [],
      flagged: [],
      times: {},
      index: 0,
    });
    navigate("/mock/run");
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("mock.title")}</CardTitle>
          <CardDescription>{t("mock.intro", { count, minutes })}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {state ? (
            <>
              <Link to="/mock/run" className={buttonVariants({ size: "lg" })}>
                {t("mock.resume")}
              </Link>
              <Button variant="ghost" onClick={() => save(null)}>
                {t("mock.discard")}
              </Button>
            </>
          ) : (
            <Button size="lg" onClick={start} disabled={state === undefined}>
              {t("mock.start")}
            </Button>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("mock.history")}</CardTitle>
        </CardHeader>
        <CardContent>
          {!history.length ? (
            <p className="text-sm text-muted-foreground">{t("mock.noHistory")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {history.map(({ s, pct: p }) => (
                <li key={s.id}>
                  <Link to={`/mock/result/${s.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-primary">
                    <span>{new Date(s.started_at).toLocaleString()}</span>
                    <span className="flex items-center gap-2 tabular-nums">
                      {pct(p)}%<Badge tone={scaledEstimate(p) >= 720 ? "success" : "warning"}>{scaledEstimate(p)}</Badge>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function MockRun() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { snap, content, store } = useData();
  const [state, save] = useMockState();
  const [now, setNow] = useState(Date.now());
  const shownAt = useRef(Date.now());
  const submitted = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const submit = useCallback(
    (s: MockState) => {
      if (submitted.current) return;
      submitted.current = true;
      const started = new Date(s.startedAt);
      const session = store.startSession("mock", content.course.id, { due: 0, new: s.ids.length }, null, started);
      let correct = 0;
      for (const id of s.ids) {
        const q = content.byId.get(id)!;
        const sel = s.answers[id] ?? [];
        const ok = sel.length > 0 && isCorrect(q, sel);
        if (ok) correct++;
        store.recordAnswer({ q, content, selected: sel, correct: ok, confidence: s.unsure.includes(id) || !sel.length ? "unsure" : "sure", mode: "mock", sessionId: session.id, timeMs: s.times[id] ?? 0 });
      }
      store.putSession({ ...session, ended_at: new Date().toISOString(), completed: true, answered: s.ids.length, correct });
      save(null);
      navigate(`/mock/result/${session.id}`, { replace: true });
    },
    [store, content, save, navigate],
  );

  const deadline = state ? new Date(state.startedAt).getTime() + content.course.minutes * MINUTE : 0;
  const left = deadline - now;
  useEffect(() => {
    if (state && left <= 0) submit(state);
  }, [state, left, submit]);

  if (state === undefined || submitted.current) return null; // after submit we're already navigating to the result
  if (state === null) return <Navigate to="/mock" replace />;

  const id = state.ids[state.index];
  const q = content.byId.get(id)!;
  const answeredCount = state.ids.filter((x) => state.answers[x]?.length === content.byId.get(x)!.selectCount).length;

  const go = (index: number) => {
    const spent = Date.now() - shownAt.current;
    shownAt.current = Date.now();
    save({ ...state, index, times: { ...state.times, [id]: (state.times[id] ?? 0) + spent } });
  };
  const toggleIn = (list: string[], x: string) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{t("mock.title")}</h1>
          <p className="text-xs text-muted-foreground">{t("mock.answered", { n: answeredCount, total: state.ids.length })}</p>
        </div>
        <span className={cn("rounded-lg px-2 py-1 font-mono text-sm tabular-nums", left < 10 * MINUTE ? "bg-danger-soft text-danger" : "bg-muted")}>{t("mock.remaining", { time: clock(left) })}</span>
      </div>
      <Progress value={answeredCount / state.ids.length} label={t("mock.answered", { n: answeredCount, total: state.ids.length })} />

      <QuestionCard
        key={id}
        q={q}
        content={content}
        locale={snap.profile.locale}
        englishContent={snap.profile.english_content}
        order={state.orders[id]}
        selected={state.answers[id] ?? []}
        onSelect={(sel) => save({ ...state, answers: { ...state.answers, [id]: sel } })}
        header={<span className="tabular-nums">{state.index + 1} / {state.ids.length}</span>}
      />

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={state.unsure.includes(id)} onChange={() => save({ ...state, unsure: toggleIn(state.unsure, id) })} />
          {t("mock.unsure")}
        </label>
        <Button variant={state.flagged.includes(id) ? "secondary" : "ghost"} size="sm" onClick={() => save({ ...state, flagged: toggleIn(state.flagged, id) })} aria-pressed={state.flagged.includes(id)}>
          <Flag className={cn(state.flagged.includes(id) && "fill-current text-warning")} />
          {t("mock.flag")}
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" disabled={state.index === 0} onClick={() => go(state.index - 1)}>
          <ChevronLeft />
          {t("mock.prev")}
        </Button>
        {state.index < state.ids.length - 1 ? (
          <Button onClick={() => go(state.index + 1)}>
            {t("mock.next")}
            <ChevronRight />
          </Button>
        ) : (
          <Button
            onClick={() => {
              const missing = state.ids.length - answeredCount;
              if (!missing || window.confirm(t("mock.confirmSubmit", { count: missing }))) submit(state);
            }}
          >
            {t("mock.submit")}
          </Button>
        )}
      </div>

      <nav aria-label="Questions" className="grid grid-cols-10 gap-1 sm:grid-cols-13">
        {state.ids.map((x, i) => (
          <button
            key={x}
            onClick={() => go(i)}
            aria-current={i === state.index}
            aria-label={`${i + 1}`}
            className={cn(
              "aspect-square rounded text-[0.65rem] tabular-nums",
              i === state.index ? "bg-primary text-primary-foreground" : state.answers[x]?.length ? "bg-primary/20" : "bg-muted",
              state.flagged.includes(x) && "ring-2 ring-warning",
            )}
          >
            {i + 1}
          </button>
        ))}
      </nav>
      {state.index < state.ids.length - 1 && (
        <Button
          variant="ghost"
          className="self-end"
          onClick={() => {
            const missing = state.ids.length - answeredCount;
            if (!missing || window.confirm(t("mock.confirmSubmit", { count: missing }))) submit(state);
          }}
        >
          {t("mock.submit")}
        </Button>
      )}
    </div>
  );
}

export function MockResult() {
  const { t } = useTranslation();
  const { sessionId } = useParams();
  const { snap, content } = useData();
  const [open, setOpen] = useState<string | null>(null);
  const session = sessionId ? snap.sessions[sessionId] : undefined;
  const attempts = useMemo(() => snap.attempts.filter((a) => a.session_id === sessionId), [snap.attempts, sessionId]);
  const p = attempts.length ? attempts.filter((a) => a.correct).length / attempts.length : 0;
  const score = scaledEstimate(p);
  useEffect(() => {
    if (score >= 720) celebrate();
  }, [score]);

  if (!session) return <Navigate to="/mock" replace />;
  const byDomain = content.course.domains.map((d) => {
    const xs = attempts.filter((a) => a.domain_id === d.id);
    return { d, n: xs.length, acc: xs.length ? xs.filter((a) => a.correct).length / xs.length : 0 };
  });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="items-center text-center">
          <CardDescription>{t("mock.result")}</CardDescription>
          <div className={cn("text-5xl font-semibold tabular-nums", score >= 720 ? "text-success" : "text-warning")}>{pct(p)}%</div>
          <p className="font-medium">{t("mock.estimate", { score })}</p>
          <p className="text-xs text-muted-foreground">{t("mock.estimateHint")}</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">{t("mock.byDomain")}</h3>
          {byDomain.map(({ d, n, acc }) => (
            <div key={d.id} className="flex flex-col gap-1">
              <div className="flex justify-between text-xs">
                <span>{d.title}</span>
                <span className="text-muted-foreground tabular-nums">
                  {pct(acc)}% · {n}
                </span>
              </div>
              <Progress value={acc} label={d.title} barClassName={acc >= 0.72 ? "bg-success" : "bg-warning"} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("mock.reviewAnswers")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-2">
            {attempts.map((a, i) => {
              const q = content.byId.get(a.question_id);
              if (!q) return null;
              const isOpen = open === a.id;
              return (
                <li key={a.id} className="rounded-lg border border-border">
                  <button className="flex w-full items-center gap-2 p-3 text-left text-sm" onClick={() => setOpen(isOpen ? null : a.id)} aria-expanded={isOpen}>
                    <Badge tone={a.correct ? "success" : "danger"}>{i + 1}</Badge>
                    <span className="line-clamp-1 flex-1 text-muted-foreground">{q.stem.replace(/\{\{(t|code):([^}]+)\}\}/g, "$2")}</span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-border p-3">
                      <QuestionCard
                        q={q}
                        content={content}
                        locale={snap.profile.locale}
                        englishContent={snap.profile.english_content}
                        order={q.choices.map((c) => c.id)}
                        reveal={{ correct: a.correct, confidence: a.confidence as "sure" | "unsure", selected: a.selected }}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
