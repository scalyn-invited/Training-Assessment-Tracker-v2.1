import { it, expect } from 'vitest';
import { inspectUpload, inspectDocx } from '../packages/domain/src/file-content.js';
/** Minimal stored ZIP fixtures; no extraction or application parser is used to build them. */
export function documentZip(names: string[], declaredSize?: number) {
  const local: Buffer[] = [],
    central: Buffer[] = [];
  let offset = 0;
  for (const filename of names) {
    const name = Buffer.from(filename),
      body = Buffer.from('<document>Fixture</document>');
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(body.length, 18);
    header.writeUInt32LE(declaredSize ?? body.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, body);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(declaredSize ?? body.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += header.length + name.length + body.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
it('checks supported signatures, text and safe bounded filenames', async () => {
  expect(
    await inspectUpload(Buffer.from('Plain assessment notes'), 'C:\\uploads\\notes.txt'),
  ).toMatchObject({ name: 'notes.txt', mime: 'text/plain' });
  expect(await inspectUpload(Buffer.from('%PDF-1.7\nfixture'), 'report.pdf')).toMatchObject({
    mime: 'application/pdf',
  });
  expect(await inspectUpload(documentZip(['word/document.xml']), 'report.docx')).toMatchObject({
    extension: 'docx',
  });
  await expect(
    inspectUpload(Buffer.from('%PDF-1.7\nfixture'), 'renamed.txt'),
  ).rejects.toMatchObject({ status: 422 });
  await expect(inspectUpload(Buffer.from('not a PDF'), 'report.pdf')).rejects.toMatchObject({
    status: 422,
  });
  await expect(inspectUpload(Buffer.from([0, 1, 2]), 'notes.txt')).rejects.toMatchObject({
    status: 422,
  });
  await expect(
    inspectUpload(Buffer.alloc(20 * 1024 * 1024 + 1), 'notes.txt'),
  ).rejects.toMatchObject({ status: 422 });
  await expect(inspectUpload(Buffer.from('macro'), 'document.docm')).rejects.toMatchObject({
    status: 422,
  });
});
it('rejects unsafe DOCX containers before quarantine admission', async () => {
  for (const names of [
    ['other.xml'],
    ['word/document.xml', '../outside'],
    ['word/document.xml', 'word/vbaProject.bin'],
    ['word/document.xml', 'word/embeddings/payload'],
    Array.from({ length: 501 }, (_, i) => (i === 0 ? 'word/document.xml' : 'x' + i)),
  ]) {
    await expect(inspectDocx(documentZip(names))).rejects.toMatchObject({ status: 422 });
  }
  await expect(
    inspectDocx(documentZip(['word/document.xml'], 101 * 1024 * 1024)),
  ).rejects.toMatchObject({ status: 422 });
  await expect(inspectDocx(Buffer.from('invalid'))).rejects.toMatchObject({ status: 422 });
});
