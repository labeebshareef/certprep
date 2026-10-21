import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { PartyPopper } from "lucide-react";
import { useData } from "@/state/app";
import { confidentWrongIds, planDaily, planQuiz, recentWrongIds, unlockedSections, type PlanItem } from "@/lib/session";
import { clockOf } from "@/lib/store";
import { Button, buttonVariants, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { SessionRunner, celebrate, type SessionSummary } from "@/components/SessionRunner";
import { SparklesTitle } from "@/components/SparklesTitle";
import { pct } from "@/components/format";

export function Study() {
  const { t } = useTranslation();
  const { snap, content } = useData();
  const [run, setRun] = useState(0);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  // freeze the plan when the session starts; later answers must not reshuffle it
  const plan = useMemo(
    () =>
      planDaily({
        content,
        states: snap.states,
        progress: snap.progress,
        attempts: snap.attempts,
        newPerDay: snap.profile.new_per_day,
        retention: snap.profile.desired_retention,
        clock: clockOf(snap.profile),
        now: new Date(),
      }),
    [run, content], // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (summary)
    return (
      <Summary
        summary={summary}
        title={t("study.summary")}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setSummary(null);
                setRun((r) => r + 1);
              }}
            >
              {t("study.again")}
            </Button>
            <Link to="/" className={buttonVariants()}>
              {t("study.home")}
            </Link>
          </>
        }
      />
    );

  if (!plan.items.length) return <Empty />;
  return <SessionRunner key={run} kind="daily" items={plan.items} relearn timeCaps title={t("study.title")} onDone={setSummary} />;
}

export function Quiz() {
  const { t } = useTranslation();
  const { sectionId } = useParams();
  const { snap, content, store } = useData();
  const [run, setRun] = useState(0);
  const [result, setResult] = useState<{ summary: SessionSummary; pct: number; passed: boolean } | null>(null);
  const section = content.course.sections.find((s) => s.id === sectionId);
  const unlocked = useMemo(() => unlockedSections(content, snap.progress), [content, snap.progress]);
  const ids = useMemo(() => (section ? planQuiz(content, section) : []), [section, content, run]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (result?.passed) celebrate();
  }, [result]);

  if (!section || !unlocked.some((s) => s.id === section.id)) return <Navigate to="/sections" replace />;

  if (result) {
    const nextSection = content.course.sections.find((s) => s.unlock.requires.includes(section.id));
    const msg = result.passed
      ? nextSection
        ? t("study.quizPassed", { next: nextSection.title })
        : t("study.quizPassedLast")
      : t("study.quizFailed", { pct: pct(result.pct), need: pct(section.unlock.passPct) });
    return (
      <Summary
        summary={result.summary}
        title={`${section.title} — ${pct(result.pct)}%`}
        message={msg}
        good={result.passed}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setResult(null);
                setRun((r) => r + 1);
              }}
            >
              {t("study.retake")}
            </Button>
            <Link to="/sections" className={buttonVariants()}>
              {t("nav.sections")}
            </Link>
          </>
        }
      />
    );
  }

  return (
    <SessionRunner
      key={run}
      kind="section_quiz"
      sectionId={section.id}
      items={ids.map((qid) => ({ qid, kind: snap.states[qid] ? "due" : "new" }) as PlanItem)}
      relearn={false}
      timeCaps={false}
      title={`${t("study.sectionQuiz")}: ${section.title}`}
      onDone={(summary) => {
        // only a fully answered quiz counts toward the gate
        if (summary.total < ids.length) {
          setResult({ summary, pct: summary.total ? summary.firstTryCorrect / summary.total : 0, passed: false });
          return;
        }
        const p = summary.firstTryCorrect / ids.length;
        store.recordQuiz(content.course.id, section.id, p, section.unlock.passPct);
        setResult({ summary, pct: p, passed: p >= section.unlock.passPct });
      }}
    />
  );
}

export function Practice() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const { snap, content } = useData();
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const focus = params.get("focus");
  const ids = useMemo(() => {
    if (focus === "confident-wrong") return confidentWrongIds(content, snap.attempts, snap.states);
    if (focus === "recent-wrong") return recentWrongIds(content, snap.attempts);
    return (params.get("ids") ?? "").split(",").filter((id) => content.byId.has(id));
  }, [focus, content]); // eslint-disable-line react-hooks/exhaustive-deps

  if (summary)
    return (
      <Summary
        summary={summary}
        title={t("study.summary")}
        actions={
          <Link to="/review" className={buttonVariants()}>
            {t("nav.review")}
          </Link>
        }
      />
    );
  if (!ids.length) return <Empty />;
  return <SessionRunner kind="review" items={ids.map((qid) => ({ qid, kind: "due" }))} relearn timeCaps={false} title={t("study.reviewSession")} onDone={setSummary} />;
}

function Empty() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("study.empty")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Link to="/sections" className={buttonVariants({ variant: "outline" })}>
          {t("nav.sections")}
        </Link>
        <Link to="/" className={buttonVariants()}>
          {t("study.home")}
        </Link>
      </CardContent>
    </Card>
  );
}

function Summary({ summary, title, message, good, actions }: { summary: SessionSummary; title: string; message?: string; good?: boolean; actions: React.ReactNode }) {
  const { t } = useTranslation();
  useEffect(() => {
    if (summary.completed && good !== false) celebrate();
  }, [summary.completed, good]);
  return (
    <Card>
      <CardHeader className="items-center text-center">
        <PartyPopper className="size-8 text-accent" />
        {summary.completed && good !== false ? <SparklesTitle>{title}</SparklesTitle> : <CardTitle className="text-xl">{title}</CardTitle>}
        <p className="text-muted-foreground">{t("study.summaryStats", { correct: summary.correct, answered: summary.answered })}</p>
        {summary.reason === "time" && <p className="text-sm text-warning">{t("study.timeUp")}</p>}
        {message && <p className={good ? "text-success" : "text-warning"}>{message}</p>}
      </CardHeader>
      <CardContent className="flex flex-wrap justify-center gap-2">{actions}</CardContent>
    </Card>
  );
}
