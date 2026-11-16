import { test, expect } from '@playwright/test';

test.describe('SeMF Mobile - Smoke Test (Viewport 390x844)', () => {
  test('renders 3-tab navigation, calendar, escape and panic views', async ({ page }) => {
    // 1. Visit root URL
    await page.goto('/');

    // Verify brand header and mode badge
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('text=SeMF Mobile')).toBeVisible();

    // Verify no accidental horizontal scroll
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const clientWidth = await page.evaluate(() => document.body.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);

    // 2. Tab 1: Calendario
    await expect(page.locator('button:has-text("San Luis (capital y alrededores)")')).toBeVisible();
    await expect(page.locator('text=Esta Semana')).toBeVisible();
    await expect(page.locator('text=Matriz Histórica')).toBeVisible();

    // 3. Navigate to Tab 3: SOS
    const panicTab = page.locator('#nav-tab-panic');
    await expect(panicTab).toBeVisible();
    await panicTab.click();

    await expect(page.locator('#main-sos-button')).toBeVisible();
    await expect(page.locator('text=Emergencias 911')).toBeVisible();
    await expect(page.locator('text=Bomberos 100')).toBeVisible();
    await expect(page.locator('text=Defensa Civil 103')).toBeVisible();
    await expect(page.locator('text=NO reemplaza')).toBeVisible();

    // 4. Navigate to Tab 2: Rutas de Escape
    const escapeTab = page.locator('#nav-tab-escape');
    await expect(escapeTab).toBeVisible();
    await escapeTab.click();

    // Verify "SALIR AHORA" button appears
    await expect(page.locator('#btn-salir-ahora')).toBeVisible();
  });
});
