import { test, expect } from '@playwright/test';

// Real API/Next; only delay delivery of the actual lazy editor bundle.
test('builder never exposes unbound controls while its lazy editor loads', async ({ page }) => {
  test.setTimeout(90000);
  async function post(path: string, data: Record<string, unknown>) {
    const c = await (await page.request.get('/api/auth/context')).json();
    const r = await page.request.post('/api' + path, {
      headers: { Origin: 'http://127.0.0.1:3110' },
      data: { ...data, csrf: c.csrf },
    });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  }
  await post('/auth/setup', {
    name: 'Lazy QA',
    email: 'lazy@example.invalid',
    password: 'Isolated lazy administrator',
    demoPassword: 'Isolated lazy demonstration',
  });
  await post('/auth/login', {
    email: 'demo.1.2@example.invalid',
    password: 'Isolated lazy demonstration',
  });
  const clients = await (await page.request.get('/api/clients')).json();
  await post('/clients/select', {
    clientId: clients.find((c: { name: string }) => c.name === 'Demo Client 1').id,
  });
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  let requested = false;
  await page.route('**/_next/static/chunks/*.js', async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (body.includes('Publication outcome unknown')) {
      requested = true;
      await held;
    }
    await route.fulfill({ response, body });
  });
  await page.goto('/assessments/definitions/new');
  await expect.poll(() => requested).toBe(true);
  await expect(page.locator('[data-application-shell]')).toHaveCount(1);
  await expect(page.getByText('Loading assessment builder...', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Assessment title', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toHaveCount(0);
  release();
  await expect(
    page.getByRole('heading', { name: 'Build an assessment', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Assessment title', { exact: true }).fill('Immediately protected');
  let dialogs = 0;
  page.once('dialog', async (dialog) => {
    dialogs++;
    await dialog.dismiss();
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  expect(dialogs).toBe(1);
  await expect(page.getByLabel('Assessment title', { exact: true })).toHaveValue(
    'Immediately protected',
  );
});
