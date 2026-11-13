import { learningSupportFlow } from './learning-support-flow.js';
import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { learningLifecycleFlow } from './learning-lifecycle-flow.js';
export async function learningReviewFlow(coordinator: Page, member: Page) {
  await member.getByRole('link', { name: 'Return to lesson', exact: true }).click();
  await member.getByRole('radio', { name: 'Observed practice', exact: true }).nth(1).check();
  await expect(
    member.getByText('Draft saved. This has not been submitted.', { exact: true }),
  ).toBeVisible();
  member.once('dialog', (d) => d.accept());
  await member.getByRole('button', { name: 'Submit saved work for review', exact: true }).click();
  await expect(
    member.getByRole('heading', { name: 'Submission receipt', exact: true }),
  ).toBeVisible();
  const receipt = member.url();
  await coordinator.goto(receipt);
  await coordinator
    .locator('summary')
    .filter({ hasText: /^Request provisional grading$/ })
    .click();
  await coordinator
    .getByLabel('Request provisional grading reason', { exact: true })
    .fill('Compare the independently reviewed answer key');
  coordinator.once('dialog', (d) => d.dismiss());
  await coordinator
    .getByRole('button', { name: 'Request provisional grading', exact: true })
    .click();
  await expect(
    coordinator.getByLabel('Request provisional grading reason', { exact: true }),
  ).toHaveValue('Compare the independently reviewed answer key');
  coordinator.once('dialog', (d) => d.accept());
  await coordinator
    .getByRole('button', { name: 'Request provisional grading', exact: true })
    .click();
  await expect(coordinator.getByText('Provisional total: 100', { exact: true })).toBeVisible();
  await member.reload();
  await expect(member.getByRole('heading', { name: 'Approved feedback', exact: true })).toHaveCount(
    0,
  );
  await expect(member.getByRole('heading', { name: 'Grading attempts', exact: true })).toHaveCount(
    0,
  );
  await coordinator
    .getByLabel('Approve grade reason', { exact: true })
    .fill('Independently confirmed both answers and submitted evidence');
  coordinator.once('dialog', (d) => d.dismiss());
  await coordinator.getByRole('button', { name: 'Approve grade', exact: true }).click();
  await expect(coordinator.getByLabel('Approve grade reason', { exact: true })).toHaveValue(
    'Independently confirmed both answers and submitted evidence',
  );
  coordinator.once('dialog', (d) => d.accept());
  await coordinator.getByRole('button', { name: 'Approve grade', exact: true }).click();
  await expect(coordinator.getByText('Score: 100 / 100', { exact: true })).toBeVisible();
  await member.reload();
  await expect(member.getByText('Score: 100 / 100', { exact: true })).toBeVisible();
  await member
    .getByLabel('Request an appeal reason', { exact: true })
    .fill('Request an independent check of the evidence');
  member.once('dialog', (d) => d.accept());
  await member.getByRole('button', { name: 'Request an appeal', exact: true }).click();
  await expect(member.getByRole('heading', { name: 'Appeal / open', exact: true })).toBeVisible();
  await coordinator.reload();
  await expect(
    coordinator.getByRole('heading', { name: 'Human assessment or override', exact: true }),
  ).toHaveCount(0);
  const browser = member.context().browser()!,
    adminContext = await browser.newContext({ viewport: { width: 375, height: 812 } }),
    alternateContext = await browser.newContext({ viewport: { width: 375, height: 812 } }),
    admin = await adminContext.newPage(),
    alternate = await alternateContext.newPage();
  async function login(page: Page, email: string) {
    await page.goto('http://127.0.0.1:3110/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill('Separate browser demo passphrase');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/clients$/);

    await page.getByRole('button', { name: 'Demo Client 1', exact: true }).click();
    await expect(
      page.getByRole('combobox', { name: 'Active client', exact: true }).locator('option:checked'),
    ).toHaveText('Demo Client 1');
  }
  try {
    await login(admin, 'demo.1.0@example.invalid');
    await admin.goto('http://127.0.0.1:3110/learning-reviews');
    await admin.getByText(/^Learning case /).click();
    await admin
      .getByRole('combobox', { name: /^Alternate reviewer for / })
      .selectOption({ label: 'Demo Coordinator 1.1' });
    await admin
      .getByLabel('Assign learning reviewer reason', { exact: true })
      .fill('Assign a different eligible team coordinator');
    admin.once('dialog', (d) => d.dismiss());
    await admin.getByRole('button', { name: 'Assign learning reviewer', exact: true }).click();
    admin.once('dialog', (d) => d.accept());
    await admin.getByRole('button', { name: 'Assign learning reviewer', exact: true }).click();
    await expect(
      admin.getByText('Independent learning reviewer assigned.', { exact: true }),
    ).toBeVisible();
    await expect(
      admin.getByText('Observed safe practice and recorded evidence.', { exact: true }),
    ).toHaveCount(0);
    await login(alternate, 'demo.1.1@example.invalid');
    await alternate.goto('http://127.0.0.1:3110/learning-reviews');
    await alternate
      .getByRole('link', { name: 'Demo Member 1.3 / Browser training record', exact: true })
      .click();
    await expect(alternate.getByText('Score: 100 / 100', { exact: true })).toBeVisible();
    await expect(alternate.getByText('Provisional total: 100', { exact: true })).toHaveCount(0);
    await alternate
      .getByLabel('Uphold existing decision reason', { exact: true })
      .fill('Independent review confirms the original evidence and outcome');
    alternate.once('dialog', (d) => d.dismiss());
    await alternate.getByRole('button', { name: 'Uphold existing decision', exact: true }).click();
    alternate.once('dialog', (d) => d.accept());
    await alternate.getByRole('button', { name: 'Uphold existing decision', exact: true }).click();
    await expect(
      alternate.getByRole('heading', { name: 'Independent review recorded', exact: true }),
    ).toBeVisible();
    await alternate.goto(receipt);
    await expect(
      alternate.getByText('This submission is unavailable.', { exact: true }),
    ).toBeVisible();
  } finally {
    await adminContext.close();
    await alternateContext.close();
  }
  await coordinator.goto(receipt);
  for (let i = 1; i <= 2; i++) {
    await coordinator.getByLabel('Score for criterion ' + i, { exact: true }).fill('90');
    await coordinator
      .getByLabel('Evidence and feedback for criterion ' + i, { exact: true })
      .fill('The recorded demonstration supports this criterion.');
  }
  await coordinator
    .getByRole('checkbox', { name: 'Insufficient evidence for criterion 2', exact: true })
    .check();
  await coordinator.getByRole('radio', { name: 'Approve', exact: true }).check();
  await coordinator
    .getByLabel('Decision rationale', { exact: true })
    .fill('Record a supported human regrade with preserved history');
  coordinator.once('dialog', (d) => d.accept());
  await coordinator.getByRole('button', { name: 'Record human decision', exact: true }).click();
  await expect(coordinator.getByText(/Insufficient evidence cannot become/)).toBeVisible();
  await expect(coordinator.getByLabel('Score for criterion 1', { exact: true })).toHaveValue('90');
  await coordinator
    .getByRole('checkbox', { name: 'Insufficient evidence for criterion 2', exact: true })
    .uncheck();
  coordinator.once('dialog', (d) => d.accept());
  await coordinator.getByRole('button', { name: 'Record human decision', exact: true }).click();
  await expect(coordinator.getByText('Score: 90 / 100', { exact: true })).toBeVisible();
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
    path: 'output/playwright/learning-review-mobile.png',
    fullPage: true,
  });
  await member.reload();
  await expect(member.getByText('Score: 90 / 100', { exact: true })).toBeVisible();
  await expect(member.getByRole('heading', { name: 'Grading attempts', exact: true })).toHaveCount(
    0,
  );
  await learningSupportFlow(coordinator, member);
  await learningLifecycleFlow(coordinator, member);
}
