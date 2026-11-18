import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('mock administration keeps local-person validation, role and identity choices', async ({
  page,
}) => {
  test.setTimeout(120000);
  const request = page.request,
    origin = 'http://127.0.0.1:3110';
  const guest = await (await request.get('/api/auth/context')).json();
  expect(
    (
      await request.post('/api/auth/setup', {
        headers: { Origin: origin },
        data: {
          csrf: guest.csrf,
          name: 'Mock UI owner',
          email: 'mock-ui@example.invalid',
          password: 'Isolated mock UI owner passphrase',
          demoPassword: 'Isolated mock UI fictional passphrase',
        },
      })
    ).ok(),
  ).toBe(true);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in as Demo Client Admin 1.0', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/administration');
  await page.getByText('Add a local person', { exact: true }).click();
  const form = page.getByRole('form', { name: 'Add a local person' });
  await form.getByLabel('Name', { exact: true }).fill('Isolated mock person');
  await form.getByLabel('Email address', { exact: true }).fill('isolated-person@example.com');
  await form.getByRole('radio', { name: 'Coordinator', exact: true }).check();
  await form.getByRole('radio', { name: 'Synthetic test person', exact: true }).check();
  await form.getByLabel('Reason', { exact: true }).fill('Verify isolated local identity choices');
  await form.getByRole('button', { name: 'Add person', exact: true }).click();
  await expect(form.getByRole('alert')).toBeVisible();
  await expect(form.getByLabel('Name', { exact: true })).toHaveValue('Isolated mock person');
  await form.getByLabel('Email address', { exact: true }).fill('isolated-person@example.invalid');
  await form.getByRole('button', { name: 'Add person', exact: true }).click();
  await expect(form.getByRole('status')).toHaveText(
    'Isolated mock person was added to this client.',
  );
  await expect(form.getByLabel('Name', { exact: true })).toHaveValue('');
  await expect(page.getByRole('table', { name: 'People and assignments' })).toContainText(
    'Isolated mock person',
  );
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await form.screenshot({ path: 'output/playwright/client-admin/local-person-mobile.png' });
});
