import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ExternalLink, Flag, Languages, X } from "lucide-react";
import { localize, type LoadedCourse, type QuestionT } from "@/lib/content";
import type { Confidence } from "@/lib/scheduler";
import { plain } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import { Badge, Button } from "@/components/ui";
import { ContentText } from "./ContentText";

export const REPO_ISSUES = "https://github.com/labeebshareef/certprep/issues/new";

export function reportUrl(q: QuestionT) {
  const title = `Question ${q.id}: `;
  const body = `**Question:** \`${q.id}\` (revision ${q.revision}, ${q.contentHash?.slice(0, 15)})\n\n> ${plain(q.stem)}\n\n**What's wrong?**\n\n`;
  return `${REPO_ISSUES}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=content`;
}

export type Reveal = { correct: boolean; confidence: Confidence; selected: string[]; note?: string };

const LETTERS = "ABCDEF";

export function QuestionCard(props: {
  q: QuestionT;
  content: LoadedCourse;
  locale: string;
  englishContent: boolean;
  order: string[]; // displayed choice ids
  reveal?: Reveal | null;
  /** practice: submit with confidence. Omit for mock mode. */
  onSubmit?: (selected: string[], confidence: Confidence) => void;
  /** mock mode: controlled selection */
  selected?: string[];
  onSelect?: (selected: string[]) => void;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  keyboard?: boolean;
}) {
  const { t } = useTranslation();
  const { q, content, reveal } = props;
  const [forceEnglish, setForceEnglish] = useState(false);
  const [localSel, setLocalSel] = useState<string[]>([]);
  const controlled = props.selected !== undefined;
  const selected = controlled ? props.selected! : reveal ? reveal.selected : localSel;
  const L = useMemo(() => localize(q, props.locale, content.overlays, props.englishContent || forceEnglish), [q, props.locale, content.overlays, props.englishContent, forceEnglish]);
  const canTranslate = props.locale !== "en" && !props.englishContent && !!content.overlays[props.locale]?.[q.id];

  useEffect(() => {
    setLocalSel([]);
    setForceEnglish(false);
  }, [q.id]);

  const toggle = (id: string) => {
    if (reveal) return;
    let next: string[];
    if (q.type === "single") next = [id];
    else if (selected.includes(id)) next = selected.filter((x) => x !== id);
    else if (selected.length < q.selectCount) next = [...selected, id];
    else return;
    if (controlled) props.onSelect?.(next);
    else setLocalSel(next);
  };

  const ready = selected.length === q.selectCount;
  const submit = (c: Confidence) => ready && !reveal && props.onSubmit?.(selected, c);

  useEffect(() => {
    if (!props.keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.closest("input,textarea,select")) return;
      const k = e.key.toLowerCase();
      const pos = "abcdef".indexOf(k);
      if (pos >= 0 && pos < props.order.length) {
        e.preventDefault();
        toggle(props.order[pos]);
      } else if (k === "s" && props.onSubmit) submit("sure");
      else if (k === "u" && props.onSubmit) submit("unsure");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <article className="flex flex-col gap-4" aria-labelledby={`stem-${q.id}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {props.header}
        {L.fallback && (
          <Badge title={t("study.englishOnlyHint")} tone="neutral">
            {t("study.englishOnly")}
          </Badge>
        )}
        {canTranslate && (
          <button className="inline-flex items-center gap-1 underline-offset-2 hover:underline" onClick={() => setForceEnglish((v) => !v)}>
            <Languages className="size-3.5" />
            {forceEnglish ? t("study.showTranslation") : t("study.showEnglish")}
          </button>
        )}
      </div>

      <ContentText as="p" text={L.stem} lang={L.lang} glossary={content.glossary} className="text-[1.05rem] leading-relaxed font-medium" />
      <span id={`stem-${q.id}`} className="sr-only">
        {plain(L.stem)}
      </span>

      <p className="text-sm text-muted-foreground">{q.type === "single" ? t("study.chooseOne") : t("study.chooseN", { count: q.selectCount })}</p>

      <ul className="flex flex-col gap-2" role={q.type === "single" ? "radiogroup" : "group"}>
        {props.order.map((cid, i) => {
          const choice = q.choices.find((c) => c.id === cid)!;
          const isSel = selected.includes(cid);
          const state = reveal ? (choice.correct ? "correct" : isSel ? "wrong" : "idle") : isSel ? "selected" : "idle";
          return (
            <li key={cid}>
              <button
                type="button"
                role={q.type === "single" ? "radio" : "checkbox"}
                aria-checked={isSel}
                disabled={!!reveal}
                onClick={() => toggle(cid)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-default",
                  state === "idle" && "border-border bg-card hover:border-primary/50",
                  state === "selected" && "border-primary bg-primary/10 ring-1 ring-primary",
                  state === "correct" && "border-success bg-success-soft",
                  state === "wrong" && "border-danger bg-danger-soft",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border text-xs font-semibold",
                    state === "selected" ? "border-primary bg-primary text-primary-foreground" : "border-border",
                    state === "correct" && "border-success bg-success text-white",
                    state === "wrong" && "border-danger bg-danger text-white",
                  )}
                  aria-hidden
                >
                  {state === "correct" ? <Check className="size-3.5" /> : state === "wrong" ? <X className="size-3.5" /> : LETTERS[i]}
                </span>
                <span className="flex min-w-0 flex-col gap-1.5">
                  <ContentText text={L.choices[cid].text} lang={L.lang} glossary={content.glossary} />
                  {reveal && (
                    <ContentText text={L.choices[cid].explanation} lang={L.lang} glossary={content.glossary} className="text-sm text-muted-foreground" />
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {props.onSubmit && !reveal && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <Button size="lg" disabled={!ready} onClick={() => submit("sure")}>
              {t("study.sure")}
            </Button>
            <Button size="lg" variant="outline" disabled={!ready} onClick={() => submit("unsure")}>
              {t("study.unsure")}
            </Button>
          </div>
          {props.keyboard && <p className="hidden text-center text-xs text-muted-foreground sm:block">{t("study.shortcutHint")}</p>}
        </div>
      )}

      {reveal && (
        <section className={cn("flex flex-col gap-3 rounded-xl border p-4", reveal.correct ? "border-success/40" : "border-danger/40")} aria-live="polite">
          <div className="flex items-center gap-2 font-semibold">
            {reveal.correct ? <Check className="size-5 text-success" /> : <X className="size-5 text-danger" />}
            {reveal.correct ? t("study.correct") : t("study.incorrect")}
          </div>
          {reveal.note && <p className="text-sm text-muted-foreground">{reveal.note}</p>}
          <div>
            <h3 className="mb-1 text-sm font-semibold">{t("study.explanation")}</h3>
            <ContentText as="p" text={L.explanation} lang={L.lang} glossary={content.glossary} className="text-sm" />
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold">{t("study.references")}</h3>
            <ul className="flex flex-col gap-1 text-sm">
              {q.references.map((r) => (
                <li key={r.url}>
                  <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                    {r.title}
                    <ExternalLink className="size-3" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            {!q.meta.reviewed ? <span>{t("common.unreviewed")}</span> : <span />}
            <a href={reportUrl(q)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
              <Flag className="size-3" />
              {t("common.report")}
            </a>
          </div>
          {props.footer}
        </section>
      )}
    </article>
  );
}
