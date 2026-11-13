import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { learningProgressFlow } from './learning-progress-flow.js';
export async function learningLifecycleFlow(coordinator: Page, member: Page) {
  await coordinator.getByRole('link', { name: 'Back to learning plan', exact: true }).click();
  await expect(coordinator).toHaveURL(/\/enrolments\/[^/]+\/delivery$/);
  const overview = coordinator.url();
  await coordinator
    .locator('summary')
    .filter({ hasText: /^Pause programme$/ })
    .click();
  await coordinator
    .getByLabel('Pause programme reason', { exact: true })
    .fill('Approved leave before resuming scheduled training');
  coordinator.once('dialog', (d) => d.dismiss());
  await coordinator.getByRole('button', { name: 'Pause programme', exact: true }).click();
  await expect(coordinator.getByLabel('Pause programme reason', { exact: true })).toHaveValue(
    'Approved leave before resuming scheduled training',
  );
  coordinator.once('dialog', (d) => d.accept());
  await coordinator.getByRole('button', { name: 'Pause programme', exact: true }).click();
  await expect(coordinator.getByText('paused', { exact: true })).toBeVisible();
  await member.goto(overview);
  await expect(member.getByText('paused', { exact: true })).toBeVisible();
  await expect(member.getByRole('button', { name: 'Preview resumption', exact: true })).toHaveCount(
    0,
  );
  await coordinator.getByLabel('Move unstarted blocks by weeks', { exact: true }).fill('2');
  await coordinator
    .getByLabel('Resumption reason', { exact: true })
    .fill('Resume after two weeks of approved leave');
  await coordinator.getByRole('button', { name: 'Preview resumption', exact: true }).click();
  await expect(
    coordinator.getByRole('heading', { name: 'Move unstarted blocks by 2 weeks', exact: true }),
  ).toBeVisible();
  coordinator.once('dialog', (d) => d.dismiss());
  await coordinator
    .getByRole('button', { name: 'Confirm preview and resume', exact: true })
    .click();
  await expect(coordinator.getByText('paused', { exact: true })).toBeVisible();
  coordinator.once('dialog', (d) => d.accept());
  await coordinator
    .getByRole('button', { name: 'Confirm preview and resume', exact: true })
    .click();
  await expect(coordinator.getByText('active', { exact: true })).toBeVisible();
  await coordinator
    .locator('summary')
    .filter({ hasText: /^Confirm programme completion$/ })
    .click();
  await coordinator
    .getByLabel('Complete programme reason', { exact: true })
    .fill('Verify completion cannot bypass required evidence');
  coordinator.once('dialog', (d) => d.accept());
  await coordinator.getByRole('button', { name: 'Complete programme', exact: true }).click();
  await expect(
    coordinator.getByText('Every required lesson needs approved evidence.', { exact: true }),
  ).toBeVisible();
  await expect(coordinator.getByLabel('Complete programme reason', { exact: true })).toHaveValue(
    'Verify completion cannot bypass required evidence',
  );
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
  await coordinator.screenshot({ path: 'output/playwright/lifecycle-mobile.png', fullPage: true });
  await coordinator.getByLabel('Complete programme reason', { exact: true }).fill('');
  await learningProgressFlow(coordinator, member);
}
