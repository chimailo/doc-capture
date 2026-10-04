import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('accessibility', () => {
  test('home screen has no axe violations', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test('capture screen: labelled controls, live guidance, no axe violations', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open camera' }).click();
    const shutter = page.getByRole('button', { name: 'Take photo' });
    await expect(shutter).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close camera' })).toBeVisible();

    // Guidance is announced through a polite live region.
    const live = page.locator('[aria-live="polite"]');
    await expect(live).toHaveCount(1);
    await expect(live).not.toHaveText('', { timeout: 20_000 });

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

    // Keyboard users can reach the shutter.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    expect(['Take photo', 'Close camera']).toContain(focused);
  });
});
