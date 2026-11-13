import path from 'node:path';
import { fromBuffer, type Entry } from 'yauzl';
import { fileTypeFromBuffer } from 'file-type';
import { DomainError, requireCondition } from './errors.js';
export async function inspectDocx(bytes: Buffer) {
  await new Promise<void>((resolve, reject) => {
    fromBuffer(
      bytes,
      { lazyEntries: true, decodeStrings: true, validateEntrySizes: true, strictFileNames: true },
      (error, zip) => {
        const invalid = () =>
          new DomainError(
            422,
            'invalid_document',
            'Use a valid DOCX without macros, embedded files or oversized content.',
          );
        if (error || !zip) {
          reject(invalid());
          return;
        }
        let count = 0,
          total = 0,
          document = false,
          failed = false;
        const fail = () => {
          if (failed) return;
          failed = true;
          zip.close();
          reject(invalid());
        };
        if (zip.entryCount > 500) {
          fail();
          return;
        }
        zip.on('error', fail);
        zip.on('entry', (entry: Entry) => {
          const name = entry.fileName.toLowerCase();
          count++;
          total += entry.uncompressedSize;
          if (
            count > 500 ||
            total > 100 * 1024 * 1024 ||
            name.includes('..') ||
            name.includes('vbaproject') ||
            name.includes('embeddings/') ||
            name.startsWith('/') ||
            (entry.generalPurposeBitFlag & 1) !== 0
          ) {
            fail();
            return;
          }
          if (name === 'word/document.xml') document = true;
          if (!failed) zip.readEntry();
        });
        zip.on('end', () => {
          if (failed) return;
          if (!document) {
            fail();
            return;
          }
          resolve();
        });
        zip.readEntry();
      },
    );
  });
}
export async function inspectUpload(bytes: Buffer, filename: string) {
  requireCondition(
    bytes.length > 0 && bytes.length <= 20 * 1024 * 1024,
    422,
    'file_size',
    'Choose a file up to 20 MiB.',
  );
  const originalName = path.win32
    .basename(path.posix.basename(filename))
    .replace(/[\x00-\x1f\x7f]/g, '');
  const name = [...originalName].slice(0, 180).join('');
  const extension = path.extname(originalName).slice(1).toLowerCase();
  requireCondition(
    ['pdf', 'png', 'jpg', 'jpeg', 'txt', 'docx'].includes(extension),
    422,
    'file_type',
    'Choose a PDF, DOCX, TXT, PNG or JPEG file.',
  );
  let mime: string;
  if (extension === 'docx') {
    await inspectDocx(bytes);
    mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  } else if (extension === 'txt') {
    const signature = await fileTypeFromBuffer(bytes.subarray(0, 4100)).catch(() => undefined);
    requireCondition(
      !signature &&
        !/^<(?:!doctype\s+html|html|head|body|script|svg|\?xml)(?:\s|>)/i.test(
          bytes.subarray(0, 4100).toString('utf8').trimStart(),
        ),
      422,
      'file_type',
      'Choose a plain text document, not a renamed document or image.',
    );

    let text: string;
    if (bytes[0] === 0xff && bytes[1] === 0xfe) text = bytes.subarray(2).toString('utf16le');
    else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      requireCondition(bytes.length % 2 === 0, 422, 'file_type', 'Choose a plain text document.');
      text = Buffer.from(bytes.subarray(2)).swap16().toString('utf16le');
    } else text = bytes.toString('latin1');
    requireCondition(
      !/[\x00-\x08\x0b\x0e-\x1f\x7f]/.test(text),
      422,
      'file_type',
      'Choose a plain text document.',
    );
    mime = 'text/plain';
  } else {
    const detected = await fileTypeFromBuffer(bytes.subarray(0, 4100)).catch(() => undefined);
    const expected =
      extension === 'jpg' || extension === 'jpeg'
        ? 'image/jpeg'
        : extension === 'png'
          ? 'image/png'
          : 'application/pdf';
    requireCondition(
      detected?.mime === expected,
      422,
      'file_type',
      'The file contents do not match its extension. Choose a supported document or image.',
    );
    mime = expected;
  }
  return { name, mime, extension };
}
