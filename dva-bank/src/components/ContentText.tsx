// Renders question text with protected terms. Never route content through t()/<Trans>.
import { Fragment, useState } from "react";
import { segments } from "@/lib/tokens";
import type { GlossaryTerm } from "@/lib/content";
import { cn } from "@/lib/utils";

export function ContentText({ text, lang, glossary, className, as: Tag = "span" }: { text: string; lang: string; glossary?: Map<string, GlossaryTerm>; className?: string; as?: "span" | "p" | "div" }) {
  return (
    <Tag lang={lang} className={cn("content-text", className)}>
      {segments(text).map((s, i) => {
        if (s.kind === "text") return <Fragment key={i}>{s.value}</Fragment>;
        if (s.kind === "code")
          return (
            <code key={i} lang="en" dir="ltr" className="inline">
              {s.value}
            </code>
          );
        return <Term key={i} value={s.value} gloss={glossary?.get(s.value)?.gloss} />;
      })}
    </Tag>
  );
}

function Term({ value, gloss }: { value: string; gloss?: string }) {
  const [open, setOpen] = useState(false);
  if (!gloss)
    return (
      <span lang="en" dir="ltr" className="term">
        {value}
      </span>
    );
  return (
    <span className="relative">
      <span
        lang="en"
        dir="ltr"
        className="term"
        data-gloss
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen((o) => !o)}
      >
        {value}
      </span>
      {open && (
        <span role="tooltip" className="absolute top-full left-0 z-10 mt-1 w-max max-w-64 rounded-md border border-border bg-card px-2 py-1 text-xs shadow">
          {gloss}
        </span>
      )}
    </span>
  );
}
