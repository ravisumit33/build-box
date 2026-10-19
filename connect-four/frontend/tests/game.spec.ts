import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { ComputerSearch, Difficulty } from "../game-client";

const discs = (page: Page) => page.locator(".cell.red:not(.preview), .cell.yellow:not(.preview)");
const drop = (page: Page, column: number) =>
  page.locator("#columns button").nth(column);

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.locator("#status")).toHaveText("Red's turn");
}

async function freezeClock(page: Page) {
  const time = new Date("2026-01-01T00:00:00Z");
  await page.clock.install({ time });
  await page.clock.pauseAt(new Date(time.getTime() + 1000));
}

async function openSettings(page: Page) {
  const panel = page.getByRole("dialog", { name: "Game settings", exact: true });
  if (!(await panel.isVisible())) {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
  }
  await expect(panel).toBeVisible();
}

async function twoPlayers(page: Page) {
  await openSettings(page);
  await page.getByRole("combobox", { name: "Mode", exact: true }).selectOption("two_players");
  await page.getByRole("button", { name: "Apply & start new game", exact: true }).click();
  await expect(page.locator("#match")).toHaveText("Two players");
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 1440, height: 900 },
]) {
  test(`header GIF loops and fits a ${viewport.width}x${viewport.height} screen`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await ready(page);
    const icon = page.locator(".game-icon img");
    await expect(icon).toBeVisible();
    await expect(icon).toHaveAttribute("alt", "");
    await expect.poll(() => icon.evaluate((image: HTMLImageElement) =>
      image.complete && image.naturalWidth > 0,
    )).toBe(true);
    const bounds = await icon.boundingBox();
    const header = await page.locator(".game-header").boundingBox();
    expect(bounds!.width).toBe(56);
    expect(bounds!.height).toBe(48);
    expect(bounds!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    const response = await page.request.get(
      await icon.evaluate((image: HTMLImageElement) => image.currentSrc),
    );
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/gif");
    const data = await response.body();
    expect(data.subarray(0, 6).toString()).toBe("GIF89a");
    expect(data.length).toBeLessThan(24 * 1024);
    const loopExtension = Buffer.concat([
      Buffer.from("NETSCAPE2.0"),
      Buffer.from([3, 1, 0, 0, 0]),
    ]);
    expect(data.includes(loopExtension)).toBe(true);
  });
}

test("header GIF keeps animating after its 3.82-second first cycle", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await ready(page);
  const icon = page.locator(".game-icon img");
  await expect(icon).toBeVisible();
  await page.waitForTimeout(4200);
  const frames = new Set<string>();
  for (let sample = 0; sample < 4; sample++) {
    frames.add((await icon.screenshot({ animations: "allow" })).toString("base64"));
    if (sample < 3) {
      await page.waitForTimeout(700);
    }
  }
  expect(frames.size).toBeGreaterThan(1);
});

test("header icon respects reduced motion without changing its layout", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  const icon = page.locator(".game-icon img");
  const staticSource = await page.locator(".game-icon source").getAttribute("srcset");
  await expect.poll(() => icon.evaluate((image: HTMLImageElement) =>
    image.currentSrc,
  )).toBe(staticSource);
  await expect.poll(() => icon.evaluate((image: HTMLImageElement) =>
    image.complete && image.naturalWidth > 0,
  )).toBe(true);
  const boardTop = await page.locator("#board").evaluate(
    (board) => board.getBoundingClientRect().top,
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect.poll(() => icon.evaluate((image: HTMLImageElement) =>
    image.currentSrc === image.src && image.complete && image.naturalWidth > 0,
  )).toBe(true);
  expect(await page.locator("#board").evaluate(
    (board) => board.getBoundingClientRect().top,
  )).toBeCloseTo(boardTop, 2);
});

test("settings stay out of the board layout until requested", async ({ page }) => {
  await ready(page);
  const panel = page.locator("#game-settings");
  await expect(panel).toBeHidden();
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
  const boardTop = await page.locator("#board").evaluate(
    (board) => board.getBoundingClientRect().top + window.scrollY,
  );
  await openSettings(page);
  await expect(page.getByRole("combobox", { name: "Mode", exact: true })).toBeVisible();
  expect(await page.locator("#board").evaluate(
    (board) => board.getBoundingClientRect().top + window.scrollY,
  )).toBeCloseTo(boardTop, 2);
  await page.getByRole("heading", { name: "Connect Four", exact: true }).click();
  await expect(panel).toBeHidden();
  await expect(discs(page)).toHaveCount(0);
});

test("settings support keyboard dismissal, pending edits, and apply-to-close", async ({ page }) => {
  await ready(page);
  const trigger = page.getByRole("button", { name: "Settings", exact: true });
  const panel = page.locator("#game-settings");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(panel).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Mode", exact: true })).toBeFocused();
  await page.getByLabel("Difficulty").selectOption("easy");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
  await openSettings(page);
  await expect(page.getByLabel("Difficulty")).toHaveValue("easy");
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
  await openSettings(page);
  await page.getByRole("button", { name: "Apply & start new game", exact: true }).click();
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.locator(".apply-settings")).toBeDisabled();
  await expect(page.locator("#game-feedback")).toHaveText("New game started.");
  await expect(discs(page)).toHaveCount(0);
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
  { width: 740, height: 320 },
]) {
  test(`settings fit a ${viewport.width}x${viewport.height} screen`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await ready(page);
    await expect(page.getByRole("heading", { name: "Connect Four", exact: true })).toBeInViewport();
    await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeInViewport();
    await openSettings(page);
    const bounds = await page.locator("#game-settings").evaluate((panel) => {
      const { x, y, width, right, bottom } = panel.getBoundingClientRect();
      return { x, y, width, right, bottom };
    });
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(viewport.width);
    expect(bounds.bottom).toBeLessThanOrEqual(viewport.height);
    if (viewport.width <= 600) {
      expect(bounds.width).toBeCloseTo(viewport.width, 1);
      expect(bounds.bottom).toBeCloseTo(viewport.height, 1);
    } else {
      expect(bounds.width).toBeLessThanOrEqual(352);
    }
    const apply = page.getByRole("button", { name: "Apply & start new game", exact: true });
    await apply.scrollIntoViewIfNeeded();
    await expect(apply).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await page.keyboard.press("Escape");
    await expect(page.locator("#game-settings")).toBeHidden();
  });
}

test("open settings adapt across screen sizes without losing edits", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await ready(page);
  await openSettings(page);
  await page.getByLabel("Difficulty").selectOption("easy");
  await page.setViewportSize({ width: 320, height: 480 });
  await expect(page.getByLabel("Difficulty")).toHaveValue("easy");
  await expect(page.getByRole("button", { name: "Apply & start new game", exact: true })).toBeInViewport();
  await page.setViewportSize({ width: 1024, height: 400 });
  await expect(page.getByLabel("Difficulty")).toHaveValue("easy");
  await page.getByRole("button", { name: "Apply & start new game", exact: true }).scrollIntoViewIfNeeded();
  await page.keyboard.press("Escape");
  await expect(discs(page)).toHaveCount(0);
  await expect(page.locator("#status")).toHaveText("Red's turn");
});

test("failed Apply keeps settings open for recovery", async ({ page }) => {
  await page.goto("/tests/fixture.html?mode=reset-error");
  await expect(page.locator("#status")).toHaveText("Red's turn");
  await openSettings(page);
  await page.getByLabel("Difficulty").selectOption("easy");
  await page.getByRole("button", { name: "Apply & start new game", exact: true }).click();
  await expect(page.locator("#status")).toHaveText("Game paused");
  await expect(page.locator("#game-settings")).toBeVisible();
  await expect(page.getByLabel("Difficulty")).toHaveValue("easy");
  await expect(page.locator("#error")).toContainText("Could not start a new game");
  await expect(page.locator("#game-feedback")).toBeEmpty();
  await expect(page.locator("#match")).toHaveText("You: Red Computer(Medium): Yellow");
});

test("player summary shows the active difficulty without opening settings", async ({ page }) => {
  await ready(page);
  const summary = page.locator("#match");
  let activeSummary = "You: Red Computer(Medium): Yellow";
  await expect(summary).toHaveText(activeSummary);
  await expect(page.locator("#game-settings")).toBeHidden();
  for (const { difficulty, label } of [
    { difficulty: "easy", label: "Easy" },
    { difficulty: "hard", label: "Hard" },
    { difficulty: "medium", label: "Medium" },
  ]) {
    await openSettings(page);
    await page.getByLabel("Difficulty").selectOption(difficulty);
    await page.keyboard.press("Escape");
    await expect(summary).toHaveText(activeSummary);
    await openSettings(page);
    await page.getByRole("button", { name: "Apply & start new game", exact: true }).click();
    activeSummary = `You: Red Computer(${label}): Yellow`;
    await expect(summary).toHaveText(activeSummary);
    await expect(page.locator("#game-settings")).toBeHidden();
  }
  await twoPlayers(page);
  await expect(summary).toHaveText("Two players");
  await openSettings(page);
  await page.getByRole("combobox", { name: "Mode", exact: true }).selectOption("computer");
  await page.getByLabel("Difficulty").selectOption("hard");
  await expect(summary).toHaveText("Two players");
  await page.getByRole("button", { name: "Apply & start new game", exact: true }).click();
  await expect(summary).toHaveText("You: Red Computer(Hard): Yellow");
});

test("initializes the actual threaded engine and defaults to computer/Medium/Red", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await openSettings(page);
  await expect(page.getByRole("combobox", { name: "Mode", exact: true })).toHaveValue("computer");
  await expect(page.getByLabel("Difficulty")).toHaveValue("medium");
  await expect(page.getByLabel("Your side")).toHaveValue("1");
  await expect(page.getByRole("group", { name: "Game settings", exact: true })).toBeVisible();
  await expect(page.locator(".settings legend")).toHaveCount(0);
  await expect(page.locator(".settings-note")).toHaveCount(0);
  const applyButton = page.locator(".settings").getByRole("button", {
    name: "Apply & start new game", exact: true,
  });
  await expect(applyButton).toBeDisabled();
  await expect(applyButton).toHaveCSS("background-color", "rgb(37, 99, 235)");
  await applyButton.hover();
  await expect(applyButton).toHaveCSS("background-color", "rgb(37, 99, 235)");
  await expect(page.locator("#match")).toHaveText("You: Red Computer(Medium): Yellow");
  await expect(page.locator("#match > span")).toHaveText(["You: Red", "Computer(Medium): Yellow"]);
  await expect(page.locator("#match .player-name.red")).toHaveText("Red");
  await expect(page.locator("#match .player-name.red")).toHaveCSS("color", "rgb(239, 68, 68)");
  await expect(page.locator("#match .player-name.yellow")).toHaveText("Yellow");
  await expect(page.locator("#match .player-name.yellow")).toHaveCSS("color", "rgb(250, 204, 21)");
  await page.keyboard.press("Escape");
  await drop(page, 0).click();
  await expect(discs(page)).toHaveCount(2);
  await expect(page.locator("#status")).toHaveText("Red's turn");
  await expect(page.locator("#error")).toBeEmpty();
  expect(errors).toEqual([]);
});

test("Apply is enabled only when pending settings differ from active settings", async ({ page }) => {
  await ready(page);
  const applyButton = page.locator(".apply-settings");
  await expect(applyButton).toBeDisabled();
  await drop(page, 0).click();
  await expect(discs(page)).toHaveCount(2);
  await openSettings(page);
  for (const { label, changed, original } of [
    { label: "Mode", changed: "two_players", original: "computer" },
    { label: "Difficulty", changed: "easy", original: "medium" },
    { label: "Your side", changed: "2", original: "1" },
  ]) {
    const setting = page.getByRole("combobox", { name: label, exact: true });
    await setting.selectOption(changed);
    await expect(applyButton).toBeEnabled();
    await expect(discs(page)).toHaveCount(2);
    await setting.selectOption(original);
    await expect(applyButton).toBeDisabled();
  }
  await page.getByLabel("Difficulty").selectOption("easy");
  await expect(applyButton).toBeEnabled();
  await expect(applyButton).toHaveCSS("background-color", "rgb(37, 99, 235)");
  await applyButton.hover();
  await expect(applyButton).toHaveCSS("background-color", "rgb(29, 78, 216)");
  await page.getByLabel("Your side").selectOption("2");
  await page.getByLabel("Difficulty").selectOption("medium");
  await expect(applyButton).toBeEnabled();
  await page.getByLabel("Your side").selectOption("1");
  await expect(applyButton).toBeDisabled();
  await expect(discs(page)).toHaveCount(2);
});

test("pending settings preserve the active game and computer can start as Red", async ({ page }) => {
  await ready(page);
  const applyButton = page.locator(".apply-settings");
  await drop(page, 0).click();
  await expect(discs(page)).toHaveCount(2);
  await openSettings(page);
  await page.getByLabel("Your side").selectOption("2");
  await page.getByLabel("Difficulty").selectOption("hard");
  await expect(discs(page)).toHaveCount(2);
  await expect(page.locator("#match")).toHaveText("You: Red Computer(Medium): Yellow");
  await expect(page.locator(".settings-note")).toHaveCount(0);
  await expect(applyButton).toBeEnabled();
  await applyButton.click();
  await expect(applyButton).toBeDisabled();
  await expect(discs(page)).toHaveCount(1);
  await expect(page.locator("#status")).toHaveText("Yellow's turn");
  await expect(page.locator("#match")).toHaveText("You: Yellow Computer(Hard): Red");
  await expect(page.locator("#match .player-name").nth(0)).toHaveCSS("color", "rgb(250, 204, 21)");
  await expect(page.locator("#match .player-name").nth(1)).toHaveCSS("color", "rgb(239, 68, 68)");
  await openSettings(page);
  await page.getByLabel("Difficulty").selectOption("easy");
  await expect(applyButton).toBeEnabled();
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await expect(applyButton).toBeDisabled();
  await expect(discs(page)).toHaveCount(1);
  await expect(page.locator("#status")).toHaveText("Yellow's turn");
  await expect(page.locator("#match")).toHaveText("You: Yellow Computer(Easy): Red");
  await openSettings(page);
  await page.getByLabel("Difficulty").selectOption("hard");
  await expect(applyButton).toBeEnabled();
  await page.getByLabel("Difficulty").selectOption("easy");
  await expect(applyButton).toBeDisabled();
});

for (const action of ["New game", "Apply & start new game"]) {
  test(`${action} confirms a successful start even when the board is empty`, async ({ page }) => {
    await ready(page);
    const feedback = page.locator("#game-feedback");
    await expect(feedback).toBeEmpty();
    if (action === "Apply & start new game") {
      await openSettings(page);
      await page.getByLabel("Difficulty").selectOption("easy");
      await expect(feedback).toBeEmpty();
    }
    const boardTop = await page.locator("#board").evaluate(
      (board) => board.getBoundingClientRect().top + window.scrollY,
    );
    await page.getByRole("button", { name: action, exact: true }).click();
    await expect(feedback).toHaveText("New game started.");
    await expect(feedback).toHaveAttribute("role", "status");
    await expect(feedback).toHaveAttribute("aria-live", "polite");
    await expect(feedback.locator(".game-notice")).toBeInViewport();
    const noticeBounds = (await feedback.locator(".game-notice").boundingBox())!;
    expect(noticeBounds.y).toBeCloseTo(16, 1);
    expect(noticeBounds.x + noticeBounds.width / 2).toBeCloseTo(page.viewportSize()!.width / 2, 1);
    const noticeBottom = await feedback.locator(".game-notice").evaluate(
      (notice) => notice.getBoundingClientRect().bottom,
    );
    const restartTop = await page.locator("#restart").evaluate(
      (button) => button.getBoundingClientRect().top,
    );
    expect(noticeBottom).toBeLessThanOrEqual(restartTop);
    await expect(discs(page)).toHaveCount(0);
    await expect(page.locator("#status")).toHaveText("Red's turn");
    expect(await page.locator("#board").evaluate(
      (board) => board.getBoundingClientRect().top + window.scrollY,
    )).toBeCloseTo(boardTop, 2);
    await drop(page, 0).click();
    await expect(discs(page)).toHaveCount(2);
    await page.getByRole("button", { name: "New game", exact: true }).click();
    await expect(discs(page)).toHaveCount(0);
    await expect(feedback).toHaveText("New game started.");
    await expect(page.locator("#error")).toBeEmpty();
  });
}

test("repeated restarts renew the feedback and its dismissal timer", async ({ page }) => {
  await ready(page);
  await page.clock.install();
  const restart = page.getByRole("button", { name: "New game", exact: true });
  const feedback = page.locator("#game-feedback");
  const notice = feedback.locator(".game-notice");
  await restart.focus();
  await page.keyboard.press("Enter");
  await expect(notice).toHaveText("New game started.");
  await expect(restart).toBeFocused();
  const firstNotice = await notice.elementHandle();
  await page.clock.fastForward(2000);
  await page.keyboard.press("Enter");
  await expect(notice).toHaveText("New game started.");
  expect(await firstNotice?.evaluate((element) => element.isConnected)).toBe(false);
  await expect(restart).toBeFocused();
  await page.clock.fastForward(1500);
  await expect(notice).toBeVisible();
  await page.clock.fastForward(1600);
  await expect(feedback).toBeEmpty();
  await expect(restart).toBeFocused();
});

test("new-game feedback fits narrow screens and respects reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  await page.getByRole("button", { name: "New game", exact: true }).click();
  const notice = page.locator("#game-feedback .game-notice");
  await expect(notice).toHaveText("New game started.");
  await expect(notice).toBeInViewport();
  const noticeBounds = (await notice.boundingBox())!;
  expect(noticeBounds.y).toBeCloseTo(16, 1);
  expect(noticeBounds.x + noticeBounds.width / 2).toBeCloseTo(160, 1);
  await expect(notice).toHaveCSS("animation-name", "none");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await drop(page, 0).click();
  await expect(discs(page)).toHaveCount(2);
  await expect(page.locator("#error")).toBeEmpty();
});

test("a failed restart shows an error instead of success feedback", async ({ page }) => {
  await page.goto("/tests/fixture.html?mode=reset-error");
  await expect(page.locator("#status")).toHaveText("Red's turn");
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await expect(page.locator("#status")).toHaveText("Game paused");
  await expect(page.locator("#error")).toHaveText(
    "Could not start a new game. Reload the page to try again.",
  );
  await expect(page.locator("#game-feedback")).toBeEmpty();
  await expect(discs(page)).toHaveCount(0);
});

for (const { side, color, moves } of [
  { side: "1", color: "Red", moves: [3, 2, 3, 3, 4, 4, 5, 4, 2, 2, 2] },
  { side: "2", color: "Yellow", moves: [3, 3, 2, 2, 0, 5, 5, 2, 5, 5, 4, 4, 4, 0, 0, 1] },
]) {
  test(`Easy is winnable with planned moves as ${color}`, async ({ page }) => {
    await ready(page);
    await openSettings(page);
    await page.getByLabel("Difficulty").selectOption("easy");
    await page.getByLabel("Your side").selectOption(side);
    await page.getByRole("button", { name: "Apply & start new game", exact: true }).click();
    await expect(page.locator("#status")).toHaveText(`${color}'s turn`);
    for (const [turn, column] of moves.entries()) {
      await drop(page, column).click();
      const finished = turn === moves.length - 1;
      const count = (side === "2" ? 1 : 0) + (turn + 1) * 2 - (finished ? 1 : 0);
      await expect(discs(page)).toHaveCount(count);
      await expect(page.locator("#status")).toHaveText(
        finished ? `${color} wins!` : `${color}'s turn`,
      );
    }
    await expect(page.locator(".winning-lines line")).toHaveCount(1);
    await expect(page.locator("#error")).toBeEmpty();
  });
}

for (const { side, color } of [
  { side: "1", color: "Red" },
  { side: "2", color: "Yellow" },
]) {
  for (const moves of [[3, 2, 1, 0], [3, 4, 5, 6]]) {
    test(`Easy stops the ${moves.map((column) => column + 1).join(", ")} opening as ${color}`, async ({ page }) => {
      await ready(page);
      await openSettings(page);
      await page.getByLabel("Difficulty").selectOption("easy");
      await page.getByLabel("Your side").selectOption(side);
      await page.getByRole("button", { name: "Apply & start new game", exact: true }).click();
      await expect(page.locator("#status")).toHaveText(`${color}'s turn`);
      for (const [turn, column] of moves.entries()) {
        await drop(page, column).click();
        await expect(discs(page)).toHaveCount((side === "2" ? 1 : 0) + (turn + 1) * 2);
        await expect(page.locator("#status")).toHaveText(`${color}'s turn`);
      }
      await expect(page.locator(".winning-lines line")).toHaveCount(0);
      await expect(page.locator("#error")).toBeEmpty();
    });
  }
}

for (const width of [320, 375, 1440]) {
  test(`settings action and player labels fit a ${width}px screen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await ready(page);
    await openSettings(page);
    await expect(page.getByRole("button", { name: "Apply & start new game", exact: true })).toBeInViewport();
    await page.keyboard.press("Escape");
    const labels = page.locator("#match > span");
    await expect(labels).toHaveText(["You: Red", "Computer(Medium): Yellow"]);
    for (const label of await labels.all()) {
      await expect(label).toBeInViewport();
      const bounds = (await label.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

for (const { side, color, initialDiscs } of [
  { side: "1", color: "Red", initialDiscs: 1 },
  { side: "2", color: "Yellow", initialDiscs: 0 },
]) {
  test(`fast computer turns are visible for 400ms when the human is ${color}`, async ({ page }) => {
    await page.goto("/tests/fixture.html?mode=instant-search");
    await expect(page.locator("#status")).toHaveText("Red's turn");
    await freezeClock(page);
    if (side === "2") {
      await openSettings(page);
      await page.getByLabel("Your side").selectOption(side);
      await page.getByRole("button", { name: "Apply & start new game", exact: true }).click();
    } else {
      await drop(page, 0).click();
    }
    await expect(page.locator("html")).toHaveAttribute("data-computer-searches", "1");
    await expect(page.locator("#status")).toHaveText("Computer is thinking...");
    await expect(page.locator(".game")).toHaveAttribute("aria-busy", "true");
    await expect(discs(page)).toHaveCount(initialDiscs);
    await expect(page.locator("#columns button:enabled")).toHaveCount(0);
    await expect(page.locator(".board-column:enabled")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "New game", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeEnabled();
    await page.clock.fastForward(399);
    await expect(discs(page)).toHaveCount(initialDiscs);
    await expect(page.locator("#status")).toHaveText("Computer is thinking...");
    await page.clock.fastForward(1);
    await expect(discs(page)).toHaveCount(initialDiscs + 1);
    await expect(page.locator("#status")).toHaveText(`${color}'s turn`);
    await expect(page.locator(".game")).toHaveAttribute("aria-busy", "false");
    await expect(page.locator("#error")).toBeEmpty();
  });
}

test("slow computer turns search immediately and have no extra presentation delay", async ({ page }) => {
  await page.goto("/tests/fixture.html?mode=slow-search");
  await expect(page.locator("#status")).toHaveText("Red's turn");
  await freezeClock(page);
  await drop(page, 0).click();
  await expect(page.locator("html")).toHaveAttribute("data-computer-searches", "1");
  await page.clock.fastForward(799);
  await expect(discs(page)).toHaveCount(1);
  await expect(page.locator("#status")).toHaveText("Computer is thinking...");
  await page.clock.fastForward(1);
  await expect(discs(page)).toHaveCount(2);
  await expect(page.locator("#status")).toHaveText("Red's turn");
  await expect(page.locator("#error")).toBeEmpty();
});

for (const action of ["New game", "Apply & start new game"]) {
  test(`${action} cancels a computer move waiting for presentation`, async ({ page }) => {
    await page.goto("/tests/fixture.html?mode=instant-search");
    await expect(page.locator("#status")).toHaveText("Red's turn");
    await freezeClock(page);
    await drop(page, 0).click();
    await expect(page.locator("#status")).toHaveText("Computer is thinking...");
    await page.clock.fastForward(100);
    if (action === "Apply & start new game") {
      await openSettings(page);
      await page.getByRole("combobox", { name: "Mode", exact: true }).selectOption("two_players");
      await expect(page.locator("html")).toHaveAttribute("data-computer-searches", "1");
    }
    await page.getByRole("button", { name: action, exact: true }).click();
    await expect(discs(page)).toHaveCount(0);
    await expect(page.locator("#status")).toHaveText("Red's turn");
    await page.clock.fastForward(1000);
    await expect(discs(page)).toHaveCount(0);
    await expect(page.locator("#error")).toBeEmpty();
    await drop(page, 1).click();
    if (action === "New game") {
      await expect(page.locator("#status")).toHaveText("Computer is thinking...");
      await page.clock.fastForward(399);
      await expect(discs(page)).toHaveCount(1);
      await page.clock.fastForward(1);
      await expect(discs(page)).toHaveCount(2);
    } else {
      await expect(discs(page)).toHaveCount(1);
      await expect(page.locator("#status")).toHaveText("Yellow's turn");
    }
  });
}

test("unmount cancels a computer move waiting for presentation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/tests/fixture.html?mode=instant-search");
  await expect(page.locator("#status")).toHaveText("Red's turn");
  await freezeClock(page);
  await drop(page, 0).click();
  await expect(page.locator("#status")).toHaveText("Computer is thinking...");
  await page.evaluate(() => document.dispatchEvent(new Event("unmount-game")));
  await expect(page.locator("#root")).toBeEmpty();
  await page.clock.fastForward(1000);
  expect(errors).toEqual([]);
});

test("search errors are shown immediately without waiting for turn pacing", async ({ page }) => {
  await page.goto("/tests/fixture.html?mode=search-error");
  await expect(page.locator("#status")).toHaveText("Red's turn");
  await freezeClock(page);
  await drop(page, 0).click();
  await expect(page.locator("#status")).toHaveText("Game paused");
  await expect(discs(page)).toHaveCount(1);
  await expect(page.locator("#error")).toContainText("computer could not move");
  await expect(page.locator(".game")).toHaveAttribute("aria-busy", "false");
});

test("both input surfaces are gated while thinking and New game remains responsive", async ({ page }) => {
  await ready(page);
  await openSettings(page);
  await page.getByLabel("Difficulty").selectOption("hard");
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await drop(page, 0).click();
  await expect(page.locator("#status")).toHaveText("Computer is thinking...");
  await expect(page.locator("#columns button:enabled")).toHaveCount(0);
  await expect(page.locator(".board-column:enabled")).toHaveCount(0);
  await expect(page.locator(".preview")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New game", exact: true })).toBeEnabled();
  await expect(page.locator(".apply-settings")).toBeDisabled();
  await openSettings(page);
  await page.getByRole("combobox", { name: "Mode", exact: true }).selectOption("two_players");
  await expect(page.getByRole("button", { name: "Apply & start new game", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Apply & start new game", exact: true }).click();
  await expect(discs(page)).toHaveCount(0);
  await page.waitForTimeout(1000);
  await expect(discs(page)).toHaveCount(0);
  await expect(page.locator("#status")).toHaveText("Red's turn");
});

test("rapid restart never applies an old computer opening", async ({ page }) => {
  await ready(page);
  await openSettings(page);
  await page.getByLabel("Difficulty").selectOption("hard");
  await page.getByLabel("Your side").selectOption("2");
  for (let attempt = 0; attempt < 5; ++attempt) {
    await page.getByRole("button", { name: "New game", exact: true }).click();
  }
  await expect(discs(page)).toHaveCount(1);
  await page.waitForTimeout(1000);
  await expect(discs(page)).toHaveCount(1);
  await expect(page.locator("#status")).toHaveText("Yellow's turn");
});

test("two-player wins preserve previews, keyboard input, and winning lines", async ({ page }) => {
  await ready(page);
  await twoPlayers(page);
  await expect(page.locator(".apply-settings")).toBeDisabled();
  await page.getByRole("button", { name: "Settings", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(drop(page, 0)).toBeFocused();
  await expect(page.locator(".cell.preview.red")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(discs(page)).toHaveCount(1);
  for (const col of [6, 1, 6, 2, 5, 3]) {
    await drop(page, col).click();
  }
  await expect(page.locator("#status")).toHaveText("Red wins!");
  await expect(page.locator(".winning-lines line")).toHaveCount(1);
  await expect(page.locator("#columns button:enabled")).toHaveCount(0);
  await expect(page.locator(".board-column:enabled")).toHaveCount(0);
});

test("full columns and draws reject moves", async ({ page }) => {
  await ready(page);
  await twoPlayers(page);
  for (let move = 0; move < 6; ++move) {
    await drop(page, 0).click();
  }
  await expect(drop(page, 0)).toBeDisabled();
  await expect(page.locator(".board-column").nth(0)).toBeDisabled();
  await page.getByRole("button", { name: "New game", exact: true }).click();
  for (const col of [
    0, 2, 1, 2, 5, 4, 5, 4, 0, 4, 6, 1, 5, 0, 2, 0, 0, 3, 3, 5, 2,
    3, 5, 3, 0, 5, 2, 3, 4, 2, 6, 4, 1, 4, 6, 6, 6, 6, 3, 1, 1, 1,
  ]) {
    await drop(page, col).click();
  }
  await expect(page.locator("#status")).toHaveText("It's a draw!");
  await expect(discs(page)).toHaveCount(42);
  await expect(page.locator(".winning-lines line")).toHaveCount(0);
});

test("reports missing isolation with Reload/retry and requests no compatibility build", async ({ page }) => {
  const engineRequests: string[] = [];
  page.on("request", (request) => {
    if (/connect_four.*\.(js|wasm)/.test(request.url())) {
      engineRequests.push(request.url());
    }
  });
  await page.route("**/*", async (route) => {
    const response = await route.fetch();
    const headers = response.headers();
    delete headers["cross-origin-opener-policy"];
    delete headers["cross-origin-embedder-policy"];
    await route.fulfill({ response, headers });
  });
  await page.goto("/");
  await expect(page.locator("#status")).toHaveText("Game unavailable");
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(false);
  await expect(page.locator("#error")).toContainText("cross-origin isolation");
  await expect(page.getByRole("button", { name: "Reload / retry" })).toBeEnabled();
  expect(engineRequests).toEqual([]);
});

test("module load failure provides a working reload path", async ({ page }) => {
  await page.route("**/connect_four.js", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator("#status")).toHaveText("Game unavailable");
  await expect(page.getByRole("button", { name: "Reload / retry" })).toBeVisible();
  await page.unroute("**/connect_four.js");
  await page.getByRole("button", { name: "Reload / retry" }).click();
  await expect(page.locator("#status")).toHaveText("Red's turn");
});

test("blocked shared memory reports a startup error rather than changing modes", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, "SharedArrayBuffer", { value: undefined });
  });
  await page.goto("/");
  await expect(page.locator("#status")).toHaveText("Game unavailable");
  await expect(page.locator("#error")).toContainText("Shared memory is unavailable");
  await expect(page.getByRole("button", { name: "Reload / retry" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "New game", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeDisabled();
  await expect(page.locator(".apply-settings")).toBeDisabled();
});

test("pthread worker loading failure cannot leave the page loading indefinitely", async ({ page, context }) => {
  let engineRequests = 0;
  await context.route("**/connect_four.js", async (route) => {
    if (++engineRequests > 1) {
      await route.abort();
    } else {
      await route.continue();
    }
  });
  await page.goto("/");
  await expect(page.locator("#status")).toHaveText("Game unavailable", { timeout: 20000 });
  await expect(page.locator("#error")).toContainText(/threaded engine/i);
  await expect(page.getByRole("button", { name: "Reload / retry" })).toBeEnabled();
  expect(engineRequests).toBeGreaterThan(1);
});

test("search errors keep the board and allow New game recovery", async ({ page }) => {
  await page.goto("/tests/fixture.html?mode=search-error");
  await expect(page.locator("#status")).toHaveText("Red's turn");
  await drop(page, 0).click();
  await expect(page.locator("#status")).toHaveText("Game paused");
  await expect(discs(page)).toHaveCount(1);
  await expect(page.locator("#error")).toContainText("computer could not move");
  await openSettings(page);
  await page.getByRole("combobox", { name: "Mode", exact: true }).selectOption("two_players");
  await page.getByRole("button", { name: "Apply & start new game", exact: true }).click();
  await expect(page.locator("#status")).toHaveText("Red's turn");
  await expect(discs(page)).toHaveCount(0);
  await expect(page.locator("#error")).toBeEmpty();
});

test("unmount during real search safely cancels the session", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/tests/fixture.html");
  await expect(page.locator("#status")).toHaveText("Red's turn");
  await openSettings(page);
  await page.getByLabel("Difficulty").selectOption("hard");
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await drop(page, 0).click();
  await page.evaluate(() => document.dispatchEvent(new Event("unmount-game")));
  await expect(page.locator("#root")).toBeEmpty();
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);
});

test("completion events resolve promises without polling and ignore duplicate delivery", async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const url = "/game-client.ts";
    const { GameClient } = await import(url);
    let polls = 0;
    class EventSession {
      makeMove() { return true; }
      getSnapshot() { return { board: [Array(7).fill(null)] }; }
      reset() {}
      delete() {}
      cancelComputerSearch() {}
      startComputerSearch(
        _difficulty: Difficulty,
        requestId: number,
        complete?: (result: ComputerSearch) => void,
      ) {
        queueMicrotask(() => {
          const search: ComputerSearch = {
            state: "ready", requestId, column: 3, completedDepth: 1, error: "",
          };
          complete?.(search);
          complete?.({ ...search, state: "error", error: "Duplicate completion" });
        });
      }
      pollComputerSearch() {
        ++polls;
        throw new Error("Completion events must not poll the session");
      }
    }
    const client = new GameClient({ GameSession: EventSession });
    try {
      return { column: await client.requestComputerMove("easy"), polls };
    } finally {
      client.dispose();
    }
  });
  expect(result).toEqual({ column: 3, polls: 0 });
});

test("late completion events cannot settle replacement or disposed requests", async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const url = "/game-client.ts";
    const { GameClient } = await import(url);
    const completions: (() => void)[] = [];
    class DeferredSession {
      makeMove() { return true; }
      getSnapshot() { return { board: [Array(7).fill(null)] }; }
      reset() {}
      delete() {}
      cancelComputerSearch() {}
      startComputerSearch(
        _difficulty: Difficulty,
        requestId: number,
        complete?: (result: ComputerSearch) => void,
      ) {
        completions.push(() => complete?.({
          state: "ready", requestId, column: 3, completedDepth: 1, error: "",
        }));
      }
      pollComputerSearch() {
        throw new Error("Completion events must not poll the session");
      }
    }
    const client = new GameClient({ GameSession: DeferredSession });
    try {
      const first = client.requestComputerMove("hard")
        .then(() => "resolved", (error: Error) => error.name);
      const second = client.requestComputerMove("easy");
      completions[0]();
      completions[1]();
      const replacement = await second;
      const last = client.requestComputerMove("hard")
        .then(() => "resolved", (error: Error) => error.name);
      client.dispose();
      completions[2]();
      completions[1]();
      return { first: await first, replacement, last: await last };
    } finally {
      client.dispose();
    }
  });
  expect(result).toEqual({ first: "AbortError", replacement: 3, last: "AbortError" });
});

test("board changes clean up promises without repeating native cancellation", async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const url = "/game-client.ts";
    const { GameClient } = await import(url);
    const calls: string[] = [];
    const completions: (() => void)[] = [];
    class MutationSession {
      makeMove(column: number) {
        calls.push("move");
        return column !== 0;
      }
      getSnapshot() { return { board: [Array(7).fill(null)] }; }
      reset() { calls.push("reset"); }
      delete() { calls.push("delete"); }
      cancelComputerSearch() { calls.push("cancel"); }
      startComputerSearch(
        _difficulty: Difficulty,
        requestId: number,
        complete: (result: ComputerSearch) => void,
      ) {
        completions.push(() => complete({
          state: "ready", requestId, column: 3, completedDepth: 1, error: "",
        }));
      }
    }
    const client = new GameClient({ GameSession: MutationSession });
    try {
      const movedRequest = client.requestComputerMove("hard")
        .then(() => "resolved", (error: Error) => error.name);
      calls.length = 0;
      const moved = client.makeMove(3);
      const moveCalls = [...calls];
      const moveResult = await movedRequest;
      completions[0]();

      let settled = false;
      const retained = client.requestComputerMove("easy").then((column: number) => {
        settled = true;
        return column;
      }, (error: Error) => {
        settled = true;
        return error.name;
      });
      calls.length = 0;
      const rejectedMove = client.makeMove(0);
      await Promise.resolve();
      const settledAfterFailedMove = settled;
      const rejectedMoveCalls = [...calls];
      completions[1]();
      const retainedResult = await retained;
      calls.length = 0;
      client.makeMove(3);
      const completedMoveCalls = [...calls];

      const resetRequest = client.requestComputerMove("hard")
        .then(() => "resolved", (error: Error) => error.name);
      calls.length = 0;
      client.reset();
      const resetCalls = [...calls];
      const resetResult = await resetRequest;
      completions[2]();

      const cancelledRequest = client.requestComputerMove("hard")
        .then(() => "resolved", (error: Error) => error.name);
      calls.length = 0;
      client.cancelComputerMove();
      const cancelCalls = [...calls];
      const cancelResult = await cancelledRequest;
      completions[3]();
      return {
        moved, moveCalls, moveResult, rejectedMove, rejectedMoveCalls,
        settledAfterFailedMove, retainedResult, completedMoveCalls,
        resetCalls, resetResult, cancelCalls, cancelResult,
      };
    } finally {
      client.dispose();
    }
  });
  expect(result).toEqual({
    moved: true, moveCalls: ["move"], moveResult: "AbortError",
    rejectedMove: false, rejectedMoveCalls: ["move"],
    settledAfterFailedMove: false, retainedResult: 3, completedMoveCalls: ["move"],
    resetCalls: ["reset"], resetResult: "AbortError",
    cancelCalls: ["cancel"], cancelResult: "AbortError",
  });
});

test("completion errors and start failures leave the next request usable", async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const url = "/game-client.ts";
    const { GameClient } = await import(url);
    class FailureSession {
      attempts = 0;
      makeMove() { return true; }
      getSnapshot() { return { board: [Array(7).fill(null)] }; }
      reset() {}
      delete() {}
      cancelComputerSearch() {}
      startComputerSearch(
        _difficulty: Difficulty,
        requestId: number,
        complete: (result: ComputerSearch) => void,
      ) {
        if (++this.attempts === 1) {
          throw new Error("Injected start failure");
        }
        complete({
          state: this.attempts === 2 ? "error" : "ready",
          requestId, column: 3, completedDepth: 1, error: "Injected search failure",
        });
      }
    }
    const client = new GameClient({ GameSession: FailureSession });
    try {
      const startError = await client.requestComputerMove("easy")
        .then(() => "resolved", (error: Error) => error.message);
      const searchError = await client.requestComputerMove("easy")
        .then(() => "resolved", (error: Error) => error.message);
      const replacement = await client.requestComputerMove("easy");
      return { startError, searchError, replacement };
    } finally {
      client.dispose();
    }
  });
  expect(result).toEqual({
    startError: "Injected start failure",
    searchError: "Injected search failure",
    replacement: 3,
  });
});

test("completion watchdog rejects a missing event and cancels the search", async ({ page }) => {
  await ready(page);
  await page.clock.install();
  const outcome = page.evaluate(async () => {
    const url = "/game-client.ts";
    const { GameClient } = await import(url);
    let cancellations = 0;
    class UnresponsiveSession {
      makeMove() { return true; }
      getSnapshot() { return { board: [Array(7).fill(null)] }; }
      reset() {}
      delete() {}
      cancelComputerSearch() { ++cancellations; }
      startComputerSearch() {}
    }
    const client = new GameClient({ GameSession: UnresponsiveSession });
    try {
      const result = client.requestComputerMove("easy")
        .then(() => "resolved", (error: Error) => error.message);
      document.body.dataset.searchPending = "true";
      return { error: await result, cancellations };
    } finally {
      client.dispose();
    }
  });
  await expect(page.locator("body")).toHaveAttribute("data-search-pending", "true");
  await page.clock.fastForward(10001);
  const result = await outcome;
  expect(result.error).toContain("did not respond");
  expect(result.cancellations).toBe(2);
});

test("native completion carries results and drops replaced or deleted deliveries", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/tests/fixture.html?mode=native-bindings");
  const result = await page.evaluate(async () => {
    const url = new URL("../connect_four.js", location.href).href;
    const { default: createModule } = await import(url);
    const module = await createModule();
    const session = new module.GameSession();
    let starting = true;
    let synchronous = false;
    let replacedCompletions = 0;
    let invalidatedCompletions = 0;
    let lateCompletions = 0;
    let deleted = false;
    try {
      const first = new Promise<ComputerSearch>((resolve) => {
        session.startComputerSearch("easy", 1, (search: ComputerSearch) => {
          synchronous = starting;
          resolve(search);
        });
      });
      starting = false;
      const search = await first;
      session.startComputerSearch("hard", 2, () => { ++replacedCompletions; });
      const replacement = await new Promise<ComputerSearch>((resolve) => {
        session.startComputerSearch("easy", 2, resolve);
      });
      session.startComputerSearch("hard", 3, () => { ++invalidatedCompletions; });
      const moved = session.makeMove(0);
      session.startComputerSearch("hard", 4, () => { ++invalidatedCompletions; });
      session.reset();
      const afterReset = await new Promise<ComputerSearch>((resolve) => {
        session.startComputerSearch("easy", 5, resolve);
      });
      session.startComputerSearch("hard", 6, () => { ++lateCompletions; });
      session.delete();
      deleted = true;
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      return {
        state: search.state, column: search.column, synchronous,
        replacement: { requestId: replacement.requestId, column: replacement.column },
        moved, resetColumn: afterReset.column,
        replacedCompletions, invalidatedCompletions, lateCompletions,
      };
    } finally {
      if (!deleted) {
        session.delete();
      }
    }
  });
  expect(result).toEqual({
    state: "ready", column: 3, synchronous: false,
    replacement: { requestId: 2, column: 3 },
    moved: true, resetColumn: 3,
    replacedCompletions: 0, invalidatedCompletions: 0, lateCompletions: 0,
  });
  expect(errors).toEqual([]);
});

test("client validates results and cancellation settles promises exactly once", async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const url = "/game-client.ts";
    const { GameClient, createGameClient } = await import(url);
    const client = await createGameClient();
    const search = client.requestComputerMove("hard")
      .then(() => "resolved", (error: Error) => error.name);
    client.cancelComputerMove();
    const cancelled = await search;
    const replacement = await client.requestComputerMove("easy");
    client.dispose();
    client.dispose();
    class InvalidSession {
      makeMove() { return true; }
      getSnapshot() { return { board: [Array(7).fill(null)] }; }
      reset() {}
      delete() {}
      cancelComputerSearch() {}
      startComputerSearch(
        _difficulty: Difficulty,
        requestId: number,
        complete: (result: ComputerSearch) => void,
      ) {
        complete({ state: "ready", requestId, column: 99, completedDepth: 1, error: "" });
      }
    }
    const invalid = new GameClient({ GameSession: InvalidSession });
    const invalidResult = await invalid.requestComputerMove("easy")
      .then(() => "resolved", (error: Error) => error.message);
    invalid.dispose();
    class ReadySession extends InvalidSession {
      startComputerSearch(
        _difficulty: Difficulty,
        requestId: number,
        complete: (result: ComputerSearch) => void,
      ) {
        complete({ state: "ready", requestId, column: 3, completedDepth: 1, error: "" });
      }
    }
    const synchronous = new GameClient({ GameSession: ReadySession });
    let synchronousResult: number;
    try {
      synchronousResult = await synchronous.requestComputerMove("easy");
    } finally {
      synchronous.dispose();
    }
    return { cancelled, replacement, invalidResult, synchronousResult };
  });
  expect(result.cancelled).toBe("AbortError");
  expect(result.replacement).toBe(3);
  expect(result.invalidResult).toContain("invalid move");
  expect(result.synchronousResult).toBe(3);
});

test("real computer moves can finish a complete legal game", async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const url = "/game-client.ts";
    const { createGameClient } = await import(url);
    const client = await createGameClient();
    let moves = 0;
    let snapshot = client.getSnapshot();
    try {
      while (snapshot.state === "in_progress" && moves < 42) {
        const column = await client.requestComputerMove("easy");
        if (!client.makeMove(column)) {
          throw new Error("AI selected an illegal move");
        }
        ++moves;
        snapshot = client.getSnapshot();
      }
      return { moves, state: snapshot.state, lines: snapshot.winningLines.length };
    } finally {
      client.dispose();
    }
  });
  expect(result.moves).toBeGreaterThanOrEqual(7);
  expect(result.moves).toBeLessThanOrEqual(42);
  expect(["won", "draw"]).toContain(result.state);
  if (result.state === "won") {
    expect(result.lines).toBeGreaterThan(0);
  } else {
    expect(result.lines).toBe(0);
  }
});

test("touching a board column drops a disc without a lingering preview", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ hasTouch: true, baseURL });
  const page = await context.newPage();
  await ready(page);
  await twoPlayers(page);
  await page.locator(".board-column").nth(0).tap();
  await expect(discs(page)).toHaveCount(1);
  await expect(page.locator(".preview")).toHaveCount(0);
  await context.close();
});
