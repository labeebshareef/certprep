import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock, X } from "lucide-react";
import confetti from "canvas-confetti";
import { useData } from "@/state/app";
import { isCorrect } from "@/lib/content";
import { advance, current, startQueue, SOFT_STOP_MS, type PlanItem, type Queue } from "@/lib/session";
import { Rating, type Confidence, type Mode } from "@/lib/scheduler";
import type { SessionRow } from "@/lib/database.types";
import { shuffle, MINUTE } from "@/lib/utils";
import { Badge, Button, Progress } from "@/components/ui";
import { QuestionCard, type Reveal } from "./QuestionCard";
import { relativeTime } from "./format";

export type SessionSummary = { answered: number; correct: number; completed: boolean; reason?: "finished" | "time" | "ended"; firstTryCorrect: number; total: number };

export function SessionRunner({
  kind,
  items,
  sectionId = null,
  relearn,
  timeCaps,
  onDone,
  title,
}: {
  kind: Exclude<Mode, "mock">;
  items: PlanItem[];
  sectionId?: string | null;
  relearn: boolean;
  timeCaps: boolean;
  onDone: (s: SessionSummary) => void;
  title: string;
}) {
  const { t, i18n } = useTranslation();
  const { store, content, snap } = useData();
  const [queue, setQueue] = useState<Queue>(() => startQueue(items));
  const [reveal, setReveal] = useState<(Reveal & { nextDue?: string; leech?: boolean }) | null>(null);
  const [softStopShown, setSoftStopShown] = useState(false);
  const startedAt = useRef(new Date());
  const presentedAt = useRef(Date.now());
  const session = useRef<SessionRow | null>(null);
  const counts = useRef({ answered: 0, correct: 0, firstTry: new Map<string, boolean>() });
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  const item = current(queue);
  const q = item ? content.byId.get(item.qid) : undefined;
  const order = useMemo(() => (q ? shuffle(q.choices.map((c) => c.id)) : []), [q, queue.index]); // reshuffled on every presentation
  useEffect(() => {
    presentedAt.current = Date.now();
  }, [queue.index]);

  const elapsed = () => Date.now() - startedAt.current.getTime();

  const finish = (completed: boolean, reason: SessionSummary["reason"]) => {
    if (session.current) {
      session.current = { ...session.current, ended_at: new Date().toISOString(), completed };
      store.putSession(session.current);
    }
    const firstTryCorrect = [...counts.current.firstTry.values()].filter(Boolean).length;
    onDone({ answered: counts.current.answered, correct: counts.current.correct, completed, reason, firstTryCorrect, total: counts.current.firstTry.size });
  };

  const submit = (selected: string[], confidence: Confidence) => {
    if (!q || !item) return;
    if (!session.current) {
      session.current = store.startSession(kind, content.course.id, { due: items.filter((i) => i.kind === "due").length, new: items.filter((i) => i.kind === "new").length }, sectionId, startedAt.current);
    }
    const correct = isCorrect(q, selected);
    const res = store.recordAnswer({ q, content, selected, correct, confidence, mode: kind, sessionId: session.current.id, timeMs: Date.now() - presentedAt.current });
    counts.current.answered++;
    if (correct) counts.current.correct++;
    if (!counts.current.firstTry.has(q.id)) counts.current.firstTry.set(q.id, correct);
    session.current = { ...session.current, answered: counts.current.answered, correct: counts.current.correct };
    store.putSession(session.current);

    let note: string | undefined;
    if (!correct && confidence === "sure") note = t("study.confidentWrongNote");
    else if (correct && res.rating === Rating.Hard) note = t("study.luckyNote");
    setReveal({ correct, confidence, selected, note, nextDue: res.state.due, leech: res.state.is_leech && !res.prev.is_leech });
  };

  const next = () => {
    if (!reveal) return;
    const r = advance(queue, { wrong: !reveal.correct, relearn, elapsedMs: timeCaps ? elapsed() : 0 });
    setReveal(null);
    if (timeCaps && elapsed() >= SOFT_STOP_MS && !softStopShown) setSoftStopShown(true);
    if (r.done) {
      setQueue(r.queue);
      finish(true, r.reason);
      return;
    }
    setQueue(r.queue);
  };

  useEffect(() => {
    if (!reveal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "n" || e.key === "N") {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!q || !item) return null;
  const total = queue.items.length;
  const kindLabel = item.kind === "due" ? t("study.kindDue") : item.kind === "new" ? t("study.kindNew") : t("study.kindRelearn");
  const section = content.sectionOf.get(q.id);
  const mins = Math.floor(elapsed() / MINUTE);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">{title}</h1>
          <p className="text-xs text-muted-foreground">{t("study.progress", { n: Math.min(queue.index + 1, total), total })}</p>
        </div>
        <div className="flex items-center gap-2">
          {timeCaps && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
              <Clock className="size-3.5" />
              {t("common.minutes", { count: mins })}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={() => finish(false, "ended")} aria-label={t("study.end")}>
            <X />
            <span className="hidden sm:inline">{t("study.end")}</span>
          </Button>
        </div>
      </div>
      <Progress value={queue.index / Math.max(1, total)} label={t("study.progress", { n: queue.index + 1, total })} />
      {softStopShown && <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">{t("study.softStop")}</p>}

      <QuestionCard
        key={`${queue.index}-${q.id}`}
        q={q}
        content={content}
        locale={snap.profile.locale}
        englishContent={snap.profile.english_content}
        order={order}
        reveal={reveal}
        onSubmit={submit}
        keyboard
        header={
          <>
            <Badge tone={item.kind === "new" ? "primary" : item.kind === "relearn" ? "warning" : "neutral"}>{kindLabel}</Badge>
            {section && <span>{section.title}</span>}
            {q.taskId && <span>· Task {q.taskId}</span>}
          </>
        }
        footer={
          <div className="flex flex-col gap-3">
            {reveal?.leech && <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">{t("study.leech")}</p>}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">{reveal?.nextDue && t("study.nextIn", { when: relativeTime(reveal.nextDue, i18n.language) })}</span>
              <Button onClick={next} autoFocus>
                {queue.index + 1 >= total && (reveal?.correct || !relearn) ? t("study.finish") : t("study.next")}
              </Button>
            </div>
          </div>
        }
      />
    </div>
  );
}

export function celebrate() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  void confetti({ particleCount: 90, spread: 70, origin: { y: 0.7 }, disableForReducedMotion: true });
}
