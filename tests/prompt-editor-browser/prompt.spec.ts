import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';

test('question prompt exposes a reusable accessible formatting toolbar', async ({ page }, info) => {
  test.setTimeout(180000);
  const post = async (path: string, data: Record<string, unknown>) => {
    const ctx = await (await page.request.get('/api/auth/context')).json();
    const response = await page.request.post('/api' + path, {
      headers: { Origin: 'http://127.0.0.1:3110' },
      data: { ...data, csrf: ctx.csrf },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  await post('/auth/setup', {
    name: 'Prompt editor QA',
    email: 'prompt-qa@example.invalid',
    password: 'Isolated prompt administrator passphrase',
    demoPassword: 'Isolated prompt demonstration passphrase',
  });
  await post('/auth/login', {
    email: 'demo.1.2@example.invalid',
    password: 'Isolated prompt demonstration passphrase',
  });
  const clients = await (await page.request.get('/api/clients')).json();
  const client = clients.find((row: { name: string }) => row.name === 'Demo Client 1').id;
  await post('/clients/select', { clientId: client });
  await page.goto('/assessments/definitions/new');
  await page.getByLabel('Assessment title', { exact: true }).fill('Rich prompt regression');
  await page.locator('[data-section="questions"]').click();
  await page
    .getByLabel('Section title (required for publication)', { exact: true })
    .fill('Practice');
  await page.getByTestId('prompt-editor').fill('Explain this example.');
  const toolbar = page.getByRole('toolbar', { name: 'Prompt formatting' });
  await expect(toolbar).toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'Code block', exact: true })).toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'Insert image', exact: true })).toBeVisible();
  const prompt = page.getByTestId('prompt-editor');
  const tool = (name: string) => toolbar.getByRole('button', { name, exact: true });
  await prompt.press('ControlOrMeta+a');
  await tool('Bold').click();
  await expect(prompt.locator('strong')).toHaveText('Explain this example.');
  await tool('Underline').click();
  await expect(prompt.locator('u')).toHaveText('Explain this example.');
  await tool('Code block').click();
  await expect(prompt.locator('pre code')).toHaveText('Explain this example.');
  await tool('Undo').click();
  await expect(prompt.locator('pre')).toHaveCount(0);
  await tool('Redo').click();
  await expect(prompt.locator('pre')).toHaveCount(1);
  await tool('Text style').click();
  await page.getByRole('button', { name: 'Heading 2', exact: true }).click();
  await expect(
    prompt.getByRole('heading', { name: 'Explain this example.', level: 2, exact: true }),
  ).toBeVisible();
  await tool('Table').click();
  await page.getByRole('button', { name: 'Insert table', exact: true }).click();
  await expect(prompt.locator('table tr')).toHaveCount(3);
  await tool('Table').click();
  await page.getByRole('button', { name: 'Add row below', exact: true }).click();
  await expect(prompt.locator('table tr')).toHaveCount(4);
  await tool('Table').click();
  await page.getByRole('button', { name: 'Delete table', exact: true }).click();
  await expect(prompt.locator('table')).toHaveCount(0);
  await prompt.fill('List item');
  await prompt.focus();
  await prompt.press('ControlOrMeta+a');
  await tool('Bullet list').click();
  await expect(prompt.locator('ul')).toHaveCount(1);
  await prompt.press('ControlOrMeta+a');
  await expect(tool('Bullet list')).toBeEnabled();
  await tool('Bullet list').click();
  await expect(prompt.locator('ul')).toHaveCount(0);
  await expect(prompt).toContainText('List item');
  await prompt.press('ControlOrMeta+a');
  await tool('Numbered list').click();
  await expect(prompt.locator('ol')).toHaveCount(1);
  await prompt.press('ControlOrMeta+a');
  await tool('Numbered list').click();
  await expect(prompt.locator('ol')).toHaveCount(0);
  await expect(prompt).toContainText('List item');
  await tool('Insert or edit link').click();
  await page.getByLabel('Link URL', { exact: true }).fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Apply link', exact: true }).click();
  expect(
    await page
      .getByLabel('Link URL', { exact: true })
      .evaluate((element: HTMLInputElement) => element.validationMessage),
  ).not.toBe('');
  await expect(prompt.locator('a')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(tool('Insert or edit link')).toBeFocused();
  const cancelledPicker = page.waitForEvent('filechooser', { timeout: 5000 });
  await tool('Insert image').click();
  await (await cancelledPicker).setFiles([]);
  await expect(prompt).toContainText('List item');
  await expect(page.getByText('Insert image or edit alt text', { exact: true })).toHaveCount(0);
  await expect(tool('Edit image alt text')).toBeDisabled();
  // Paste rich content as a user would, then exercise the actual save endpoint.
  const html =
    '<h2>Evidence example</h2><p><strong>Bold</strong> <u>Underlined</u> <s>Old</s></p><pre><code>const safe = 1;\nreturn safe;</code></pre><table><tbody><tr><th><p>Input</p></th><th><p>Output</p></th></tr><tr><td><p>One</p></td><td><p>Two</p></td></tr></tbody></table><p style="text-align:center"><span style="color:#2563eb">Blue</span> <mark style="background-color:#fef08a">Highlight</mark></p>';
  await prompt.focus();
  await prompt.press('ControlOrMeta+a');
  await prompt.evaluate(
    (element, value) => {
      const clipboard = new DataTransfer();
      clipboard.setData('text/html', value);
      element.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }),
      );
    },
    html.replace('<pre>', '<p><code>literal</code></p><pre>'),
  );
  await expect(prompt.locator('table tr')).toHaveCount(2);
  await prompt.locator('p code').click();
  await page.keyboard.press('End');
  await page.keyboard.insertText('  spaces\tand tab');
  const literalCode = await prompt.locator('p code').textContent();
  expect(literalCode).toContain('  spaces\tand tab');
  // Default: synthetic scan/download responses. Native mode uses the real worker.
  const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#123456' } })
    .png()
    .toBuffer();
  if (process.env.PROMPT_NATIVE_SCAN !== '1') {
    await page.route('**/assessments/media/*/status', (route) => {
      const id = new URL(route.request().url()).pathname.split('/').at(-2);
      return route.fulfill({ json: { id, status: 'ready', url: `/assessments/media/${id}` } });
    });
    await page.route(/\/assessments\/media\/[a-f0-9-]{36}$/, (route) =>
      route.fulfill({ contentType: 'image/png', body: png }),
    );
  }
  // Insert in a normal paragraph, not inside the inline-code node.
  await prompt.locator('h2').click();
  await page.keyboard.press('Home');
  const picker = page.waitForEvent('filechooser', { timeout: 5000 });
  await tool('Insert image').click();
  await (
    await picker
  ).setFiles({ name: 'evidence.diagram.png', mimeType: 'image/png', buffer: png });
  if (process.env.PROMPT_NATIVE_SCAN === '1') {
    await expect(tool('Insert image')).toBeDisabled();
    await expect(prompt.locator('img[alt="evidence.diagram"]')).toHaveCount(0);
    await expect(prompt).toHaveAttribute('contenteditable', 'false');
    await expect(page.getByTestId('prompt-image-busy')).toBeVisible();
  }
  await page.locator('#add-question').click();
  await prompt.fill('Other question stays untouched.');
  await expect(tool('Insert image')).toBeEnabled({ timeout: 120000 });
  await expect(prompt.locator('img[src]')).toHaveCount(0);
  await page
    .getByRole('complementary', { name: 'Question list', exact: true })
    .getByRole('button', { name: /Evidence example/ })
    .click();
  await expect(prompt.locator('h2 img[alt="evidence.diagram"]')).toBeVisible();
  await expect(prompt).toHaveAttribute('contenteditable', 'true');
  await expect(page.getByTestId('prompt-image-busy')).toBeHidden();
  await prompt.locator('img[alt="evidence.diagram"]').click();
  await tool('Edit image alt text').click();
  await expect(page.getByLabel('Image alt text', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Image alt text', { exact: true })).toHaveValue('evidence.diagram');
  await page.getByLabel('Image alt text', { exact: true }).fill('Discarded description');
  await page.keyboard.press('Escape');
  await expect(tool('Edit image alt text')).toBeFocused();
  await expect(prompt.locator('img[alt="evidence.diagram"]')).toHaveCount(1);
  await tool('Edit image alt text').click();
  await page.getByLabel('Image alt text', { exact: true }).fill('Synthetic diagram');
  await page.keyboard.press('Enter');
  await expect(prompt.locator('img[alt="Synthetic diagram"]')).toBeVisible({ timeout: 120000 });
  await expect
    .poll(() =>
      prompt
        .locator('img[alt="Synthetic diagram"]')
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBe(4);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.locator('#save-status')).toHaveText('Draft saved. Not published.');
  await expect(page).not.toHaveURL(/\/new$/);
  const id = page.url().split('/').pop();
  const saved = await (
    await page.request.get(`/api/assessments/definitions?clientId=${client}&id=${id}`)
  ).json();
  const savedHtml = saved.questions[0].prompt_html;
  expect(savedHtml).toContain('alt="Synthetic diagram"');
  for (const fragment of [
    '<h2>',
    '<u>',
    '<s>',
    '<pre><code>',
    '<table',
    '<th',
    'text-align:center',
    'color:rgb(37, 99, 235)',
    'background-color:rgb(254, 240, 138)',
  ])
    expect(savedHtml).toContain(fragment);
  await page.reload();
  await page.locator('[data-section="questions"]').click();
  await expect(prompt.locator('img[alt="Synthetic diagram"]')).toBeVisible();
  await expect(prompt.locator('table tr')).toHaveCount(2);
  await expect(prompt.locator('pre code')).toContainText('return safe;');
  expect(await prompt.locator('p code').textContent()).toBe(literalCode);
  await expect(prompt.locator('mark')).toHaveCSS('background-color', 'rgb(254, 240, 138)');
  await page.locator('[data-section="review"]').click();
  await expect(page.locator('#learner-preview img[alt="Synthetic diagram"]')).toBeVisible();
  await expect
    .poll(() =>
      page.locator('#learner-preview img').evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBe(4);
  await expect(page.locator('#learner-preview table tr')).toHaveCount(2);
  await expect(page.locator('#learner-preview pre code')).toContainText('return safe;');
  expect(await page.locator('#learner-preview p code').textContent()).toBe(literalCode);
  await page.locator('[data-section="questions"]').click();
  for (const width of [1440, 800, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await tool('Table').click();
    await expect(page.getByRole('button', { name: 'Insert table', exact: true })).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(tool('Table')).toBeFocused();
    await page.screenshot({ path: info.outputPath(`prompt-${width}.png`), fullPage: true });
  }
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
});
