import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, LogOut, RefreshCw, Wrench } from "lucide-react";
import { useData } from "@/state/app";
import { supabase } from "@/lib/supabase";
import { replay } from "@/lib/scheduler";
import type { ReviewStateRow } from "@/lib/database.types";
import { LOCALES } from "@/i18n";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Select, Switch } from "@/components/ui";
import { relativeTime } from "@/components/format";

// long translated labels (Malayalam) must wrap instead of overflowing the card
const wrapBtn = "h-auto min-h-10 whitespace-normal py-2 text-left";

export function Settings() {
  const { t, i18n } = useTranslation();
  const { snap, store, content, email, syncNow, sync } = useData();
  const p = snap.profile;
  const [msg, setMsg] = useState<string | null>(null);
  const zones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return [p.timezone];
    }
  }, [p.timezone]);

  const rebuild = () => {
    const byQ = new Map<string, typeof snap.attempts>();
    for (const a of snap.attempts) byQ.set(a.question_id, [...(byQ.get(a.question_id) ?? []), a]);
    const states: Record<string, ReviewStateRow> = { ...snap.states };
    const keys: string[] = [];
    for (const [qid, list] of byQ) {
      const q = content.byId.get(qid);
      if (!q) continue;
      const s = replay(snap.userId, q, content.course.id, list, p.desired_retention);
      if (!s) continue;
      states[qid] = s;
      keys.push(`state:${qid}`);
    }
    store.update({ states }, ["states"], keys);
    setMsg(t("settings.rebuildDone", { count: keys.length }));
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...snap, outbox: undefined }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `certprep-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t("settings.title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.study")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Row label={t("settings.newPerDay")} htmlFor="npd">
            <Select id="npd" value={p.new_per_day} onChange={(e) => store.updateProfile({ new_per_day: +e.target.value })}>
              {[0, 5, 8, 10, 12, 15, 20].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Row>
          <Row label={t("settings.goal")} htmlFor="goal">
            <Select id="goal" value={p.daily_goal_min} onChange={(e) => store.updateProfile({ daily_goal_min: +e.target.value })}>
              {[10, 15, 20, 25, 30, 45, 60].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Row>
          <Row label={t("settings.retention")} hint={t("settings.retentionHint")} htmlFor="ret">
            <Select id="ret" value={p.desired_retention.toFixed(2)} onChange={(e) => store.updateProfile({ desired_retention: +e.target.value })}>
              {["0.85", "0.88", "0.90", "0.92", "0.95"].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Row>
          <Row label={t("settings.timezone")} htmlFor="tz">
            <Select id="tz" className="max-w-48" value={p.timezone} onChange={(e) => store.updateProfile({ timezone: e.target.value })}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
          </Row>
          <Row label={t("settings.rollover")} htmlFor="roll">
            <Select id="roll" value={p.day_rollover_hour} onChange={(e) => store.updateProfile({ day_rollover_hour: +e.target.value })}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </Select>
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.language")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Row label={t("settings.locale")} htmlFor="loc">
            <Select id="loc" value={p.locale} onChange={(e) => store.updateProfile({ locale: e.target.value })}>
              {LOCALES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Row>
          <Row label={t("settings.english")} hint={t("settings.englishHint")} htmlFor="eng">
            <Switch id="eng" label={t("settings.english")} checked={p.english_content} onChange={(v) => store.updateProfile({ english_content: v })} />
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.data")}</CardTitle>
          <CardDescription>
            {sync.state === "error"
              ? t("common.syncError", { message: sync.error })
              : t("common.synced", { when: snap.lastSyncAt ? relativeTime(snap.lastSyncAt, i18n.language) : t("common.never") })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" className={wrapBtn} onClick={() => void syncNow()} disabled={sync.state === "syncing"}>
            <RefreshCw />
            {t("settings.syncNow")}
          </Button>
          <Button variant="outline" className={wrapBtn} onClick={rebuild}>
            <Wrench />
            {t("settings.rebuild")}
          </Button>
          <Button variant="outline" className={wrapBtn} onClick={exportData}>
            <Download />
            {t("settings.exportData")}
          </Button>
          {msg && <p className="w-full text-sm text-success">{msg}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.account")}</CardTitle>
          <CardDescription>{t("settings.signedInAs", { email })}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={async () => {
              await syncNow();
              await supabase.auth.signOut();
            }}
          >
            <LogOut />
            {t("settings.signOut")}
          </Button>
        </CardContent>
      </Card>

      <p className="px-1 text-xs text-muted-foreground">
        {t("settings.aboutText", { course: content.course.title, count: content.questions.length, status: content.course.examGuideStatus })} · v{__APP_VERSION__}
      </p>
    </div>
  );
}

function Row({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}
