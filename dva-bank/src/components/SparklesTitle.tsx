// Lightweight take on Magic UI's sparkles-text (that component isn't vendored): a heading with a few twinkles.
import { Sparkles } from "lucide-react";

export function SparklesTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="relative inline-flex items-center gap-2 text-xl font-semibold">
      <Sparkles className="size-5 text-accent motion-safe:animate-pulse" aria-hidden />
      {children}
      <Sparkles className="size-4 text-primary motion-safe:animate-pulse [animation-delay:300ms]" aria-hidden />
    </h2>
  );
}
