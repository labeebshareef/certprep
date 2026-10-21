import { expect, test } from "@playwright/test";
import { answer, bank, signIn } from "./helpers";

const questions = bank();
const shots = process.env.E2E_SCREENSHOTS; // directory to drop screenshots into, when set

test("shows the sign-in screen without a session", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/login-${test.info().project.name}.png`, fullPage: true });
});

test("daily session: answer, reveal, relearn, summary, and sync", async ({ page }) => {
  const writes = await signIn(page);
  await page.goto("/");
  await expect(page.getByText("New today")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/home-empty-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "Start today's session" }).click();

  // first question wrong-but-sure: confident-wrong note, then it comes back as a relearn item
  await answer(page, questions, false, "sure");
  await expect(page.getByText("Incorrect")).toBeVisible();
  await expect(page.getByText(/comes back within 3 days/)).toBeVisible();
  await expect(page.getByText("References")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/reveal-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: /^(Next|Finish)$/ }).click();

  for (let i = 0; i < 30; i++) {
    if (await page.getByText("Session complete").isVisible()) break;
    await answer(page, questions, true, i % 3 === 0 ? "unsure" : "sure");
    await page.keyboard.press("Enter");
  }
  await expect(page.getByText("Session complete")).toBeVisible();
  await expect(page.getByText(/10 of 11 correct/)).toBeVisible();

  // the outbox flushes (debounced) — attempts must go up insert-only
  await expect.poll(() => writes.filter((w) => w.table === "attempts").length, { timeout: 10_000 }).toBeGreaterThan(0);
  const att = writes.find((w) => w.table === "attempts")!;
  expect(att.headers["prefer"]).toContain("resolution=ignore-duplicates");
  expect((att.body as object[])[0]).not.toHaveProperty("created_at");
  expect(writes.some((w) => w.table === "review_states")).toBe(true);
  expect(writes.some((w) => w.table === "daily_activity")).toBe(true);

  await page.getByRole("link", { name: "Back home" }).click();
  await expect(page.getByText("Day streak")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/home-after-${test.info().project.name}.png`, fullPage: true });
  await page.goto("/review");
  await expect(page.getByRole("link", { name: /Practise these \(1\)/ })).toBeVisible();
});

test("section quiz gates the next section", async ({ page }) => {
  await signIn(page);
  await page.goto("/sections");
  await expect(page.getByText("Pass AWS Lambda to unlock")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/sections-${test.info().project.name}.png`, fullPage: true });

  // fail first: 0%
  await page.getByRole("link", { name: "Take quiz" }).first().click();
  for (let i = 0; i < 10; i++) {
    await answer(page, questions, false);
    await page.keyboard.press("Enter");
  }
  await expect(page.getByText(/you need 80% to pass/)).toBeVisible();

  await page.getByRole("button", { name: "Retake quiz" }).click();
  for (let i = 0; i < 10; i++) {
    await answer(page, questions, true);
    await page.keyboard.press("Enter");
  }
  await expect(page.getByText(/Passed! Amazon DynamoDB is unlocked/)).toBeVisible();
  await page.getByRole("link", { name: "Sections" }).last().click();
  await expect(page.getByText("Pass Amazon DynamoDB to unlock")).toBeVisible();
  await expect(page.getByText("Passed", { exact: true })).toBeVisible();
});

test("mock exam: navigate, flag, submit, review", async ({ page }) => {
  await signIn(page);
  await page.goto("/mock");
  await page.getByRole("button", { name: "Start mock exam" }).click();
  await expect(page.getByText(/left$/)).toBeVisible();
  for (let i = 0; i < 3; i++) {
    const opt = page.locator("article ul button").first();
    await opt.click();
    const multi = (await page.getByText(/^Choose \d$/).count()) > 0;
    if (multi) await page.locator("article ul button").nth(1).click();
    if (i === 1) await page.getByRole("button", { name: "Flag for review" }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
  }
  if (shots) await page.screenshot({ path: `${shots}/mock-${test.info().project.name}.png`, fullPage: true });
  // reload keeps progress
  await page.reload();
  await expect(page.getByText(/3\/65 answered/)).toBeVisible();
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Submit exam" }).last().click();
  await expect(page.getByText(/Estimated score \d+ \/ 1000/)).toBeVisible();
  await expect(page.getByText("By domain")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/mock-result-${test.info().project.name}.png`, fullPage: true });
});

test("settings: switch the interface to Malayalam; offline banner", async ({ page, context }) => {
  await signIn(page);
  await page.goto("/settings");
  await page.getByLabel("Interface language").selectOption("ml");
  await expect(page.getByRole("heading", { name: "ക്രമീകരണങ്ങൾ" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "ml");
  if (shots) await page.screenshot({ path: `${shots}/settings-ml-${test.info().project.name}.png`, fullPage: true });
  await context.setOffline(true);
  await expect(page.getByText(/ഓഫ്‌ലൈൻ/)).toBeVisible();
  await context.setOffline(false);
});
