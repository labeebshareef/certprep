import type { Page, Request } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const USER_ID = "11111111-2222-3333-4444-555555555555";
const STORAGE_KEY = "sb-test-project-auth-token";

type Choice = { id: string; text: string; correct: boolean };
type Q = { id: string; stem: string; choices: Choice[]; type: string };

const plain = (s: string) => s.replace(/\{\{(t|code):([^{}]+)\}\}/g, "$2");

/** All questions, keyed by the rendered (token-stripped) stem. */
export function bank(): Map<string, Q> {
  const dir = join(import.meta.dirname, "..", "content", "dva-c03", "topics");
  const m = new Map<string, Q>();
  for (const f of readdirSync(dir)) for (const q of JSON.parse(readFileSync(join(dir, f), "utf8")).questions as Q[]) m.set(plain(q.stem).trim(), q);
  return m;
}

/** Fake a signed-in Supabase session and stub every Supabase HTTP call. Returns the recorded writes. */
export async function signIn(page: Page) {
  const writes: { table: string; method: string; headers: Record<string, string>; body: unknown }[] = [];
  const session = {
    access_token: "e2e-token",
    refresh_token: "e2e-refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: USER_ID, aud: "authenticated", role: "authenticated", email: "e2e@example.com", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  };
  await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify(session)] as const);
  await page.route("https://test-project.supabase.co/**", async (route) => {
    const req: Request = route.request();
    const url = new URL(req.url());
    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.split("/").pop()!;
      if (req.method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      writes.push({ table, method: req.method(), headers: req.headers(), body: req.postDataJSON() });
      return route.fulfill({ status: 201, contentType: "application/json", body: "" });
    }
    if (url.pathname.startsWith("/auth/v1/user")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session.user) });
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  return writes;
}

/** Answers the visible question: correctly when `right`, otherwise picks a wrong option. */
export async function answer(page: Page, questions: Map<string, Q>, right: boolean, confidence: "sure" | "unsure" = "sure") {
  const stemText = (await page.locator("article p").first().innerText()).trim();
  const q = questions.get(stemText);
  if (!q) throw new Error(`stem not found in bank: ${stemText.slice(0, 80)}`);
  const options = page.locator("article ul button[role=radio], article ul button[role=checkbox]");
  const n = await options.count();
  const want = q.choices.filter((c) => c.correct).map((c) => plain(c.text).trim());
  const picks: number[] = [];
  for (let i = 0; i < n; i++) {
    const text = (await options.nth(i).locator("span.content-text").first().innerText()).trim();
    const isRight = want.includes(text);
    if (right ? isRight : !isRight && picks.length < 1) picks.push(i);
  }
  if (!right) {
    // multi: fill the remaining slots with anything so the submit button enables
    for (let i = 0; picks.length < want.length && i < n; i++) if (!picks.includes(i)) picks.push(i);
  }
  for (const i of picks) await options.nth(i).click();
  await page.getByRole("button", { name: confidence === "sure" ? /I'm sure/ : /not sure/ }).click();
  return q;
}
