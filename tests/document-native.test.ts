import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { documentSettings, runDocument } from '../packages/domain/src/document-runner.js';
import { pdfFixture } from './fixtures/pdf.js';
const enabled = process.env.DOCUMENT_NATIVE_TESTS === '1';
describe.skipIf(!enabled)('actual Poppler and Tesseract qualification', () => {
  let dir: string, jpeg: Buffer;
  beforeAll(async () => {
    for (const key of ['pdfinfo', 'pdftotext', 'pdftoppm', 'tesseract'] as const)
      expect(
        documentSettings()[key],
        'Configure ' + key + ' for native qualification',
      ).toBeTruthy();
    dir = await mkdtemp(path.join(tmpdir(), 'tracker-native-documents-'));
    jpeg = await sharp(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="420"><rect width="1200" height="420" fill="white"/><g font-family="Arial" font-size="48" fill="black"><text x="60" y="100">Training assessment</text><text x="60" y="180">Evidence score 75</text><text x="60" y="260">Human review required</text></g></svg>',
      ),
    )
      .flatten({ background: 'white' })
      .jpeg({ quality: 100 })
      .toBuffer();
  });
  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });
  async function input(bytes: Buffer) {
    const target = path.join(dir, 'input');
    await writeFile(target, bytes);
    return target;
  }
  it('reads real PDF text through the credential-free child', async () => {
    const result = await runDocument(
      await input(pdfFixture(['text'], jpeg)),
      'pdf',
      dir,
      documentSettings(),
      false,
    );
    expect(result.engine).toBe('poppler');
    expect(result.pages).toBe(1);
    expect(result.text).toContain('Original synthetic training assessment findings.');
    expect(result.text).toContain('Evidence score 75');
  });
  it('reads an actual image with Tesseract and retains review warnings', async () => {
    const result = await runDocument(await input(jpeg), 'jpg', dir, documentSettings(), false);
    expect(result.engine).toBe('tesseract');
    expect(result.text).toContain('Training assessment');
    expect(result.text).toContain('Evidence score 75');
    expect(result.warnings.join(' ')).toContain('Compare the findings');
  });
  it('uses actual rasterization and OCR for a mixed text and scanned PDF', async () => {
    const result = await runDocument(
      await input(pdfFixture(['text', 'image'], jpeg)),
      'pdf',
      dir,
      documentSettings(),
      false,
    );
    expect(result.engine).toBe('poppler+tesseract');
    expect(result.pages).toBe(2);
    expect(result.text).toContain('[Page 1]');
    expect(result.text).toContain('[Page 2]');
    expect(result.text).toContain('Training assessment');
    expect(result.warnings.join(' ')).toContain('Page 2 used OCR');
  });
  it('rejects a real over-limit PDF before returning partial findings', async () => {
    await expect(
      runDocument(
        await input(pdfFixture(Array(21).fill('text'), jpeg)),
        'pdf',
        dir,
        documentSettings(),
        false,
      ),
    ).rejects.toThrow('page_limit');
  });
});
