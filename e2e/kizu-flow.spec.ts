import { test, expect, Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createTestUser,
  deleteTestUser,
  buildStorageKey,
  buildSessionPayload,
  TestUser,
} from './helpers/auth';

let testUser: TestUser;

test.describe('Kizu full user lifecycle', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterAll(async () => {
    if (testUser?.id) {
      await deleteTestUser(testUser.id);
    }
  });

  async function injectSession(page: Page, targetUrl: string) {
    const storageKey = buildStorageKey();
    const payload = buildSessionPayload(testUser);

    // addInitScript runs BEFORE any page scripts on every navigation.
    // This sets localStorage before React/Supabase initialize.
    await page.addInitScript(
      ({ key, value }) => {
        try {
          window.localStorage.setItem(key, value);
        } catch {
          // localStorage may not be available on about:blank
        }
      },
      { key: storageKey, value: payload }
    );

    // Navigate directly to the target — when the page loads,
    // addInitScript fires first, sets localStorage, then Supabase client
    // initializes and finds the session.
    await page.goto(targetUrl, { waitUntil: 'networkidle' });
    // Wait for AuthContext to validate the token via getUser() API call
    await page.waitForTimeout(7_000);
  }

  // ── Step 1: Create test account ──────────────────────────────
  test('Step 1: Create test account via Admin API', async () => {
    testUser = await createTestUser();
    expect(testUser.id).toBeTruthy();
    expect(testUser.accessToken).toBeTruthy();
  });

  // ── Step 2: Log in and reach admin dashboard ─────────────────
  test('Step 2: Log in and reach admin dashboard', async ({ page }) => {
    await injectSession(page, '/admin/albums');
    await expect(page.locator('text=Albums').first()).toBeVisible({
      timeout: 30_000,
    });
  });

  // ── Step 3: Verify subscription page shows usage ─────────────
  test('Step 3: Verify subscription page shows account limits', async ({
    page,
  }) => {
    await injectSession(page, '/subscription');
    await expect(page.locator('text=Manage Subscription')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator('text=Photos').first()).toBeVisible();
    await expect(page.locator('text=Storage').first()).toBeVisible();
  });

  // ── Step 4: Apply promo code "555" ───────────────────────────
  test('Step 4: Apply promo code "555"', async ({ page }) => {
    await injectSession(page, '/subscription');
    await expect(page.locator('text=Manage Subscription')).toBeVisible({
      timeout: 30_000,
    });

    const promoToggle = page.locator('text=Have a promo code?');
    if (await promoToggle.isVisible()) {
      await promoToggle.click();
    }

    const promoInput = page.locator('input[placeholder="Enter promo code"]');
    await expect(promoInput).toBeVisible();
    await promoInput.fill('555');

    await page.locator('button:has-text("Check")').click();

    await expect(
      page.locator('text=Valid code!').or(page.locator('text=✓'))
    ).toBeVisible({ timeout: 15_000 });

    await page.locator('button:has-text("Apply Now")').click();

    await expect(
      page.locator('.bg-green-100, .bg-green-900\\/30').first()
    ).toBeVisible({ timeout: 15_000 });
  });

  // ── Step 5: Create a circle ──────────────────────────────────
  test('Step 5: Create a circle', async ({ page }) => {
    await injectSession(page, '/admin/circles');

    await page.locator('button:has-text("Create New Circle")').click();

    const nameInput = page.locator(
      'input[placeholder="Family, Friends, etc."]'
    );
    await expect(nameInput).toBeVisible();
    await nameInput.fill('E2E Test Circle');

    await page
      .locator(
        'button[type="submit"]:has-text("Create"), button:has-text("Create Circle")'
      )
      .first()
      .click();

    await expect(page.locator('text=E2E Test Circle')).toBeVisible({
      timeout: 15_000,
    });
  });

  // ── Step 6: Create an album ──────────────────────────────────
  test('Step 6: Create an album', async ({ page }) => {
    await injectSession(page, '/admin/albums');

    await page.locator('button:has-text("Create Album")').click();

    const titleInput = page.locator(
      'input[placeholder="Enter album title"]'
    );
    await expect(titleInput).toBeVisible();
    await titleInput.fill('E2E Test Album');

    await page
      .locator(
        'button[type="submit"]:has-text("Create"), button:has-text("Create Album")'
      )
      .last()
      .click();

    await expect(page.locator('text=E2E Test Album')).toBeVisible({
      timeout: 15_000,
    });
  });

  // ── Step 7: Upload a photo to the album ──────────────────────
  test('Step 7: Upload a photo to the album', async ({ page }) => {
    await injectSession(page, '/admin/albums');

    await page.locator('text=E2E Test Album').first().click();
    await page.waitForLoadState('networkidle');

    // Click "Upload New" button
    await page.locator('button:has-text("Upload New")').first().click();

    // The ImageUploader modal appears with a hidden file input
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        'fixtures/test-photo.jpg'
      )
    );

    // Wait for file to be processed and preview to appear
    await page.waitForTimeout(2_000);

    // Click the "Upload 1 Photos" button to start the upload
    const uploadButton = page.locator('button:has-text("Upload")').last();
    await uploadButton.click();

    // Wait for upload to complete — the modal auto-closes after 2s
    // or shows "Close" button
    await page.waitForTimeout(10_000);
  });

  // ── Step 8: Verify photo is in the album ─────────────────────
  test('Step 8: Verify photo is in the album', async ({ page }) => {
    await injectSession(page, '/admin/albums');

    await page.locator('text=E2E Test Album').first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3_000);

    // The album detail header should show "Photos (1)" (not "Photos (0)")
    await expect(page.locator('text=/Photos \\(\\d+\\)/')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('text=Photos (0)')).not.toBeVisible();
  });

  // ── Step 9: Share album with circle ──────────────────────────
  test('Step 9: Share album with circle', async ({ page }) => {
    await injectSession(page, '/admin/circles');

    await page.locator('text=E2E Test Circle').first().click();
    await page.waitForLoadState('networkidle');

    await page.locator('button:has-text("Add Album")').click();

    await page.locator('text=E2E Test Album').last().click();

    await page.waitForTimeout(3_000);
    await expect(page.locator('text=E2E Test Album')).toBeVisible();
  });

  // ── Step 10: Delete account ──────────────────────────────────
  test('Step 10: Delete account', async ({ page }) => {
    await injectSession(page, '/account');

    await expect(page.locator('text=Account Settings')).toBeVisible({
      timeout: 15_000,
    });

    page.on('dialog', (dialog) => dialog.accept());

    await page.locator('button:has-text("Delete My Account")').click();

    await page
      .locator('button:has-text("Yes, Delete Everything")')
      .click();

    await page.waitForURL(/\/(login)?$/, { timeout: 30_000 });

    testUser = { ...testUser, id: '' };
  });
});
