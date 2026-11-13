import { it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {
  extractDocument,
  docxText,
  documentCommand,
  type DocumentSettings,
} from '../packages/domain/src/document-parser.js';
import { runDocument, documentEnvironment } from '../packages/domain/src/document-runner.js';
import { zipFixture, wordXml } from './fixtures/docx.js';
let dir: string;
const settings: DocumentSettings = {
  language: 'eng',
  pdfinfo: path.resolve('pdfinfo'),
  pdftotext: path.resolve('pdftotext'),
  pdftoppm: path.resolve('pdftoppm'),
  tesseract: path.resolve('tesseract'),
};
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'tracker-document-parser-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});
async function file(name: string, bytes: string | Buffer) {
  const target = path.join(dir, name);
  await writeFile(target, bytes);
  return target;
}
it('extracts UTF-8 text in a real isolated child without application environment or bootstrap', async () => {
  const target = await file('input', '\ufeffFindings\r\nScore 75\rNext focus\fPractice');
  const prior = process.env.NODE_OPTIONS;
  process.env.NODE_OPTIONS = '--not-a-valid-node-option';
  process.env.DOCUMENT_TEST_SECRET = 'synthetic-secret';
  try {
    expect(documentEnvironment()).not.toHaveProperty('DOCUMENT_TEST_SECRET');
    expect(documentEnvironment()).not.toHaveProperty('NODE_OPTIONS');
    expect(await runDocument(target, 'txt', dir, { language: 'eng' }, false)).toEqual({
      text: 'Findings\nScore 75\nNext focus\nPractice',
      engine: 'txt',
      pages: 1,
      warnings: [],
    });
  } finally {
    if (prior === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = prior;
    delete process.env.DOCUMENT_TEST_SECRET;
  }
});
it('fails empty, non-UTF-8, oversized and unsupported input without returning document contents', async () => {
  for (const [bytes, error] of [
    [Buffer.from([0xc3, 0x28]), 'invalid_encoding'],
    [Buffer.from('Secret\0body'), 'invalid_encoding'],
    [Buffer.alloc(120001, 65), 'text_limit'],
    [Buffer.from(' \r\n'), 'no_text'],
    [Buffer.alloc(0), 'file_limit'],
  ] as const) {
    await expect(
      runDocument(await file('input', bytes), 'txt', dir, { language: 'eng' }, false),
    ).rejects.toThrow(error);
  }
  await expect(
    runDocument(await file('input', 'content'), 'html', dir, { language: 'eng' }, false),
  ).rejects.toThrow('unsupported_format');
  await expect(
    runDocument(path.join(dir, 'input'), 'txt', dir, { language: 'eng' }, true),
  ).rejects.toThrow('sandbox_required');
  await expect(
    runDocument(
      path.join(dir, 'input'),
      'txt',
      dir,
      { language: 'eng', sandbox: 'relative' },
      false,
    ),
  ).rejects.toThrow('sandbox_required');
});
it('extracts namespaced DOCX body paragraphs, table cells, tabs and breaks in a real child', async () => {
  const xml = wordXml(
    '<w:p><w:r><w:t>Evidence &amp; scores</w:t><w:tab/><w:t>75</w:t><w:br/><w:t>Next</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Practice</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
  );
  const result = await runDocument(
    await file('input', zipFixture([['word/document.xml', xml]])),
    'docx',
    dir,
    { language: 'eng' },
    false,
  );
  expect(result.text).toBe('Evidence & scores\t75\nNext\nPractice');
  expect(result.warnings[0]).toContain('DOCX body text only');
});
it('rejects malformed XML, declarations, external relationships and active or unsafe ZIP contents', async () => {
  const valid = wordXml('<w:p><w:r><w:t>Safe</w:t></w:r></w:p>');
  for (const xml of [
    '<root><broken></root>',
    '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///private">]><x>&e;</x>',
    wordXml('<w:altChunk/>'),
    wordXml('<w:p><w:t>&unknown;</w:t></w:p>'),
  ])
    await expect(docxText(zipFixture([['word/document.xml', xml]]))).rejects.toThrow();
  for (const entry of [
    '../outside.xml',
    'word/activeX/a.xml',
    'word/embeddings/object.bin',
    'word/vbaProject.bin',
    'word/afChunk.xml',
    'C:/outside.xml',
    'word\\outside.xml',
  ])
    await expect(
      docxText(
        zipFixture([
          ['word/document.xml', valid],
          [entry, 'payload'],
        ]),
      ),
    ).rejects.toThrow();
  await expect(
    docxText(
      zipFixture([
        ['word/document.xml', valid],
        [
          'word/_rels/document.xml.rels',
          '<Relationships><Relationship TargetMode="Exter&#110;al" Target="https://invalid.example"/></Relationships>',
        ],
      ]),
    ),
  ).rejects.toThrow('unsafe_document');
  await expect(
    docxText(
      zipFixture([
        ['word/document.xml', valid],
        ['WORD/DOCUMENT.XML', valid],
      ]),
    ),
  ).rejects.toThrow('unsafe_document');
  await expect(
    docxText(
      zipFixture([
        ['word/document.xml', valid],
        ['extra.xml', '<root>' + 'x'.repeat(8 * 1024 * 1024) + '</root>'],
      ]),
    ),
  ).rejects.toThrow('unsafe_document');
  await expect(
    docxText(
      zipFixture([
        ['word/document.xml', valid],
        ...Array.from({ length: 500 }, (_, i) => ['part' + i, ''] as [string, string]),
      ]),
    ),
  ).rejects.toThrow('unsafe_document');
  await expect(
    docxText(
      zipFixture([
        ['word/document.xml', wordXml('<w:p><w:t>' + 'x'.repeat(120001) + '</w:t></w:p>')],
      ]),
    ),
  ).rejects.toThrow('text_limit');
});
it('uses per-page PDF text and bounded OCR fallback with visible confidence warnings', async () => {
  const target = await file('input', '%PDF-1.7\nSynthetic contract fixture');
  const calls: string[][] = [];
  const result = await extractDocument(target, 'pdf', settings, dir, async (args, timeout) => {
    calls.push(args);
    expect(timeout).toBeLessThanOrEqual(25000);
    if (args[0] === settings.pdfinfo) return 'Pages: 2\nEncrypted: no';
    if (args[0] === settings.pdftotext)
      return args[2] === '1' ? 'First page contains readable synthetic findings.' : ' ';
    if (args[0] === settings.pdftoppm) {
      await sharp({ create: { width: 100, height: 50, channels: 3, background: 'white' } })
        .png()
        .toFile(args.at(-1)! + '.png');
      return '';
    }
    return 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n5\t1\t1\t1\t1\t1\t0\t0\t10\t10\t65\tCheck\n5\t1\t1\t1\t1\t2\t0\t0\t10\t10\t99\t75';
  });
  expect(result).toMatchObject({
    engine: 'poppler+tesseract',
    pages: 2,
    text: '[Page 1]\nFirst page contains readable synthetic findings.\n[Page 2]\nCheck 75',
  });
  expect(result.warnings).toContain(
    'Low-confidence OCR words detected; manually correct them before confirmation.',
  );
  expect(calls.find((args) => args[0] === settings.pdftoppm)).toContain('2200');
  expect(await stat(path.join(dir, 'page-2.png')).catch(() => null)).toBeNull();
});
it('rejects encrypted/over-page PDFs, unreadable pages and invalid OCR configuration', async () => {
  const target = await file('input', '%PDF-1.7');
  for (const [response, error] of [
    ['Pages: 1\nEncrypted: yes', 'encrypted_document'],
    ['Pages: 21', 'page_limit'],
    ['No metadata', 'invalid_document'],
  ])
    await expect(
      extractDocument(target, 'pdf', settings, dir, async () => response),
    ).rejects.toThrow(error);
  await expect(extractDocument(target, 'pdf', { language: 'eng' }, dir)).rejects.toThrow(
    'tool_unavailable',
  );
  const image = await sharp({ create: { width: 10, height: 10, channels: 3, background: 'white' } })
    .png()
    .toBuffer();
  await expect(
    extractDocument(
      await file('image', image),
      'png',
      { ...settings, language: 'eng --extra' },
      dir,
      async () => {
        throw new Error('must not execute');
      },
    ),
  ).rejects.toThrow('invalid_configuration');
  await expect(
    extractDocument(path.join(dir, 'image'), 'png', settings, dir, async () => 'header only'),
  ).rejects.toThrow('no_text');
  await expect(extractDocument(target, 'png', settings, dir)).rejects.toThrow('image_limit');
});
it('bounds actual native subprocess time and combined output and keeps errors content-free', async () => {
  await expect(
    documentCommand([process.execPath, '-e', 'setTimeout(()=>{},10000)'], 30),
  ).rejects.toThrow('timeout');
  await expect(
    documentCommand(
      [process.execPath, '-e', "process.stderr.write('sensitive-content');process.exitCode=1"],
      5000,
    ),
  ).rejects.toThrow('parser_failed');
  await expect(
    documentCommand([process.execPath, '-e', "process.stdout.write('x'.repeat(2100000))"], 5000),
  ).rejects.toThrow('output_limit');
  await expect(documentCommand(['relative-tool'], 5000)).rejects.toThrow('tool_unavailable');
});

it('rejects a corrupted DOCX entry checksum',async()=>{
 const bytes=zipFixture([['word/document.xml',wordXml('<w:p><w:t>Original</w:t></w:p>')]]);
 bytes[bytes.indexOf(Buffer.from('Original'))]='X'.charCodeAt(0);
 await expect(docxText(bytes)).rejects.toThrow('unsafe_document');
});
