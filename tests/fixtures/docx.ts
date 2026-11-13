import { crc32 } from 'node:zlib';
export function zipFixture(files: [string, string | Buffer][]) {
  const locals: Buffer[] = [],
    entries: Buffer[] = [];
  let offset = 0;
  for (const [filename, content] of files) {
    const name = Buffer.from(filename),
      body = Buffer.isBuffer(content) ? content : Buffer.from(content),
      crc = crc32(body);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, body);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(body.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    entries.push(entry, name);
    offset += local.length + name.length + body.length;
  }
  const central = Buffer.concat(entries),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}
export const wordXml = (body: string) =>
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
  body +
  '</w:body></w:document>';
