import { crc32 } from 'node:zlib';
import { readFile, stat, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fromBuffer, type Entry } from 'yauzl';
import sax, { type QualifiedTag } from 'sax';
import sharp from 'sharp';
export type DocumentSettings = {
  pdfinfo?: string;
  pdftotext?: string;
  pdftoppm?: string;
  tesseract?: string;
  language: string;
  sandbox?: string;
};
export type ExtractedDocument = { text: string; engine: string; pages: number; warnings: string[] };
export const DOCUMENT_ERRORS = [
  'file_limit',
  'text_limit',
  'invalid_document',
  'encrypted_document',
  'page_limit',
  'no_text',
  'unsupported_format',
  'invalid_encoding',
  'unsafe_document',
  'image_limit',
  'invalid_configuration',
  'tool_unavailable',
  'timeout',
  'output_limit',
  'parser_failed',
  'sandbox_required',
] as const;
export function documentError(code: string): never {
  throw new Error(code);
}
export function utf8(bytes: Buffer): string {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text.includes('\0')) documentError('invalid_encoding');
    return text;
  } catch {
    return documentError('invalid_encoding');
  }
}
function checkText(text: string) {
  if (Buffer.byteLength(text) > 120000) documentError('text_limit');
  if (text.includes('\0')) documentError('invalid_encoding');
}
export type DocumentCommand = (args: string[], timeout: number) => Promise<string>;
export const documentCommand: DocumentCommand = async (args, timeout) => {
  if (!args[0] || !path.isAbsolute(args[0]) || !(await stat(args[0]).catch(() => null))?.isFile())
    documentError('tool_unavailable');
  return new Promise((resolve, reject) => {
    const child = spawn(args[0], args.slice(1), {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output: Buffer[] = [],
      size = 0,
      failed = false;
    const fail = (code: string) => {
      if (failed) return;
      failed = true;
      child.kill('SIGKILL');
      reject(new Error(code));
    };
    const timer = setTimeout(() => fail('timeout'), Math.max(1, timeout));
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) fail('output_limit');
      else output.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) fail('output_limit');
    });
    child.once('error', () => {
      clearTimeout(timer);
      fail('tool_unavailable');
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (failed) return;
      if (code !== 0) {
        fail('parser_failed');
        return;
      }
      try {
        resolve(utf8(Buffer.concat(output)));
      } catch {
        fail('invalid_encoding');
      }
      output = [];
    });
  });
};
const WORD = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
function parseXml(xml: string, body = false): string {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) documentError('unsafe_document');
  const options = { xmlns: true, strictEntities: true };
  const parser = sax.parser(true, options);
  const stack: QualifiedTag[] = [],
    paragraphs: string[] = [];
  let current: string | null = null,
    inText = false,
    bodyDepth = 0;
  parser.onerror = () => documentError('invalid_document');
  parser.ondoctype = () => documentError('unsafe_document');
  parser.onopentag = (raw) => {
    const tag = raw as QualifiedTag;
    if (stack.length >= 256) documentError('unsafe_document');
    stack.push(tag);
    if (tag.local === 'altChunk') documentError('unsafe_document');
    for (const rawAttr of Object.values(tag.attributes)) {
      const attr = typeof rawAttr === 'string' ? { local: '', value: rawAttr } : rawAttr;
      if (attr.local === 'TargetMode' && attr.value.toLowerCase() === 'external')
        documentError('unsafe_document');
    }
    if (!body || tag.uri !== WORD) return;
    if (tag.local === 'body') bodyDepth = stack.length;
    if (!bodyDepth) return;
    if (tag.local === 'p') {
      if (current !== null) documentError('invalid_document');
      current = '';
    }
    if (current !== null) {
      if (tag.local === 't') inText = true;
      else if (tag.local === 'tab') current += '\t';
      else if (tag.local === 'br') current += '\n';
    }
  };
  const text = (value: string) => {
    if (current !== null && inText) {
      current += value;
      checkText(current);
    }
  };
  parser.ontext = text;
  parser.oncdata = text;
  parser.onclosetag = () => {
    const tag = stack.pop();
    if (!body || tag?.uri !== WORD) return;
    if (tag.local === 't') inText = false;
    if (tag.local === 'p' && current !== null) {
      paragraphs.push(current);
      current = null;
      checkText(paragraphs.join('\n'));
    }
    if (tag.local === 'body') bodyDepth = 0;
  };
  parser.write(xml).close();
  return paragraphs.join('\n');
}
export async function docxText(bytes: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    fromBuffer(
      bytes,
      { lazyEntries: true, strictFileNames: true, validateEntrySizes: true },
      (error, zip) => {
        if (error || !zip) {
          reject(new Error('invalid_document'));
          return;
        }
        let failed = false,
          total = 0,
          count = 0,
          document: string | undefined;
        const names = new Set<string>();
        const fail = (code = 'unsafe_document') => {
          if (failed) return;
          failed = true;
          zip.close();
          reject(new Error(code));
        };
        if (zip.entryCount > 500) {
          fail();
          return;
        }
        zip.on('error', () => fail());
        zip.on('entry', (entry: Entry) => {
          const name = entry.fileName.toLowerCase();
          total += entry.uncompressedSize;
          count++;
          if (
            count > 500 ||
            total > 100 * 1024 * 1024 ||
            entry.uncompressedSize > 8 * 1024 * 1024 ||
            entry.generalPurposeBitFlag & 1 ||
            name.includes('..') ||
            /[\\:]/.test(name) ||
            name.startsWith('/') ||
            /vbaproject|embeddings\/|activex\/|afchunk/.test(name) ||
            names.has(name)
          ) {
            fail();
            return;
          }
          names.add(name);
          if (!name.endsWith('.xml') && !name.endsWith('.rels')) {
            zip.readEntry();
            return;
          }
          zip.openReadStream(entry, (error, stream) => {
            if (error || !stream) {
              fail();
              return;
            }
            let chunks: Buffer[] = [],
              size = 0;
            stream.on('data', (part: Buffer) => {
              size += part.length;
              if (size > 8 * 1024 * 1024) {
                stream.destroy();
                fail();
              } else chunks.push(part);
            });
            stream.on('error', () => fail());
            stream.on('end', () => {
              if (failed) return;
              try {
                const content = Buffer.concat(chunks);
                if (crc32(content) !== entry.crc32) documentError('unsafe_document');
                const text = parseXml(utf8(content), name === 'word/document.xml');
                if (name === 'word/document.xml') document = text;
                chunks = [];
                zip.readEntry();
              } catch (e) {
                fail((e as Error).message);
              }
            });
          });
        });
        zip.on('end', () => {
          if (failed) return;
          if (document === undefined) {
            fail('invalid_document');
            return;
          }
          resolve(document);
        });
        zip.readEntry();
      },
    );
  });
}
export async function extractDocument(
  file: string,
  extension: string,
  settings: DocumentSettings,
  directory: string,
  execute: DocumentCommand = documentCommand,
): Promise<ExtractedDocument> {
  const info = await stat(file).catch(() => null);
  if (!info?.isFile() || !info.size || info.size > 20 * 1024 * 1024) documentError('file_limit');
  const deadline = Date.now() + 80000,
    warnings: string[] = [];
  async function command(tool: keyof DocumentSettings, args: string[]) {
    const binary = settings[tool];
    if (!binary || !path.isAbsolute(binary)) documentError('tool_unavailable');
    const remaining = deadline - Date.now();
    if (remaining <= 0) documentError('timeout');
    return execute([binary, ...args], Math.min(25000, remaining));
  }
  async function ocr(input: string) {
    const image = await sharp(input, { limitInputPixels: 25000000 })
      .metadata()
      .catch(() => null);
    if (
      !image ||
      !['png', 'jpeg'].includes(image.format!) ||
      !image.width ||
      !image.height ||
      image.width * image.height > 25000000
    )
      documentError('image_limit');
    if (!/^[a-zA-Z0-9_+]{1,40}$/.test(settings.language)) documentError('invalid_configuration');
    const tsv = await command('tesseract', [
      input,
      'stdout',
      '-l',
      settings.language,
      '--psm',
      '3',
      'tsv',
    ]);
    const lines = new Map<string, string[]>();
    let low = false;
    for (const row of tsv.split('\n')) {
      const cells = row.replace(/\r$/, '').split('\t');
      if (cells.length < 12 || cells[0] !== '5' || !cells.slice(11).join('\t').trim()) continue;
      const key = cells.slice(1, 5).join(':');
      lines.set(key, [...(lines.get(key) ?? []), cells.slice(11).join('\t')]);
      low ||= !Number.isFinite(Number(cells[10])) || Number(cells[10]) < 70;
    }
    if (low)
      warnings.push(
        'Low-confidence OCR words detected; manually correct them before confirmation.',
      );
    return [...lines.values()].map((words) => words.join(' ')).join('\n');
  }
  let text = '',
    engine = extension,
    pages = 1;
  if (extension === 'txt') {
    if (info.size > 120000) documentError('text_limit');
    text = utf8(await readFile(file));
  } else if (extension === 'docx') {
    text = await docxText(await readFile(file));
    warnings.push(
      'DOCX body text only; verify tables, headers, footnotes and any image-only content against the original.',
    );
  } else if (extension === 'pdf') {
    if ((await readFile(file)).subarray(0, 5).toString() !== '%PDF-')
      documentError('invalid_document');
    const info = await command('pdfinfo', [file]);
    if (/^Encrypted:\s+yes/im.test(info)) documentError('encrypted_document');
    const match = info.match(/^Pages:\s+(\d+)/m);
    if (!match) documentError('invalid_document');
    pages = Number(match[1]);
    if (pages < 1 || pages > 20) documentError('page_limit');
    engine = 'poppler';
    for (let page = 1; page <= pages; page++) {
      let part = await command('pdftotext', [
        '-f',
        String(page),
        '-l',
        String(page),
        '-layout',
        '-enc',
        'UTF-8',
        file,
        '-',
      ]);
      if ([...part.trim()].length < 20) {
        const prefix = path.join(directory, 'page-' + page);
        await command('pdftoppm', [
          '-f',
          String(page),
          '-l',
          String(page),
          '-singlefile',
          '-scale-to',
          '2200',
          '-png',
          file,
          prefix,
        ]);
        try {
          part = await ocr(prefix + '.png');
        } finally {
          await rm(prefix + '.png', { force: true });
        }
        engine = 'poppler+tesseract';
        warnings.push(
          'Page ' + page + ' used OCR; check every score, name and number against the original.',
        );
      }
      if (!part.trim()) documentError('no_text');
      text += '[Page ' + page + ']\n' + part + '\n';
      checkText(text);
    }
    warnings.push(
      'PDF text order and embedded diagrams may be incomplete. Compare every relevant section with the original.',
    );
  } else if (['png', 'jpg', 'jpeg'].includes(extension)) {
    text = await ocr(file);
    engine = 'tesseract';
    warnings.push(
      'OCR can misread numbers and omit text. Compare the findings with the original image.',
    );
  } else documentError('unsupported_format');
  text = text.replace(/\r\n|\r|\f/g, '\n').trim();
  checkText(text);
  if (!text) documentError('no_text');
  return { text, engine, pages, warnings: [...new Set(warnings)] };
}
// Standalone child: no application bootstrap, dotenv, database or provider credentials.
if (process.argv[2] === '--document-child') {
  try {
    let input = '';
    for await (const part of process.stdin) {
      input += part.toString();
      if (Buffer.byteLength(input) > 16384) documentError('invalid_configuration');
    }
    const request = JSON.parse(input);
    const result = await extractDocument(
      request.path,
      request.extension,
      request.settings,
      request.directory,
    );
    process.stdout.write(JSON.stringify(result));
  } catch (e) {
    const code = (e as Error).message;
    process.stdout.write(
      JSON.stringify({
        error: (DOCUMENT_ERRORS as readonly string[]).includes(code) ? code : 'parser_failed',
      }),
    );
    process.exitCode = 1;
  }
}
