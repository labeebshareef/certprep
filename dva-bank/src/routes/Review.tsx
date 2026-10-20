import { useMemo } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Flag } from "lucide-react";
import { useData } from "@/state/app";
import { confidentWrongIds, recentWrongIds } from "@/lib/session";
import { LEECH_LAPSES, resetCard } from "@/lib/scheduler";
import { plain } from "@/lib/tokens";
import { Badge, Button, buttonVariants, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { reportUrl } from "@/components/QuestionCard";

export function Review() {
  const { t } = useTranslation();
  const { snap, content, store } = useData();
  const cw = useMemo(() => confidentWrongIds(content, snap.attempts, snap.states), [content, snap.attempts, snap.states]);
  const recent = useMemo(() => recentWrongIds(content, snap.attempts).filter((id) => !cw.includes(id)), [content, snap.attempts, cw]);
  const leeches = useMemo(() => Object.values(snap.states).filter((s) => s.is_leech && content.byId.has(s.question_id)), [snap.states, content]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t("review.title")}</h1>

      <Group title={t("review.confidentWrong")} hint={t("review.confidentWrongHint")} ids={cw} practise="confident-wrong" />
      <Group title={t("review.recentWrong")} ids={recent} practise="recent-wrong" />

      <Card>
        <CardHeader>
          <CardTitle>{t("review.leeches")}</CardTitle>
          <CardDescription>{t("review.leechesHint", { n: LEECH_LAPSES })}</CardDescription>
        </CardHeader>
        <CardContent>
          {!leeches.length ? (
            <p className="text-sm text-muted-foreground">{t("review.none")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {leeches.map((s) => {
                const q = content.byId.get(s.question_id)!;
                return (
                  <li key={s.question_id} className="flex flex-col gap-2 py-3">
                    <p className="line-clamp-2 text-sm">{plain(q.stem)}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="danger">{t("review.lapses", { count: s.lapses })}</Badge>
                      <span className="text-xs text-muted-foreground">{q.id}</span>
                      <span className="flex-1" />
                      <a href={reportUrl(q)} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                        <Flag />
                        {t("common.report")}
                      </a>
                      <Button size="sm" variant="outline" onClick={() => store.putState(resetCard(s, q, new Date()))}>
                        {t("review.reset")}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Group({ title, hint, ids, practise }: { title: string; hint?: string; ids: string[]; practise: string }) {
  const { t } = useTranslation();
  const { content } = useData();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {hint && <CardDescription>{hint}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!ids.length ? (
          <p className="text-sm text-muted-foreground">{t("review.none")}</p>
        ) : (
          <>
            <ul className="flex flex-col gap-1.5">
              {ids.slice(0, 5).map((id) => (
                <li key={id} className="line-clamp-1 text-sm text-muted-foreground">
                  · {plain(content.byId.get(id)!.stem)}
                </li>
              ))}
            </ul>
            <Link to={`/practice?focus=${practise}`} className={buttonVariants({ className: "self-start" })}>
              {t("review.practise", { count: ids.length })}
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
