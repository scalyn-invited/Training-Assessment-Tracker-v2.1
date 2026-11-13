import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';
import type { DocumentSettings, ExtractedDocument } from './document-parser.js';
export type DocumentRunner = (
  file: string,
  extension: string,
  directory: string,
) => Promise<ExtractedDocument>;
export function documentSettings(): DocumentSettings {
  return {
    pdfinfo: process.env.DOCUMENT_PDFINFO,
    pdftotext: process.env.DOCUMENT_PDFTOTEXT,
    pdftoppm: process.env.DOCUMENT_PDFTOPPM,
    tesseract: process.env.DOCUMENT_TESSERACT,
    language: process.env.DOCUMENT_OCR_LANGUAGE ?? 'eng',
    sandbox: process.env.DOCUMENT_SANDBOX_WRAPPER,
  };
}
export function documentEnvironment() {
  const env: NodeJS.ProcessEnv = { LC_ALL: 'C' };
  for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP', 'TMPDIR', 'TESSDATA_PREFIX'])
    if (process.env[key]) env[key] = process.env[key];
  return env;
}
const resultSchema = z.object({
  text: z
    .string()
    .min(1)
    .refine((v) => Buffer.byteLength(v) <= 120000 && !v.includes('\0')),
  engine: z.enum(['txt', 'docx', 'poppler', 'poppler+tesseract', 'tesseract']),
  pages: z.number().int().min(1).max(20),
  warnings: z.array(z.string().max(500)).max(30),
});
const safeErrors = new Set([
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
]);
export async function runDocument(
  file: string,
  extension: string,
  directory: string,
  settings: DocumentSettings = documentSettings(),
  production = process.env.NODE_ENV === 'production',
): Promise<ExtractedDocument> {
  if (!path.isAbsolute(file) || !path.isAbsolute(directory) || path.dirname(file) !== directory)
    throw new Error('invalid_configuration');
  const wrapper = settings.sandbox;
  if (
    (production || wrapper) &&
    (!wrapper || !path.isAbsolute(wrapper) || !(await stat(wrapper).catch(() => null))?.isFile())
  )
    throw new Error('sandbox_required');
  const parser = fileURLToPath(
    new URL(
      './document-parser' + (import.meta.url.endsWith('.ts') ? '.ts' : '.js'),
      import.meta.url,
    ),
  );
  const command = [process.execPath, '--max-old-space-size=128', parser, '--document-child'];
  if (wrapper) command.unshift(wrapper, directory);
  const input = JSON.stringify({ path: file, extension, directory, settings });
  if (Buffer.byteLength(input) > 16384) throw new Error('invalid_configuration');
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: directory,
      env: documentEnvironment(),
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let bytes = 0,
      output: Buffer[] = [],
      failed = false;
    const fail = (code: string) => {
      if (failed) return;
      failed = true;
      child.kill('SIGKILL');
      reject(new Error(code));
    };
    const timer = setTimeout(() => fail('timeout'), 90000);
    child.stdout.on('data', (part: Buffer) => {
      bytes += part.length;
      if (bytes > 1024 * 1024) fail('output_limit');
      else output.push(part);
    });
    child.stderr.on('data', (part: Buffer) => {
      bytes += part.length;
      if (bytes > 1024 * 1024) fail('output_limit');
    });
    child.stdin.on('error', () => fail('parser_failed'));
    child.once('error', () => {
      clearTimeout(timer);
      fail('tool_unavailable');
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (failed) return;
      try {
        const raw = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(output)),
        );
        if (code !== 0 || raw.error) {
          fail(safeErrors.has(raw.error) ? raw.error : 'parser_failed');
          return;
        }
        const parsed = resultSchema.safeParse(raw);
        if (!parsed.success) {
          fail('parser_failed');
          return;
        }
        resolve(parsed.data);
      } catch {
        fail('parser_failed');
      } finally {
        output = [];
      }
    });
    child.stdin.end(input);
  });
}
