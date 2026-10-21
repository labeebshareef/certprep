import { lazy, Suspense, useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Flame, Snowflake, Target } from "lucide-react";
import { useData } from "@/state/app";
import { planDaily, confidentWrongIds } from "@/lib/session";
import { calibration, dailyActivity, domainStats, forecast, readiness, streak } from "@/lib/stats";
import { clockOf } from "@/lib/store";
import { addDays, localDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Progress } from "@/components/ui";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { AnimatedCircularProgressBar } from "@/components/magicui/animated-circular-progress-bar";
import { ShimmerButton } from "@/components/magicui/shimmer-button";
import { BlurFade } from "@/components/magicui/blur-fade";
import { pct } from "@/components/format";

const ForecastChart = lazy(() => import("@/components/ForecastChart"));

export function Home() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { snap, content } = useData();
  const now = useMemo(() => new Date(), [snap]);
  const clock = clockOf(snap.profile);
  const today = localDate(now, clock);

  const d = useMemo(() => {
    const plan = planDaily({ content, states: snap.states, progress: snap.progress, attempts: snap.attempts, newPerDay: snap.profile.new_per_day, retention: snap.profile.desired_retention, clock, now });
    const activity = dailyActivity(snap.attempts, snap.sessions, snap.profile.daily_goal_min, snap.userId);
    const domains = domainStats(content, snap.attempts, now);
    return {
      plan,
      activity,
      streak: streak(activity, today),
      domains,
      readiness: readiness(domains),
      calibration: calibration(snap.attempts),
      forecast: forecast(snap.states, now, clock, 7),
      cw: confidentWrongIds(content, snap.attempts, snap.states).length,
    };
  }, [snap, content, now, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const todayRow = d.activity.get(today);
  const minutes = Math.round(todayRow?.minutes ?? 0);
  const goal = snap.profile.daily_goal_min;
  const score = Math.round(d.readiness * 1000);
  const dayFmt = new Intl.DateTimeFormat(i18n.language, { weekday: "short" });

  return (
    <div className="flex flex-col gap-4">
      <BlurFade>
        <Card className="overflow-hidden">
          <CardHeader>
            <CardDescription>{t("home.greeting")}</CardDescription>
            <div className="grid grid-cols-2 gap-4 pt-1">
              <Stat label={t("home.due")} value={d.plan.due} />
              <Stat label={t("home.newToday")} value={d.plan.fresh} />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {d.plan.items.length ? (
              <ShimmerButton className="h-12 w-full text-base font-medium" background="var(--primary)" shimmerColor="#ffffff" borderRadius="0.75rem" onClick={() => navigate("/study")}>
                <span className="text-primary-foreground">{t("home.start")}</span>
              </ShimmerButton>
            ) : (
              <p className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success">
                {t("home.allDone")}{" "}
                <Link to="/sections" className="underline">
                  {t("nav.sections")}
                </Link>
              </p>
            )}
            {d.plan.loadBalanced && <p className="text-xs text-muted-foreground">{t("home.loadBalanced")}</p>}
          </CardContent>
        </Card>
      </BlurFade>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <Flame className={cn("size-4", d.streak.todayDone ? "text-accent" : "text-muted-foreground")} />
              {t("home.streak")}
            </CardDescription>
            <div className="text-3xl font-semibold tabular-nums">
              <NumberTicker value={d.streak.current} className="text-foreground dark:text-foreground" />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-xs text-muted-foreground">
            <span>{t("home.longest", { count: d.streak.longest })}</span>
            {d.streak.freezes > 0 && (
              <span className="inline-flex items-center gap-1">
                <Snowflake className="size-3.5 text-primary" />
                {t("home.freezes", { count: d.streak.freezes })}
              </span>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <Target className="size-4" />
              {t("home.goal")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <AnimatedCircularProgressBar value={Math.min(minutes, goal)} max={goal} gaugePrimaryColor="var(--success)" gaugeSecondaryColor="var(--muted)" className="size-16 text-sm" />
            <span className="text-xs text-muted-foreground">{t("home.goalOf", { done: minutes, goal })}</span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("home.readiness")}</CardTitle>
          <CardDescription>{t("home.readinessHint")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-end gap-2">
            <span className={cn("text-4xl font-semibold tabular-nums", score >= 850 ? "text-success" : score >= 720 ? "text-warning" : "text-foreground")}>
              <NumberTicker value={score} className="text-inherit dark:text-inherit" />
            </span>
            <span className="pb-1 text-sm text-muted-foreground">/ 1000</span>
          </div>
          <div className="relative">
            <Progress value={d.readiness} label={t("home.readiness")} barClassName={score >= 850 ? "bg-success" : score >= 720 ? "bg-warning" : "bg-primary"} />
            <span className="absolute -top-1 h-4 w-0.5 bg-foreground/60" style={{ left: "72%" }} title="720" aria-hidden />
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">{t("home.domains")}</h3>
            {d.domains.map((dm) => (
              <div key={dm.id} className="flex flex-col gap-1">
                <div className="flex justify-between gap-2 text-xs">
                  <span className="truncate">
                    {dm.title} <span className="text-muted-foreground">· {pct(dm.weight)}%</span>
                  </span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {dm.seen ? `${pct(dm.mastery)}%` : "—"} · {t("home.coverage", { seen: dm.seen, bank: dm.bank })}
                  </span>
                </div>
                <Progress value={dm.mastery * dm.coverage} label={dm.title} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("home.calibration")}</CardTitle>
            <CardDescription>{t("home.calibrationHint")}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-2 text-center">
            <Mini label={t("home.whenSure")} value={d.calibration.sure.n ? `${pct(d.calibration.sure.acc)}%` : "—"} />
            <Mini label={t("home.whenUnsure")} value={d.calibration.unsure.n ? `${pct(d.calibration.unsure.acc)}%` : "—"} />
            <Mini label={t("home.confidentWrong")} value={d.calibration.sure.n + d.calibration.unsure.n ? `${pct(d.calibration.confidentWrongRate)}%` : "—"} />
          </CardContent>
          {d.cw > 0 && (
            <CardContent>
              <Link to="/review" className="text-sm text-primary hover:underline">
                {t("home.weakSpots")} ({d.cw}) →
              </Link>
            </CardContent>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("home.forecast")}</CardTitle>
          </CardHeader>
          <CardContent className="h-36">
            <Suspense fallback={null}>
              <ForecastChart data={d.forecast.map((f) => ({ ...f, label: dayFmt.format(new Date(`${f.date}T12:00:00Z`)) }))} />
            </Suspense>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("home.activity")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Heatmap today={today} activity={d.activity} frozen={new Set(d.streak.frozenDays)} />
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-4xl font-semibold tabular-nums">
        <NumberTicker value={value} className="text-foreground dark:text-foreground" />
      </div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted p-2">
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[0.7rem] leading-tight text-muted-foreground">{label}</div>
    </div>
  );
}

function Heatmap({ today, activity, frozen }: { today: string; activity: Map<string, { answered: number }>; frozen: Set<string> }) {
  const weeks = 12;
  // columns are weeks ending with the current one; rows are days oldest→newest within the week
  const start = addDays(today, -(weeks * 7 - 1));
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
  const level = (n: number) => (n === 0 ? 0 : n < 5 ? 1 : n < 15 ? 2 : n < 30 ? 3 : 4);
  const shades = ["bg-muted", "bg-primary/25", "bg-primary/50", "bg-primary/75", "bg-primary"];
  return (
    <div className="grid grid-flow-col grid-rows-7 gap-1" style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}>
      {days.map((d) => {
        const n = activity.get(d)?.answered ?? 0;
        return (
          <div
            key={d}
            title={`${d}: ${n}${frozen.has(d) ? " ❄" : ""}`}
            className={cn("aspect-square rounded-[3px]", frozen.has(d) ? "bg-sky-300/60" : shades[level(n)], d === today && "ring-1 ring-foreground/50")}
          />
        );
      })}
    </div>
  );
}
