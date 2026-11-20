import { notificationsFlow } from './notifications-flow.js';
import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
export async function learningProgressFlow(coordinator: Page, member: Page) {
  await coordinator.getByRole('link', { name: 'Progress and evidence', exact: true }).click();
  await expect(coordinator).toHaveURL(/\/progress$/);
  const url = coordinator.url();
  const card = coordinator
    .locator('section')
    .filter({
      has: coordinator.getByRole('button', { name: 'Refresh evidence snapshot', exact: true }),
    })
    .first();
  await expect(card.getByText('No sufficient result', { exact: false })).toBeVisible();
  await card
    .locator('summary')
    .filter({ hasText: /^Revise future KPI definition$/ })
    .click();
  const form = card.locator('form').filter({
    has: coordinator.getByRole('button', { name: 'Save future definition', exact: true }),
  });
  await form.getByLabel('Name', { exact: true }).fill('Verified browser KPI');
  await form.getByLabel('Unit', { exact: true }).fill('cases');
  await form.getByLabel('Target', { exact: true }).fill('10');
  await form.getByLabel('Formula', { exact: true }).selectOption('manual_mean');
  await form.getByLabel('Evidence type', { exact: true }).selectOption('workplace_outcome');
  await form.getByLabel('Minimum samples', { exact: true }).fill('2');
  const instant = Math.ceil((Date.now() + 10000) / 60000) * 60000;
  await form
    .getByLabel('Effective from (UTC)', { exact: true })
    .fill(new Date(instant).toISOString().slice(0, 16));
  await form
    .getByLabel('Revision reason', { exact: true })
    .fill('Use verified workplace cases for this measure');
  coordinator.once('dialog', (d) => d.dismiss());
  await form.getByRole('button', { name: 'Save future definition', exact: true }).click();
  await expect(form.getByLabel('Revision reason', { exact: true })).toHaveValue(
    'Use verified workplace cases for this measure',
  );
  coordinator.once('dialog', (d) => d.accept());
  await form.getByRole('button', { name: 'Save future definition', exact: true }).click();
  await expect(card.getByText(/Latest definition 2 takes effect/)).toBeVisible();
  await expect.poll(() => Date.now() >= instant, { timeout: 90000, intervals: [1000] }).toBe(true);
  await coordinator.reload();
  await expect(
    card.getByRole('heading', { name: 'Verified browser KPI', exact: true }),
  ).toBeVisible();
  await card
    .locator('summary')
    .filter({ hasText: /^Record workplace evidence$/ })
    .click();
  const observe = card
    .locator('form')
    .filter({ has: coordinator.getByRole('button', { name: 'Record evidence', exact: true }) });
  await observe.getByLabel('Observed value', { exact: true }).fill('8');
  await observe
    .getByLabel('Evidence reference', { exact: true })
    .fill('Verified synthetic workplace record one');
  await observe
    .getByLabel('Observation reason', { exact: true })
    .fill('Record verified synthetic performance');
  coordinator.once('dialog', (d) => d.dismiss());
  await observe.getByRole('button', { name: 'Record evidence', exact: true }).click();
  await expect(observe.getByLabel('Observed value', { exact: true })).toHaveValue('8');
  coordinator.once('dialog', (d) => d.accept());
  await observe.getByRole('button', { name: 'Record evidence', exact: true }).click();
  await expect(card.getByText(/1\/2 required samples/)).toBeVisible();
  await expect(card.getByText('No sufficient result', { exact: false })).toBeVisible();
  await observe.getByLabel('Observed value', { exact: true }).fill('12');
  await observe
    .getByLabel('Evidence reference', { exact: true })
    .fill('Verified synthetic workplace record two');
  await observe
    .getByLabel('Observation reason', { exact: true })
    .fill('Record second verified synthetic performance');
  coordinator.once('dialog', (d) => d.accept());
  await observe.getByRole('button', { name: 'Record evidence', exact: true }).click();
  await expect(card.getByText('on target', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Refresh evidence snapshot', exact: true }).click();
  await expect(
    card.getByText('Evidence snapshot recorded. Earlier snapshots remain in history.', {
      exact: true,
    }),
  ).toBeVisible();
  await member.goto(url);
  await expect(
    member.getByRole('heading', { name: 'Verified browser KPI', exact: true }),
  ).toBeVisible();
  await expect(member.getByText('on target', { exact: true })).toBeVisible();
  await expect(member.getByRole('button', { name: 'Record evidence', exact: true })).toHaveCount(0);
  await expect(
    member.getByText('Verified synthetic workplace record one', { exact: true }),
  ).toHaveCount(0);
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
  await coordinator.screenshot({ path: 'output/playwright/progress-mobile.png', fullPage: true });
  await notificationsFlow(member);
}
