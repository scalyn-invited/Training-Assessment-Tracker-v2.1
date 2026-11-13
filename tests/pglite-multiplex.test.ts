import { it, expect } from 'vitest';
import { testDatabase } from './helpers.js';
import { Database } from '../packages/database/src/database.js';
it('keeps parameter bindings and results isolated across local API and worker connections', async () => {
  const fixture = await testDatabase({ migrate: false });
  const second = new Database('postgresql://postgres:postgres@127.0.0.1:55439/postgres');
  try {
    for (let i = 0; i < 150; i++) {
      const [a, b] = await Promise.all([
        fixture.db.pool.query('SELECT $1::text AS component,$2::int AS sequence', ['worker', i]),
        second.pool.query('SELECT $1::uuid AS identity,$2::text AS marker', [
          '10000000-0000-4000-8000-000000000001',
          'client-' + i,
        ]),
      ]);
      expect(a.rows).toEqual([{ component: 'worker', sequence: i }]);
      expect(b.rows).toEqual([
        { identity: '10000000-0000-4000-8000-000000000001', marker: 'client-' + i },
      ]);
    }
  } finally {
    await second.close();
    await fixture.close();
  }
}, 60000);

it('reserves the local session across a deliberately fragmented extended-protocol batch', async () => {
  const fixture = await testDatabase({ migrate: false }),
    other = new Database('postgresql://postgres:postgres@127.0.0.1:55439/postgres');
  const client = await fixture.db.pool.connect();
  const connection = (client as any).connection,
    stream = connection.stream,
    write = stream.write.bind(stream);
  const held: any[][] = [];
  let holding = false,
    fragment = true;
  const parsed = new Promise<void>((resolve) => connection.once('parseComplete', resolve));
  stream.write = (...args: any[]) => {
    if (fragment && Buffer.isBuffer(args[0]) && args[0][0] === 0x50) {
      holding = true;
      return write(...args);
    }
    if (holding) {
      held.push(args);
      return true;
    }
    return write(...args);
  };
  function release() {
    fragment = false;
    holding = false;
    for (const args of held.splice(0)) write(...args);
  }
  client.release();
  let a: Promise<any> | undefined, b: Promise<any> | undefined;
  try {
    a = fixture.db.pool.query('SELECT $1::text AS component', ['worker']);
    a.catch(() => {});
    await parsed;
    let completed = false;
    b = other.pool
      .query('SELECT $1::uuid AS identity', ['10000000-0000-4000-8000-000000000001'])
      .finally(() => {
        completed = true;
      });
    b.catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(
      completed,
      'another connection must not run while the first parameter batch is unfinished',
    ).toBe(false);
    release();
    expect((await a).rows).toEqual([{ component: 'worker' }]);
    expect((await b).rows).toEqual([{ identity: '10000000-0000-4000-8000-000000000001' }]);
  } finally {
    release();
    await Promise.allSettled([a, b]);
    await other.close();
    await fixture.close();
  }
}, 60000);
