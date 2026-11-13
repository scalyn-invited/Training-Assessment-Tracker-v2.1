import { curriculumFlow } from './curriculum-flow.js';
import { Database } from '../../packages/database/src/database.js';
import { expect, type Browser } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
export async function onboardingFlow(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } }),
    page = await context.newPage();
  try {
    await page.goto('http://127.0.0.1:3110/login');
    await page.getByLabel('Email', { exact: true }).fill('demo.1.2@example.invalid');
    await page.getByLabel('Password', { exact: true }).fill('Separate browser demo passphrase');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/clients$/);

    await page.getByRole('button', { name: 'Demo Client 1', exact: true }).click();
    await page.getByRole('link', { name: 'Training records', exact: true }).click();
    await page.getByRole('link', { name: 'Open onboarding', exact: true }).first().click();
    await expect(
      page.getByRole('heading', { name: 'Profile and role', exact: true }),
    ).toBeVisible();
    const url = page.url().split('?')[0];
    await page.getByLabel('Current role', { exact: true }).fill('Original learner role');
    await expect(
      page.getByText('Draft saved. This is not an approval.', { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Current role', { exact: true })).toHaveValue(
      'Original learner role',
    );
    let delayed = false;
    await page.route('**/api/enrolments/*/onboarding', async (route) => {
      if (route.request().method() === 'POST' && !delayed) {
        delayed = true;
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      await route.continue();
    });
    await page.getByLabel('Current role', { exact: true }).fill('First edit');
    await expect(page.getByText('Saving draft…', { exact: true })).toBeVisible();
    await page.getByLabel('Responsibilities', { exact: true }).fill('Newer responsibilities');
    await expect(
      page.getByText('Draft saved. This is not an approval.', { exact: true }),
    ).toBeVisible();
    await page.unroute('**/api/enrolments/*/onboarding');
    await page.reload();
    await expect(page.getByLabel('Responsibilities', { exact: true })).toHaveValue(
      'Newer responsibilities',
    );
    let navigationDelay = false;
    await page.route('**/api/enrolments/*/onboarding', async (route) => {
      if (route.request().method() === 'POST' && !navigationDelay) {
        navigationDelay = true;
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      await route.continue();
    });
    await page.getByLabel('Experience', { exact: true }).fill('Initial experience');
    await page.getByRole('button', { name: '2. Desired capability' }).click();
    await page
      .getByLabel('Experience', { exact: true })
      .fill('Newer experience during navigation save');
    await expect(
      page.getByText('Draft saved. This is not an approval.', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Profile and role', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Experience', { exact: true })).toHaveValue(
      'Newer experience during navigation save',
    );
    await page.unroute('**/api/enrolments/*/onboarding');
    await page.getByRole('button', { name: '3. Assessment findings' }).click();
    await page.getByLabel('Source or assessment reference').fill('Observed source');
    await page.getByLabel('Provider or observer').fill('Synthetic coordinator');
    await page.getByLabel('Assessment date').fill('2026-01-01');
    await page.getByLabel('Scoring scale').fill('Not scored');
    await page.getByLabel('Findings to confirm').fill('Reviewed safe practice');
    await page.getByLabel('Evidence type', { exact: true }).selectOption('observed evidence');
    await expect(
      page.getByText('Draft saved. This is not an approval.', { exact: true }),
    ).toBeVisible();
    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name: 'Confirm assessment findings', exact: true }).click();
    await expect(page.getByText('Assessment confirmation pending.', { exact: true })).toBeVisible();
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Confirm assessment findings', exact: true }).click();
    await expect(page.getByText('Assessment findings confirmed.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '4. Capacity and calendar' }).click();
    await page.getByLabel('Start date', { exact: true }).fill('2027-01-11');
    await page.getByLabel('Shared daily capacity (all plans)', { exact: true }).fill('60');
    await expect(
      page.getByText('Draft saved. This is not an approval.', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: '7. Review and create', exact: true }).click();
    await page
      .getByLabel('Reason for confirming or changing the shared calendar')
      .fill('Reviewed shared capacity for all plans');
    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name: 'Confirm shared calendar', exact: true }).click();
    await expect(
      page.getByLabel('Reason for confirming or changing the shared calendar'),
    ).toHaveValue('Reviewed shared capacity for all plans');
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Confirm shared calendar', exact: true }).click();
    await expect(
      page.getByText('Shared capacity calendar confirmed.', { exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: 'output/playwright/onboarding-review-mobile.png',
      fullPage: true,
    });
    await page.getByRole('button', { name: '1. Profile and role' }).click();
    const stale = await context.newPage();
    await stale.goto(url + '?step=profile');
    await expect(stale.getByLabel('Current role', { exact: true })).toHaveValue('First edit');
    await page.getByLabel('Current role', { exact: true }).fill('Fresh saved role');
    await expect(
      page.getByText('Draft saved. This is not an approval.', { exact: true }),
    ).toBeVisible();
    await stale.getByLabel('Current role', { exact: true }).fill('Retained stale edit');
    await expect(stale.locator('p[role=alert]')).toContainText('changed in another window');
    await expect(stale.getByLabel('Current role', { exact: true })).toHaveValue(
      'Retained stale edit',
    );
    await stale.close();
    await page.getByRole('button', { name: '3. Assessment findings' }).click();
    await page.getByLabel('Upload private assessment', { exact: true }).setInputFiles({
      name: 'onboarding-findings.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Synthetic observation: safe working practices demonstrated.'),
    });
    await page.getByRole('button', { name: 'Upload assessment', exact: true }).click();
    await expect(
      page.getByText(
        'Assessment uploaded to quarantine. Scanning must succeed before extraction.',
        { exact: true },
      ),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Review onboarding-findings.txt', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Review document extraction', exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/Scan: quarantined/)).toBeVisible();
    const file = page.url().split('/').at(-1)!;
    // Explicit synthetic scanner fixture; this is not antivirus qualification.
    const db = new Database('postgresql://postgres:postgres@127.0.0.1:55432/postgres');
    try {
      await db.pool.query("UPDATE evidence_files SET scan_status='clean' WHERE id=$1", [file]);
    } finally {
      await db.close();
    }
    await page.reload();
    await page.getByRole('button', { name: 'Request extraction', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Extraction status: ready', exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await expect(
      page.getByText('Synthetic observation: safe working practices demonstrated.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByLabel('Findings to confirm', { exact: true })).toHaveValue('');
    await page.getByLabel('Provider or observer').fill('Synthetic document observer');
    await page.getByLabel('Assessment date').fill('2026-01-01');
    await page.getByLabel('Scoring scale').fill('Observed, not scored');
    await page.getByLabel('Findings to confirm').fill('Reviewed safe working practices.');
    await page.getByLabel('Evidence type', { exact: true }).selectOption('observed evidence');
    await page.getByRole('button', { name: 'Save review draft', exact: true }).click();
    await expect(
      page.getByText('Review draft saved. Findings have not been confirmed or sent to AI.', {
        exact: true,
      }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Findings to confirm')).toHaveValue(
      'Reviewed safe working practices.',
    );
    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name: 'Confirm reviewed findings', exact: true }).click();
    await expect(page.getByLabel('Findings to confirm')).toHaveValue(
      'Reviewed safe working practices.',
    );
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: 'output/playwright/document-review-mobile.png', fullPage: true });
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Confirm reviewed findings', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Extraction status: confirmed', exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Back to assessment findings', exact: true }).click();
    await expect(page.getByLabel('Findings to confirm')).toHaveValue(
      'Reviewed safe working practices.',
    );
    await expect(
      page.getByText('Confirmed by coordinator for the saved assessment.', { exact: true }),
    ).toBeVisible();
    await curriculumFlow(page);
  } finally {
    await context.close();
  }
}
