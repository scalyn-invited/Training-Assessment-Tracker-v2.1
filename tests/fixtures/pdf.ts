import { Buffer } from 'node:buffer';
/** Small original PDF fixtures; no application extraction code constructs their text. */
export function pdfFixture(pages: ('text' | 'image')[], jpeg: Buffer) {
  const objects: Buffer[] = [];
  const stream = (bytes: Buffer, extra = '') =>
    Buffer.concat([
      Buffer.from('<< /Length ' + bytes.length + ' ' + extra + ' >>\nstream\n'),
      bytes,
      Buffer.from('\nendstream'),
    ]);
  objects.push(Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'));
  objects.push(
    Buffer.from(
      '<< /Type /Pages /Count ' +
        pages.length +
        ' /Kids [' +
        pages.map((_, i) => 5 + i * 2 + ' 0 R').join(' ') +
        '] >>',
    ),
  );
  objects.push(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'));
  objects.push(
    stream(
      jpeg,
      '/Type /XObject /Subtype /Image /Width 1200 /Height 420 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode',
    ),
  );
  pages.forEach((kind, index) => {
    const content = Buffer.from(
      kind === 'text'
        ? 'BT /F1 18 Tf 50 720 Td (Original synthetic training assessment findings.) Tj 0 -30 Td (Evidence score 75. Human confirmation required.) Tj ET'
        : 'q 600 0 0 210 6 500 cm /Im1 Do Q',
    );
    objects.push(
      Buffer.from(
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> /XObject << /Im1 4 0 R >> >> /Contents ' +
          (6 + index * 2) +
          ' 0 R >>',
      ),
    );
    objects.push(stream(content));
  });
  const parts = [Buffer.from('%PDF-1.4\n')],
    offsets: number[] = [];
  let offset = parts[0].length;
  objects.forEach((object, index) => {
    offsets.push(offset);
    const part = Buffer.concat([
      Buffer.from(index + 1 + ' 0 obj\n'),
      object,
      Buffer.from('\nendobj\n'),
    ]);
    parts.push(part);
    offset += part.length;
  });
  parts.push(
    Buffer.from(
      'xref\n0 ' +
        (objects.length + 1) +
        '\n0000000000 65535 f \n' +
        offsets.map((value) => String(value).padStart(10, '0') + ' 00000 n \n').join('') +
        'trailer\n<< /Size ' +
        (objects.length + 1) +
        ' /Root 1 0 R >>\nstartxref\n' +
        offset +
        '\n%%EOF\n',
    ),
  );
  return Buffer.concat(parts);
}
