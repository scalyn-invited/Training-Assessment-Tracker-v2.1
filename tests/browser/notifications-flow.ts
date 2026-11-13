import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
export async function notificationsFlow(member: Page) {
  const returnTo = member.url();
  await member.goto('/notifications');
  await expect(
    member.getByRole('heading', { name: 'Training updates', exact: true }),
  ).toBeVisible();
  await expect(
    member.getByRole('link', { name: 'programme ready', exact: true }).first(),
  ).toBeVisible();
  await expect(member.getByText('sink delivered', { exact: false }).first()).toBeVisible();
  await member.getByRole('radio', { name: 'In-app updates only', exact: true }).check();
  await member.route('**/api/notifications', async (route) => {
    if (route.request().method() === 'POST')
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Preference could not be saved. Try again.' }),
      });
    else await route.continue();
  });
  await member.getByRole('button', { name: 'Save preference', exact: true }).click();
  await expect(
    member.getByText('Preference could not be saved. Try again.', { exact: true }),
  ).toBeVisible();
  await expect(
    member.getByRole('radio', { name: 'In-app updates only', exact: true }),
  ).toBeChecked();
  await member.unroute('**/api/notifications');
  await member.getByRole('button', { name: 'Save preference', exact: true }).click();
  await expect(
    member.getByText('Email preference saved. In-app updates remain available.', { exact: true }),
  ).toBeVisible();
  await member.reload();
  await expect(
    member.getByRole('radio', { name: 'In-app updates only', exact: true }),
  ).toBeChecked();
  await member.getByRole('button', { name: 'Refresh updates', exact: true }).click();
  await expect(
    member.getByRole('link', { name: 'feedback ready', exact: true }).first(),
  ).toBeVisible();
  expect(await member.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  expect(
    (await new AxeBuilder({ page: member }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await member.screenshot({ path: 'output/playwright/notifications-mobile.png', fullPage: true });
  await member.getByRole('link', { name: 'feedback ready', exact: true }).first().click();
  await expect(member).toHaveURL(/\/delivery$/);
  await member.goto(returnTo);
}
