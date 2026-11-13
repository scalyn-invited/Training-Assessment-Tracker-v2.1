import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('.runtime/document-tools');
const poppler = path.join(root, 'poppler-26.09.0/poppler-26.09.0/Library/bin');
const tesseract = path.join(root, 'tesseract-5.5.3');
const env = {
  ...process.env,
  DOCUMENT_NATIVE_TESTS: '1',
  DOCUMENT_PDFINFO: path.join(poppler, 'pdfinfo.exe'),
  DOCUMENT_PDFTOTEXT: path.join(poppler, 'pdftotext.exe'),
  DOCUMENT_PDFTOPPM: path.join(poppler, 'pdftoppm.exe'),
  DOCUMENT_TESSERACT: path.join(tesseract, 'tesseract.exe'),
  TESSDATA_PREFIX: path.join(tesseract, 'tessdata'),
};
for (const file of [
  env.DOCUMENT_PDFINFO,
  env.DOCUMENT_PDFTOTEXT,
  env.DOCUMENT_PDFTOPPM,
  env.DOCUMENT_TESSERACT,
  path.join(env.TESSDATA_PREFIX, 'eng.traineddata'),
])
  if (!(await stat(file).catch(() => null))?.isFile())
    throw new Error('Missing isolated document tool: ' + file);
const child = spawn(
  process.execPath,
  ['node_modules/vitest/vitest.mjs', 'run', 'tests/document-native.test.ts'],
  { stdio: 'inherit', env, windowsHide: true, shell: false },
);
child.on('error', () => {
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
