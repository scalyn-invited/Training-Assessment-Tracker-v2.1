import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('QA real client all themes survive reload, default reset, desktop and mobile overlay', async ({
  page,
}, info) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const post = async (path: string, data: Record<string, unknown>) => {
    const ctx = await (await page.request.get('/api/auth/context')).json();
    const response = await page.request.post('/api' + path, {
      headers: { Origin: 'http://127.0.0.1:3490' },
      data: { ...data, csrf: ctx.csrf },
    });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const password = 'Isolated theme QA administrator passphrase';
  await post('/auth/setup', {
    name: 'Theme QA',
    email: 'theme-qa@example.invalid',
    password,
    demoPassword: 'Isolated theme demo passphrase',
  });
  await post('/auth/login', { email: 'theme-qa@example.invalid', password });
  const clients = await (await page.request.get('/api/clients')).json();
  await post('/clients/select', { clientId: clients[0].id });
  await page.goto('/dashboard');
  await expect(page.getByRole('complementary')).toBeVisible();
  const brand = await (await page.request.get('/api/branding/current?shared=0')).json();
  console.log('Theme enumeration', JSON.stringify(brand.themes));
  const trigger = page.getByRole('complementary').getByRole('button', { name: /^Theme(?: |$)/ });
  for (const [value, label] of Object.entries(brand.themes)) {
    await trigger.click();
    await page
      .getByRole('group', { name: 'Colour theme' })
      .getByRole('button', { name: String(label), exact: true })
      .click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', value);
    await expect(page.getByRole('group', { name: 'Colour theme' })).not.toBeVisible();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', value);
    await trigger.click();
    await expect(
      page
        .getByRole('group', { name: 'Colour theme' })
        .getByRole('button', { name: String(label), exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  }
  await trigger.click();
  await page.getByRole('button', { name: 'Use client default', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Colour theme' })).not.toBeVisible();
  const reset = await (await page.request.get('/api/branding/current?shared=0')).json();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', reset.selectedTheme);
  for (const size of [
    { width: 1280, height: 600 },
    { width: 1280, height: 300 },
    { width: 375, height: 420 },
    { width: 320, height: 300 },
  ]) {
    await page.setViewportSize(size);
    const mobile = size.width < 800;
    if (mobile) await page.getByRole('button', { name: 'Personal settings', exact: true }).click();
    const owner = mobile
      ? page.getByRole('dialog', { name: 'Personal settings', exact: true })
      : page.getByRole('complementary');
    const button = owner.getByRole('button', { name: /^Theme(?: |$)/ });
    await button.scrollIntoViewIfNeeded();
    const before = await owner.evaluate((el) => ({
      height: el.scrollHeight,
      width: el.scrollWidth,
    }));
    await button.focus();
    await page.keyboard.press('Space');
    const panel = page.getByRole('group', { name: 'Colour theme' });
    await expect(panel).toBeVisible();
    expect(
      await owner.evaluate((el) => ({ height: el.scrollHeight, width: el.scrollWidth })),
    ).toEqual(before);
    const box = await panel.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(size.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(size.height);
    await page.keyboard.press('End');
    await expect(panel.getByRole('button', { name: 'Use client default' })).toBeInViewport();
    expect(
      (
        await new AxeBuilder({ page })
          .include('.theme-options')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({ path: info.outputPath(`${size.width}x${size.height}.png`) });
    console.log('geometry', size, before, box);
    await page.keyboard.press('Escape');
    await expect(button).toBeFocused();
    expect(
      await owner.evaluate((el) => ({ height: el.scrollHeight, width: el.scrollWidth })),
    ).toEqual(before);
    if (mobile) {
      await expect(owner).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(owner).not.toBeVisible();
    } else {
      const signout = owner.getByRole('link', { name: 'Account security', exact: true });
      await signout.scrollIntoViewIfNeeded();
      await expect(signout).toBeInViewport();
    }
  }
  await page.setViewportSize({ width: 1280, height: 600 });
  for (const destination of [
    { label: 'Platform administration', url: '/platform' },
    { label: 'Learning workspace', url: '/dashboard' },
    { label: 'Choose your client', url: '/clients' },
    { label: 'Manage account access', url: '/accounts' },
  ]) {
    await page
      .getByRole('complementary')
      .getByRole('button', { name: /^Workspace / })
      .click();
    await page
      .getByRole('navigation', { name: 'Choose workspace' })
      .getByRole('link', { name: destination.label, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(destination.url + '$'));
    await expect(page.getByRole('complementary')).toBeVisible();
  }
  for (const size of [
    { width: 1280, height: 600 },
    { width: 1280, height: 300 },
    { width: 320, height: 300 },
    { width: 390, height: 420 },
    { width: 800, height: 300 },
  ]) {
    await page.setViewportSize(size);
    const sidebar = page.getByRole('complementary');
    const button = sidebar.getByRole('button', { name: /^Workspace / });
    await button.scrollIntoViewIfNeeded();
    const before = await sidebar.evaluate((el) => ({
      height: el.scrollHeight,
      width: el.scrollWidth,
    }));
    await button.click();
    const panel = page.getByRole('navigation', { name: 'Choose workspace' });
    await expect(panel).toBeVisible();
    expect(
      await sidebar.evaluate((el) => ({ height: el.scrollHeight, width: el.scrollWidth })),
    ).toEqual(before);
    const box = await panel.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(size.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(size.height);
    await page.screenshot({ path: info.outputPath(`workspace-${size.width}x${size.height}.png`) });
    await page.keyboard.press('Escape');
    await expect(button).toBeFocused();
  }
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto('/notifications');
  await page.getByRole('radio', { name: 'In-app updates only', exact: true }).check();
  await page
    .getByRole('complementary')
    .getByRole('button', { name: /^Workspace / })
    .click();
  let guarded = false;
  page.once('dialog', async (d) => {
    guarded = true;
    expect(d.type()).toBe('confirm');
    await d.dismiss();
  });
  await page
    .getByRole('navigation', { name: 'Choose workspace' })
    .getByRole('link', { name: 'Learning workspace', exact: true })
    .click();
  expect(guarded).toBe(true);
  await expect(page).toHaveURL(/\/notifications$/);
  await expect(page.getByRole('radio', { name: 'In-app updates only', exact: true })).toBeChecked();
  // The cancelled click keeps the original link in the open panel; a second click can confirm departure.
  page.once('dialog', (d) => d.accept());
  await page
    .getByRole('navigation', { name: 'Choose workspace' })
    .getByRole('link', { name: 'Learning workspace', exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(errors).toEqual([]);
});
