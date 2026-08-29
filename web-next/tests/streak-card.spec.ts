import { test, expect } from '@playwright/test';
import { loginAsAgent } from './helpers';

// Regression coverage for the real bug that shipped earlier in this
// project: consolidating index.html's per-element compound-class
// animation-delay selectors into one shared `.bgB` class dropped the CSS
// specificity relationship that guaranteed it won over the later
// `animation` shorthand rules -- silently resetting animation-delay back
// to 0s and making both crossfade panes visible simultaneously. This test
// asserts the actual computed animation-delay values directly (fast,
// deterministic), not just eyeballing a screenshot.
test('streak card crossfade panes have distinct animation-delay values', async ({ page }) => {
  await loginAsAgent(page);
  await page.locator('[class*="moodPane"]').first().waitFor();

  const delays = await page.evaluate(() => {
    const panes = [...document.querySelectorAll('[class*="moodPane"]')];
    return panes.map((p) => getComputedStyle(p).animationDelay);
  });

  expect(delays).toHaveLength(2);
  expect(delays[0]).not.toBe(delays[1]);
  expect(delays).toContain('0s');
  expect(delays).toContain('-8s');
});

test('streak card art layer has distinct animation-delay values too', async ({ page }) => {
  await loginAsAgent(page);
  await page.locator('[class*="artPane"]').first().waitFor();

  const delays = await page.evaluate(() => {
    const panes = [...document.querySelectorAll('[class*="artPane"]')];
    return panes.map((p) => getComputedStyle(p).animationDelay);
  });

  expect(delays).toHaveLength(2);
  expect(delays[0]).not.toBe(delays[1]);
});

test('streak card mood/pet images load successfully (non-zero natural size)', async ({ page }) => {
  await loginAsAgent(page);
  // page.evaluate() has no auto-waiting semantics (unlike Playwright
  // locators) -- without this, the query can run before TanStack Query's
  // streak data resolves and the StreakCard mounts, producing an
  // intermittent false-pass (0 images "found" isn't the same as "0 images
  // are broken"). Wait for a real element first.
  await page.locator('[class*="artImg"]').first().waitFor();

  const sizes = await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll<HTMLImageElement>('[class*="artImg"]')];
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) return resolve();
            img.onload = () => resolve();
            img.onerror = () => resolve();
          }),
      ),
    );
    return imgs.map((img) => ({ src: img.currentSrc, w: img.naturalWidth, h: img.naturalHeight }));
  });

  expect(sizes.length).toBeGreaterThan(0);
  for (const s of sizes) {
    expect(s.w, `${s.src} failed to load or is 0x0`).toBeGreaterThan(0);
    expect(s.h, `${s.src} failed to load or is 0x0`).toBeGreaterThan(0);
  }
});

test('streak card text never overflows its container at mobile/tablet/desktop widths', async ({ page }) => {
  await loginAsAgent(page);

  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const card = page.locator('[class*="_card_"]').first();
    await expect(card).toBeVisible();

    const overflowing = await page.evaluate(() => {
      const card = document.querySelector('[class*="_card_"]');
      if (!card) return [];
      const cardRect = card.getBoundingClientRect();
      const textEls = [...card.querySelectorAll('[class*="_eyebrow_"], [class*="_num_"], [class*="_lbl_"]')];
      return textEls
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.right > cardRect.right + 1 || r.left < cardRect.left - 1;
        })
        .map((el) => el.textContent);
    });
    expect(overflowing, `overflowing text at ${width}px: ${JSON.stringify(overflowing)}`).toEqual([]);
  }
});
