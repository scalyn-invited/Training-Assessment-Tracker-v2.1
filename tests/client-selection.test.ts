import { it, expect, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { testDatabase } from './helpers.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Tenancy } from '../packages/domain/src/tenancy.js';
it('atomically rotates browser selection CSRF and records only accepted client changes',async()=>{
 const instance=await testDatabase({port:55449});
 try{
  const db=instance.db,auth=new Auth(db,randomBytes(32)),tenancy=new Tenancy(auth);
  const guest=await auth.context();await auth.setup(guest.token!,guest.csrf,{name:'Owner',email:'owner@example.invalid',password:'Unique administrator passphrase',demoPassword:'Separate demonstration password'});
  const g=await auth.context(),owner=await auth.login(g.token!,g.csrf,'owner@example.invalid','Unique administrator passphrase');
  const client=(await tenancy.choices(owner.token))[0].id;
  const selected=await tenancy.select(owner.token,owner.csrf,client,true);
  expect(selected.csrf).not.toBe(owner.csrf);
  expect((await auth.context(owner.token)).csrf).toBe(selected.csrf);
  await expect(tenancy.select(owner.token,owner.csrf,client,true)).rejects.toMatchObject({code:'csrf_failed',status:403});
  const audit=(await db.pool.query("SELECT * FROM audit_events WHERE action='client.selected'")).rows;
  expect(audit).toHaveLength(1);expect(audit[0]).toMatchObject({organisation_id:client,target_id:client});
  await expect(tenancy.select(owner.token,selected.csrf,randomUUID(),true)).rejects.toMatchObject({code:'client_unavailable'});
  expect((await auth.context(owner.token)).csrf).toBe(selected.csrf);
  expect((await auth.context(owner.token)).client?.id).toBe(client);
  expect((await db.pool.query("SELECT * FROM audit_events WHERE action='client.selected'")).rows).toEqual(audit);
  const transaction=db.transaction.bind(db);
  const fault=vi.spyOn(db,'transaction').mockImplementationOnce(work=>transaction(async sql=>{await work(sql);throw new Error('Selection commit failure');}));
  try{await expect(tenancy.select(owner.token,selected.csrf,client,true)).rejects.toThrow('Selection commit failure');}finally{fault.mockRestore();}
  expect((await auth.context(owner.token)).csrf).toBe(selected.csrf);
  expect((await db.pool.query("SELECT * FROM audit_events WHERE action='client.selected'")).rows).toEqual(audit);

 }finally{await instance.close();}
});
