import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Mail } from "lucide-react";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Spinner } from "@/components/ui";
import { DotPattern } from "@/components/magicui/dot-pattern";
import { BlurFade } from "@/components/magicui/blur-fade";

export function Login() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin, shouldCreateUser: true } });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" });
    setBusy(false);
    if (error) setError(error.message);
  };

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-4">
      <DotPattern className="text-muted-foreground/20 [mask-image:radial-gradient(420px_circle_at_center,white,transparent)]" />
      <BlurFade className="relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <img src="/favicon.svg" alt="" className="size-12" />
          <h1 className="text-2xl font-semibold">{t("app.name")}</h1>
          <p className="text-sm text-muted-foreground">{t("app.tagline")}</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t("login.title")}</CardTitle>
            <CardDescription>{sent ? t("login.sent", { email }) : t("login.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            {!supabaseConfigured ? (
              <p className="text-sm text-danger">{t("login.notConfigured")}</p>
            ) : !sent ? (
              <form onSubmit={send} className="flex flex-col gap-3">
                <label className="text-sm font-medium" htmlFor="email">
                  {t("login.email")}
                </label>
                <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                <Button type="submit" size="lg" disabled={busy || !email}>
                  {busy ? <Spinner /> : <Mail />}
                  {t("login.send")}
                </Button>
              </form>
            ) : (
              <form onSubmit={verify} className="flex flex-col gap-3">
                <label className="text-sm font-medium" htmlFor="code">
                  {t("login.code")}
                </label>
                <Input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" value={code} onChange={(e) => setCode(e.target.value)} className="tracking-[0.3em] tabular-nums" />
                <Button type="submit" size="lg" disabled={busy || code.trim().length < 6}>
                  {busy && <Spinner />}
                  {t("login.verify")}
                </Button>
                <Button type="button" variant="link" onClick={() => setSent(false)}>
                  {t("login.otherEmail")}
                </Button>
              </form>
            )}
            {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
          </CardContent>
        </Card>
      </BlurFade>
    </div>
  );
}
