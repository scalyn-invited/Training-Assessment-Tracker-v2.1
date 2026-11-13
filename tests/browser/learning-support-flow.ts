import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
export async function learningSupportFlow(coordinator: Page, member: Page) {
  const receipt = coordinator.url();
  await coordinator.getByRole('link', { name: 'Back to learning plan', exact: true }).click();
  await coordinator.getByRole('link', { name: 'Progress and evidence', exact: true }).click();
  await expect(coordinator).toHaveURL(/\/progress$/);
  const url = coordinator.url(),
    support = coordinator.getByRole('region', { name: 'Learning support', exact: true });
  await support
    .locator('summary')
    .filter({ hasText: /^Request future adaptation$/ })
    .click();
  const reason = support.getByLabel('Request adaptation reason', { exact: true });
  await reason.fill('Provide scaffolded practice from approved evidence');
  coordinator.once('dialog', (d) => d.dismiss());
  await support.getByRole('button', { name: 'Request adaptation', exact: true }).click();
  await expect(reason).toHaveValue('Provide scaffolded practice from approved evidence');
  coordinator.once('dialog', (d) => d.accept());
  await support.getByRole('button', { name: 'Request adaptation', exact: true }).click();
  await expect(support.getByText('provisional', { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(
    support.getByRole('heading', { name: 'Block 3 adaptation', exact: true }),
  ).toBeVisible();
  await member.goto(url);
  await expect(member.getByText('No approved adaptations yet.', { exact: false })).toBeVisible();
  await expect(member.getByRole('button', { name: 'Approve adaptation', exact: true })).toHaveCount(
    0,
  );
  await support
    .getByLabel('Approve adaptation reason', { exact: true })
    .fill('Reviewed future teaching and unchanged requirements');
  await support.getByRole('button', { name: 'Refresh support status', exact: true }).click();
  await expect(support.getByLabel('Approve adaptation reason', { exact: true })).toHaveValue(
    'Reviewed future teaching and unchanged requirements',
  );
  coordinator.once('dialog', (d) => d.dismiss());
  await support.getByRole('button', { name: 'Approve adaptation', exact: true }).click();
  await expect(support.getByText('provisional', { exact: true })).toBeVisible();
  coordinator.once('dialog', (d) => d.accept());
  await support.getByRole('button', { name: 'Approve adaptation', exact: true }).click();
  await expect(support.getByText('approved', { exact: true })).toBeVisible();
  await member.reload();
  await expect(
    member.getByRole('heading', { name: 'Block 3 adaptation', exact: true }),
  ).toBeVisible();
  coordinator.once('dialog', (d) => d.accept());
  await support.getByRole('button', { name: 'Request support suggestions', exact: true }).click();
  await expect(
    support.getByRole('heading', { name: 'Support suggestions: provisional', exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await expect(
    member.getByRole('heading', { name: 'KPI support suggestions', exact: true }),
  ).toHaveCount(0);
  await support
    .locator('summary')
    .filter({ hasText: /^Review teaching changes$/ })
    .click();
  expect(await coordinator.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  expect(
    (
      await new AxeBuilder({ page: coordinator })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await coordinator.screenshot({
    path: 'output/playwright/learning-support-mobile.png',
    fullPage: true,
  });
  await coordinator.goto(receipt);
}
