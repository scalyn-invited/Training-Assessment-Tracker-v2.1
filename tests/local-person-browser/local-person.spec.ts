import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Database } from '../../packages/database/src/database.js';
test('local-person creation preserves errors and grants only the chosen client role', async ({ page, request }) => {
  test.setTimeout(120000);
  const guest = await (await request.get('/api/auth/context')).json();
  expect((await request.post('/api/auth/setup', { headers: { Origin: 'http://127.0.0.1:3110' }, data: {
    csrf: guest.csrf, name: 'Private administrator', email: 'owner@example.invalid',
    password: 'Private mock fixture password', demoPassword: 'Separate mock fixture password' } })).ok()).toBeTruthy();
  await page.goto('/login');
  await page.getByRole('button', {name:'Sign in as Demo Client Admin 1.0',exact:true}).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto('/administration');
  await page.getByText('Add a local person', {exact:true}).click();
  const form = page.getByRole('form', {name:'Add a local person'});
  await form.getByLabel('Name', {exact:true}).fill('Browser local person');
  await form.getByLabel('Email address').fill('demo.1.3@example.invalid');
  await form.getByLabel('Synthetic test person', {exact:true}).check();
  await form.getByLabel('Reason', {exact:true}).fill('Approved browser local person creation');
  await form.getByRole('button', {name:'Add person',exact:true}).click();
  await expect(form.getByText('Review the existing identity before adding a client membership.')).toBeVisible();
  await expect(form.getByLabel('Name',{exact:true})).toHaveValue('Browser local person');
  await form.getByLabel('Email address').fill('browser.person@example.invalid');
  await page.setViewportSize({width:375,height:812});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  await form.screenshot({path:'output/playwright/local-person-mobile.png'});
  await form.getByRole('button',{name:'Add person',exact:true}).click();
  await expect(form.getByText('Browser local person was added to this client.')).toBeVisible();
  const db = new Database('postgresql://postgres:postgres@127.0.0.1:55432/postgres');
  try {
    const rows=(await db.pool.query("SELECT u.password_enabled,u.is_synthetic,r.role,r.scope_type FROM users u JOIN role_assignments r ON r.user_id=u.id WHERE u.email='browser.person@example.invalid'")).rows;
    expect(rows).toEqual([{password_enabled:false,is_synthetic:true,role:'member',scope_type:'client'}]);
  } finally {await db.close();}
});
