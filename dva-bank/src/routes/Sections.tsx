import { useMemo } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Lock } from "lucide-react";
import { useData } from "@/state/app";
import { isPassed, unlockedSections } from "@/lib/session";
import { State } from "@/lib/scheduler";
import { cn } from "@/lib/utils";
import { Badge, buttonVariants, Card, Progress } from "@/components/ui";
import { BorderBeam } from "@/components/magicui/border-beam";
import { pct } from "@/components/format";

export function Sections() {
  const { t } = useTranslation();
  const { snap, content } = useData();
  const unlocked = useMemo(() => new Set(unlockedSections(content, snap.progress).map((s) => s.id)), [content, snap.progress]);
  const frontier = content.course.sections.find((s) => unlocked.has(s.id) && !isPassed(snap.progress[s.id]))?.id;
  const passPct = pct(content.course.sections[0]?.unlock.passPct ?? 0.8);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{t("sections.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("sections.subtitle", { pct: passPct })}</p>
      </div>
      <ol className="flex flex-col gap-3">
        {content.course.sections.map((s) => {
          const qs = content.questions.filter((q) => content.sectionOf.get(q.id)?.id === s.id);
          const seen = qs.filter((q) => snap.states[q.id] && snap.states[q.id].state !== State.New).length;
          const prog = snap.progress[s.id];
          const open = unlocked.has(s.id);
          const passed = isPassed(prog);
          const prev = content.course.sections.find((x) => s.unlock.requires.includes(x.id));
          const domain = content.course.domains.find((d) => d.id === s.domainId);
          return (
            <li key={s.id}>
              <Card className={cn("relative overflow-hidden p-4", !open && "opacity-60")}>
                {s.id === frontier && <BorderBeam size={80} duration={8} colorFrom="var(--primary)" colorTo="var(--accent)" />}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">
                      {s.order}. {domain?.title}
                    </p>
                    <h2 className="font-semibold">{s.title}</h2>
                  </div>
                  {passed ? (
                    <Badge tone="success">
                      <CheckCircle2 className="size-3.5" />
                      {t("sections.passed")}
                    </Badge>
                  ) : !open ? (
                    <Badge>
                      <Lock className="size-3.5" />
                      {t("sections.locked")}
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-col gap-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t("sections.seen", { seen, total: qs.length })}</span>
                    {prog && <span>{t("sections.best", { pct: pct(prog.best_pct) })}</span>}
                  </div>
                  <Progress value={seen / Math.max(1, qs.length)} label={s.title} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  {!open && prev ? <span className="text-xs text-muted-foreground">{t("sections.unlockHint", { prev: prev.title })}</span> : <span />}
                  {open && (
                    <Link to={`/quiz/${s.id}`} className={buttonVariants({ size: "sm", variant: passed ? "outline" : "default" })}>
                      {passed ? t("sections.retake") : t("sections.quiz")}
                    </Link>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
