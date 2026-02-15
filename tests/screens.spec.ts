import { test, expect } from '@playwright/test';

test.describe('Agent Dashboard - All Screens', () => {
  test('Dashboard loads correctly', async ({ page }) => {
    await page.goto('/');

    // Check agent switcher
    await expect(page.getByRole('button', { name: /finn/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /kira/i })).toBeVisible();

    // Check stats cards (use more specific selectors)
    await expect(page.getByRole('main').getByText('Memory Files')).toBeVisible();
    await expect(page.getByRole('main').getByText('Cron Jobs')).toBeVisible();
    await expect(page.getByRole('main').getByText('Skills')).toBeVisible();

    // Check refresh button
    await expect(page.getByRole('button', { name: /refresh/i })).toBeVisible();

    // Check upcoming events section
    await expect(page.getByRole('heading', { name: 'Upcoming (24h)' })).toBeVisible();

    // Check quick actions
    await expect(page.getByRole('heading', { name: 'Quick Actions' })).toBeVisible();
  });

  test('DNA page loads correctly', async ({ page }) => {
    await page.goto('/dna');

    // Check page description
    await expect(page.getByText('Agent identity, personality, and behavioral configuration')).toBeVisible();

    // Check file tree categories exist (use first() for duplicates)
    await expect(page.getByRole('button', { name: /Soul.*Core identity/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Identity.*Personality/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Preferences/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Rules/i })).toBeVisible();

    // Click on a file and verify content loads
    await page.getByRole('button', { name: 'SOUL.md' }).click();
    await expect(page.getByRole('heading', { name: 'Soul', level: 1 })).toBeVisible();
  });

  test('Memory Browser loads correctly', async ({ page }) => {
    await page.goto('/memory');

    // Check page header (title is "Memory Browser")
    await expect(page.getByRole('heading', { name: 'Memory Browser' })).toBeVisible();

    // Check search bar exists
    await expect(page.getByPlaceholder(/search/i)).toBeVisible();

    // Check file tree categories exist (actual mock data names)
    await expect(page.getByText('Long-Term Memory').first()).toBeVisible();
  });

  test('Skills page loads correctly', async ({ page }) => {
    await page.goto('/skills');

    // Check page header (use exact match for h1)
    await expect(page.getByRole('heading', { name: 'Skills', exact: true })).toBeVisible();

    // Check skill cards exist (actual mock data names)
    await expect(page.getByText('Gmail').first()).toBeVisible();
    await expect(page.getByText('Oura Ring').first()).toBeVisible();

    // Check toggle buttons exist (round toggle buttons)
    const toggles = page.locator('button.rounded-full.w-11');
    await expect(toggles.first()).toBeVisible();
  });

  test('Cron Jobs page loads correctly', async ({ page }) => {
    await page.goto('/crons');

    // Check page header
    await expect(page.getByRole('heading', { name: 'Cron Jobs' })).toBeVisible();

    // Check cron items exist (use first to avoid strict mode)
    await expect(page.getByText('Morning Briefing').first()).toBeVisible();

    // Check Run buttons exist
    const runButtons = page.getByRole('button', { name: /^run$/i });
    await expect(runButtons.first()).toBeVisible();
  });

  test('Schedule page loads correctly', async ({ page }) => {
    await page.goto('/schedule');

    // Check page header
    await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible();
  });

  test('Goals page loads correctly', async ({ page }) => {
    await page.goto('/goals');

    // Check category accordions (use exact text patterns)
    await expect(page.getByRole('button', { name: /development/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /health/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /automation/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /personal/i })).toBeVisible();

    // Expand a category and check goal content
    await page.getByRole('button', { name: /development/i }).click();
    await expect(page.getByText('Launch Agent Command Center')).toBeVisible();
  });

  test('To-Do List page loads correctly', async ({ page }) => {
    await page.goto('/todos');

    // Check active section header
    await expect(page.getByRole('heading', { name: /active/i })).toBeVisible();

    // Check todo items exist
    await expect(page.getByText('Review morning briefing template')).toBeVisible();

    // Check completed section button exists
    await expect(page.getByRole('button', { name: /completed/i })).toBeVisible();
  });

  test('Mission Queue page loads correctly', async ({ page }) => {
    await page.goto('/missions');

    // Check active missions header
    await expect(page.getByRole('heading', { name: 'Active' })).toBeVisible();

    // Check running badge (use exact match)
    await expect(page.getByText('1 running')).toBeVisible();

    // Check history section button
    await expect(page.getByRole('button', { name: /history/i })).toBeVisible();
  });

  test('Settings page loads correctly', async ({ page }) => {
    await page.goto('/settings');

    // Check settings heading specifically
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });

  test('Navigation sidebar works correctly', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/');

    // Check sidebar nav items exist
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'DNA' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Memory' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Skills' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Cron Jobs' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Goals' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'To-Do List' })).toBeVisible();
    await expect(page.getByRole('link', { name: /mission queue/i })).toBeVisible();

    // Check connection status indicator
    await expect(page.getByText('Online')).toBeVisible();

    // Test navigation
    await page.getByRole('link', { name: 'DNA' }).click();
    await expect(page).toHaveURL('/dna');

    await page.getByRole('link', { name: 'Goals' }).click();
    await expect(page).toHaveURL('/goals');
  });

  test('Agent switching works', async ({ page }) => {
    await page.goto('/');

    // Switch to Kira
    await page.getByRole('button', { name: /kira/i }).click();

    // Verify Kira is selected
    const kiraButton = page.getByRole('button', { name: /kira/i });
    await expect(kiraButton).toBeVisible();

    // Switch back to Finn
    await page.getByRole('button', { name: /finn/i }).click();
  });

  test('Refresh button works', async ({ page }) => {
    await page.goto('/');

    // Click refresh
    const refreshButton = page.getByRole('button', { name: /refresh/i });
    await refreshButton.click();

    // Button should remain enabled after refresh completes
    await expect(refreshButton).toBeEnabled({ timeout: 5000 });
  });
});
