import { expect, test } from "@playwright/test";

test("liveness endpoint responds with a request id", async ({ request }) => {
  const response = await request.get("/healthz");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
  expect(response.headers()["x-request-id"]).toBeTruthy();
});

test("walking-skeleton root renders", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "CodeToGather" })
  ).toBeVisible();
});
