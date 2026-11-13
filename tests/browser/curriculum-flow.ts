import { Database } from '../../packages/database/src/database.js';
import { deliveryFlow } from './delivery-flow.js';
import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
export async function curriculumFlow(page: Page) {
  await page.getByRole('button', { name: '1. Profile and role' }).click();
  for (const [label, value] of [
    ['Current role', 'Operator'],
    ['Responsibilities', 'Safe practice'],
    ['Experience', 'One year'],
    ['Tools available', 'Laptop and handbook'],
    ['Language and accessibility preferences', 'English'],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await expect(
    page.getByText('Draft saved. This is not an approval.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '2. Desired capability' }).click();
  for (const [label, value] of [
    ['Target role or skill', 'Supervisor'],
    ['Business purpose', 'Safe independent practice'],
    ['Expected proficiency', 'Independent'],
    ['Practical examples of success', 'Complete tasks safely'],
    ['Prerequisite skills', 'Induction'],
    ['Target competencies (one per line)', 'Safe practice'],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await expect(
    page.getByText('Draft saved. This is not an approval.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '4. Capacity and calendar' }).click();
  await page.getByLabel('Start date', { exact: true }).fill('2090-01-02');
  for (const day of ['Tuesday', 'Wednesday', 'Thursday', 'Friday'])
    await page.getByRole('checkbox', { name: day, exact: true }).uncheck();
  await expect(
    page.getByText('Draft saved. This is not an approval.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '5. Measures of success' }).click();
  for (let i = 1; i <= 3; i++) {
    const group = page.getByRole('group', { name: 'KPI ' + i, exact: true });
    for (const [label, value] of [
      ['Name', 'Measure ' + i],
      ['Baseline (or unknown)', 'unknown'],
      ['Target', '90'],
      ['Unit', 'percent'],
      ['Why this matters', 'Safety'],
      ['Evidence method', 'Observed demonstration'],
      ['Review cadence', 'Weekly'],
    ])
      await group.getByLabel(label, { exact: true }).fill(value);
  }
  await expect(
    page.getByText('Draft saved. This is not an approval.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '6. Learning resources' }).click();
  for (const [label, value] of [
    ['Approved resource title', 'Reviewed handbook'],
    ['Resource URL or internal reference', 'Internal handbook'],
    ['Licence or permission to use', 'Internal use'],
    ['Cost and budget approval', 'No cost'],
    ['Member access and required software checked', 'Access confirmed'],
    ['Suitable practical tasks', 'Safe practice'],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await expect(
    page.getByText('Draft saved. This is not an approval.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '7. Review and create', exact: true }).click();
  await page
    .getByLabel('Reason for confirming or changing the shared calendar')
    .fill('Confirm Monday-only calendar for curriculum');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Confirm shared calendar', exact: true }).click();
  await expect(
    page.getByText('Shared capacity calendar confirmed.', { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel('Draft creation or rescheduling reason')
    .fill('Create the fully reviewed manual curriculum');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: '1. Profile and role' }).click();
  await expect(page.getByLabel('Draft creation or rescheduling reason')).toHaveValue(
    'Create the fully reviewed manual curriculum',
  );
  await page.getByRole('button', { name: 'Create curriculum draft', exact: true }).click();
  await expect(page).toHaveURL(/\/plan\?version=1/);
  await expect(page.getByText('Curriculum · Version 1', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Validate all blocks and request review', exact: true })
    .click();
  await expect(page.locator('p[role=alert]')).toContainText('usable content');
  await page.getByText('Generate or revise with AI', { exact: true }).click();
  await page
    .getByLabel('Revision notes (optional)', { exact: true })
    .fill('Keep these notes while editing blocks.');
  for (let i = 0; i < 4; i++) {
    if (i)
      await page
        .getByRole('navigation', { name: 'Learning blocks' })
        .getByRole('button')
        .nth(i)
        .click();
    await page
      .getByLabel('Learning objective', { exact: true })
      .fill('Apply safe practice for block ' + (i + 1));
    await page
      .getByLabel('Prerequisites and sequence', { exact: true })
      .fill('Complete induction first');
    await page
      .getByLabel('Criterion one and evidence expectations', { exact: true })
      .fill('Demonstrate a safe method');
    await page
      .getByLabel('Criterion two and evidence expectations', { exact: true })
      .fill('Record verifiable evidence');
    for (const [label, value] of [
      ['Lesson title', 'Safe practice lesson'],
      ['Explanation and learning content', 'Read the reviewed method.'],
      ['Worked example or approved demonstration', 'Observe the worked example.'],
      ['Practical activity and deliverable', 'Demonstrate the method.'],
      ['Permitted tools', 'Use the supplied handbook.'],
      ['Completion criteria and evidence required', 'Record the observed demonstration.'],
    ])
      await page.getByLabel(label, { exact: true }).fill(value);
    for (const [label, value] of [
      ['Reading minutes', '5'],
      ['Practice minutes', '15'],
      ['Assessment minutes', '5'],
      ['Revision minutes', '5'],
    ])
      await page.getByLabel(label, { exact: true }).fill(value);
    await page
      .getByLabel('Reason for this version', { exact: true })
      .fill('Complete reviewed block ' + (i + 1));
    await page.getByRole('button', { name: 'Save new draft version', exact: true }).click();
    await expect(
      page.getByText('New draft version saved. Review must be requested again.', { exact: true }),
    ).toBeVisible();
  }
  await expect(page.getByLabel('Revision notes (optional)', { exact: true })).toHaveValue(
    'Keep these notes while editing blocks.',
  );
  await page.getByLabel('Revision notes (optional)', { exact: true }).fill('');
  await page
    .getByRole('button', { name: 'Validate all blocks and request review', exact: true })
    .click();
  await expect(
    page.getByText('All blocks validated. This exact version is awaiting coordinator approval.', {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel('Approval rationale', { exact: true })
    .fill('All four blocks and shared capacity reviewed');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('link', { name: 'Review onboarding or reschedule', exact: true }).click();
  await expect(page.getByLabel('Approval rationale', { exact: true })).toHaveValue(
    'All four blocks and shared capacity reviewed',
  );
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Approve exact version 5', exact: true }).click();
  await expect(page.getByLabel('Approval rationale', { exact: true })).toHaveValue(
    'All four blocks and shared capacity reviewed',
  );
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Approve exact version 5', exact: true }).click();
  await expect(
    page.getByText('Exact plan version approved. Enrolment is ready; training has not started.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Approval receipt', exact: true })).toBeVisible();
  await page
    .getByText('Confirmed competency, KPI and resource references', { exact: true })
    .click();
  await expect(
    page.getByText('Reviewed handbook · Internal handbook', { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel('Learning objective', { exact: true })
    .fill('Refined safe practice objective');
  await page
    .getByLabel('Reason for this version', { exact: true })
    .fill('Clarify approved block without overwriting history');
  await page.getByRole('button', { name: 'Save new draft version', exact: true }).click();
  await expect(page.getByText('Curriculum · Version 6', { exact: true })).toBeVisible();
  await page.getByText('Compare this block with previous version', { exact: true }).click();
  await expect(page.getByText('Refined safe practice objective', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: 'output/playwright/curriculum-mobile.png', fullPage: true });
  await page.getByText('Version history', { exact: true }).click();
  await page.getByRole('button', { name: 'Version 5 · approved', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Approval receipt', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Save new draft version', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Version 6 · draft', exact: true }).click();
  await page.getByText('Generate or revise with AI', { exact: true }).click();
  await page
    .getByLabel('Revision notes (optional)', { exact: true })
    .fill('Use the reviewed safe practice examples.');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('link', { name: 'Review onboarding or reschedule', exact: true }).click();
  await expect(page.getByLabel('Revision notes (optional)', { exact: true })).toHaveValue(
    'Use the reviewed safe practice examples.',
  );
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Queue curriculum generation', exact: true }).click();
  await expect(page.getByLabel('Revision notes (optional)', { exact: true })).toHaveValue(
    'Use the reviewed safe practice examples.',
  );
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Queue curriculum generation', exact: true }).click();
  await expect(page).toHaveURL(/\/generation\/[a-f0-9-]+$/);
  await expect(
    page.getByRole('heading', { name: 'Generation progress', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('4 of 4 blocks complete · complete', { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await expect(
    page.getByText('Revision notes: Use the reviewed safe practice examples.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/synthetic demonstration/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Provider attempts', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: 'output/playwright/generation-mobile.png', fullPage: true });
  const archivedRun = page.url().split('/').at(-1)!;
  const archiveDb = new Database('postgresql://postgres:postgres@127.0.0.1:55432/postgres');
  try {
    await archiveDb.pool.query('UPDATE ai_runs SET task_input=NULL,feedback=NULL WHERE id=$1', [
      archivedRun,
    ]);
  } finally {
    await archiveDb.close();
  }
  await page.reload();
  await expect(
    page.getByText('Revision notes: Removed under retention policy', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Configuration and provenance', exact: true }),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Review generated draft · version 7', exact: true }).click();
  await expect(page.getByText('Curriculum · Version 7', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Learning objective', { exact: true })).toHaveValue(
    'Synthetic practice objective: apply the reviewed method.',
  );
  await expect(page.getByRole('heading', { name: 'Approval receipt', exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Validate all blocks and request review', exact: true }),
  ).toBeVisible();
  await deliveryFlow(page);
}
