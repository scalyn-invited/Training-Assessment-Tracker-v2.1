import { learningReviewFlow } from './learning-review-flow.js';
import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Database } from '../../packages/database/src/database.js';
export async function deliveryFlow(page: Page) {
  const id = page.url().match(/enrolments\/([^/]+)/)![1];
  await page.goto(`http://127.0.0.1:3110/enrolments/${id}/delivery`);
  await page
    .getByLabel('Activate programme reason')
    .fill('Activate the reviewed approved baseline');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Activate programme', exact: true }).click();
  await expect(page.getByLabel('Activate programme reason')).toHaveValue(
    'Activate the reviewed approved baseline',
  );
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Activate programme', exact: true }).click();
  await expect(page.getByText('active', { exact: true })).toBeVisible();
  await page.locator('.file-list a').first().click();
  await expect(page).toHaveURL(/delivery\/[a-f0-9-]+\/0$/);
  const lesson = page.url();
  await expect(page.getByText('Apply safe practice for block 1', { exact: true })).toBeVisible();
  await page.getByText('Publish an objective quiz for this lesson', { exact: true }).click();
  for (let i = 1; i <= 2; i++) {
    await page
      .getByLabel('Question ' + i, { exact: true })
      .fill('Which method provides safe evidence?');
    await page
      .getByLabel('Answer options ' + i, { exact: true })
      .fill('Observed practice\nGuesswork');
  }
  await page
    .getByLabel('Review and publication reason')
    .fill('Reviewed objective quiz against both criteria');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Publish reviewed quiz' }).click();
  await expect(page.getByLabel('Question 1', { exact: true })).toHaveValue(
    'Which method provides safe evidence?',
  );
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Publish reviewed quiz' }).click();
  await expect(page.getByRole('button', { name: 'Publish reviewed quiz' })).toHaveCount(0);
  const db = new Database('postgresql://postgres:postgres@127.0.0.1:55432/postgres');
  let email: string;
  try {
    email = (
      await db.pool.query(
        'SELECT u.email FROM enrolments e JOIN users u ON u.id=e.member_id WHERE e.id=$1',
        [id],
      )
    ).rows[0].email;
  } finally {
    await db.close();
  }
  const memberContext = await page
      .context()
      .browser()!
      .newContext({ viewport: { width: 375, height: 812 } }),
    member = await memberContext.newPage();
  try {
    await member.goto('http://127.0.0.1:3110/login');
    await member.getByLabel('Email', { exact: true }).fill(email);
    await member.getByLabel('Password', { exact: true }).fill('Separate browser demo passphrase');
    await member.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(member).toHaveURL(/\/clients$/);

    await member.getByRole('button', { name: 'Demo Client 1', exact: true }).click();
    await expect(
      member.getByRole('combobox', { name: 'Active client', exact: true }).locator('option:checked'),
    ).toHaveText('Demo Client 1');
    await member.goto(lesson);
    await expect(member.getByText(/Preview only/)).toBeVisible();
    await expect(member.getByLabel('Your response', { exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: 'Back to learning plan', exact: true }).click();
    await page.getByText('Authorise early start', { exact: true }).first().click();
    await page
      .getByLabel('Authorise and lock block reason')
      .first()
      .fill('Member ready to begin this block early');
    page.once('dialog', (d) => d.accept());
    await page
      .getByRole('button', { name: 'Authorise and lock block', exact: true })
      .first()
      .click();
    await expect(
      page.getByText('Version 1 / Started; version locked', { exact: true }),
    ).toBeVisible();
    await member.reload();
    await member
      .getByLabel('Your response', { exact: true })
      .fill('Observed safe practice and recorded evidence.');
    await expect(
      member.getByText('Draft saved. This has not been submitted.', { exact: true }),
    ).toBeVisible();
    // Synthetic scan-state fixture only; this does not qualify an antivirus provider.
    const evidenceId = randomUUID(),
      evidenceDb = new Database('postgresql://postgres:postgres@127.0.0.1:55432/postgres');
    try {
      await evidenceDb.pool.query(
        "INSERT INTO evidence_files(id,organisation_id,environment,enrolment_id,uploaded_by,storage_key,original_name,mime,bytes,sha256,scan_status,sensitive,purpose) SELECT $1::uuid,e.organisation_id,e.environment,e.id,e.member_id,$1::text,'Delivery scan recovery.txt','text/plain',5,'synthetic fixture','clean',false,'evidence' FROM enrolments e WHERE e.id=$2",
        [evidenceId, id],
      );
      await member.getByRole('button', { name: 'Refresh evidence', exact: true }).click();
      await member
        .getByRole('checkbox', { name: 'Delivery scan recovery.txt - clean', exact: true })
        .check();
      await expect(
        member.getByText('Draft saved. This has not been submitted.', { exact: true }),
      ).toBeVisible();
      await evidenceDb.pool.query("UPDATE evidence_files SET scan_status='rejected' WHERE id=$1", [
        evidenceId,
      ]);
      await member.getByRole('button', { name: 'Refresh evidence', exact: true }).click();
      await member
        .getByRole('checkbox', { name: 'Delivery scan recovery.txt - rejected', exact: true })
        .uncheck();
      await expect(
        member.getByText('Draft saved. This has not been submitted.', { exact: true }),
      ).toBeVisible();
    } finally {
      await evidenceDb.close();
    }
    await member.getByRole('radio', { name: 'Observed practice', exact: true }).first().check();
    await expect(
      member.getByText('Draft saved. This has not been submitted.', { exact: true }),
    ).toBeVisible();
    expect(await member.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page: member }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await member.screenshot({ path: 'output/playwright/lesson-mobile.png', fullPage: true });
    member.once('dialog', (d) => d.dismiss());
    await member.getByRole('button', { name: 'Submit saved work for review', exact: true }).click();
    await expect(member.getByLabel('Your response', { exact: true })).toHaveValue(
      'Observed safe practice and recorded evidence.',
    );
    member.once('dialog', (d) => d.accept());
    await member.getByRole('button', { name: 'Submit saved work for review', exact: true }).click();
    await expect(
      member.getByRole('heading', { name: 'Submission receipt', exact: true }),
    ).toBeVisible();
    await expect(member.getByText('Status: submitted', { exact: true })).toBeVisible();
    await member.getByText('Withdraw this attempt', { exact: true }).click();
    await member
      .getByLabel('Withdraw attempt reason')
      .fill('Replace this with a clearer demonstration');
    member.once('dialog', (d) => d.dismiss());
    await member.getByRole('button', { name: 'Withdraw attempt', exact: true }).click();
    await expect(member.getByText('Status: submitted', { exact: true })).toBeVisible();
    member.once('dialog', (d) => d.accept());
    await member.getByRole('button', { name: 'Withdraw attempt', exact: true }).click();
    await expect(member.getByText('Status: withdrawn', { exact: true })).toBeVisible();
    expect(
      (await new AxeBuilder({ page: member }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await member.screenshot({ path: 'output/playwright/submission-mobile.png', fullPage: true });
    await learningReviewFlow(page, member);
  } finally {
    await memberContext.close();
  }
}
