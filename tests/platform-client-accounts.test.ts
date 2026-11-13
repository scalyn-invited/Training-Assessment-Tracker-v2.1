import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { testDatabase } from './helpers.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Platform } from '../packages/domain/src/platform.js';
let instance: Awaited<ReturnType<typeof testDatabase>>, auth: Auth, platform: Platform;
let admin: {token:string;csrf:string}, target:string, client:string, other:string;
const reason='Verified platform client account change';
async function version() {return (await instance.db.pool.query('SELECT permission_version FROM users WHERE id=$1',[target])).rows[0].permission_version;}
beforeAll(async () => {
 instance=await testDatabase();auth=new Auth(instance.db,randomBytes(32));platform=new Platform(auth);
 const guest=await auth.context();await auth.setup(guest.token!,guest.csrf,{name:'Owner',email:'owner@example.invalid',password:'Unique administrator passphrase',demoPassword:'Separate demonstration password'});
 admin=await auth.login(guest.token!,guest.csrf,'owner@example.invalid','Unique administrator passphrase');
 const row=(await instance.db.pool.query("SELECT u.id,cm.organisation_id FROM users u JOIN client_memberships cm ON cm.user_id=u.id WHERE u.email='demo.1.3@example.invalid'")).rows[0];target=row.id;client=row.organisation_id;
 other=(await instance.db.pool.query('SELECT id FROM organisations WHERE id<>$1 LIMIT 1',[client])).rows[0].id;
});
afterAll(async()=>{vi.unstubAllEnvs();await instance?.close();});
it('requires accepted membership in password mode and exact displayed versions for roles',async()=>{
 const initial=await version();
 await expect(platform.clientRole(admin.token,admin.csrf,other,target,'join',initial,reason)).rejects.toMatchObject({status:409,code:'invitation_required'});
 await expect(platform.clientRole(admin.token,admin.csrf,other,target,'grant',initial,reason)).rejects.toMatchObject({status:422,code:'client_membership_required'});
 await platform.clientRole(admin.token,admin.csrf,client,target,'grant',initial,reason);
 expect(await version()).toBe(initial+1);
 await expect(platform.clientRole(admin.token,admin.csrf,client,target,'revoke',initial,reason)).rejects.toMatchObject({status:409,code:'account_version_conflict'});
 expect((await instance.db.pool.query("SELECT id FROM role_assignments WHERE user_id=$1 AND role='admin' AND ends_at IS NULL",[target])).rowCount).toBe(1);
 await platform.clientRole(admin.token,admin.csrf,client,target,'revoke',initial+1,reason);
 expect(await version()).toBe(initial+2);
 expect((await instance.db.pool.query("SELECT id FROM role_assignments WHERE user_id=$1 AND role='admin' AND ends_at IS NULL",[target])).rowCount).toBe(0);
});
it('rejects non-platform actors and rolls back all changes if platform audit fails',async()=>{
 const guest=await auth.context();const member=await auth.login(guest.token!,guest.csrf,'demo.1.3@example.invalid','Separate demonstration password');
 await expect(platform.clientRole(member.token,member.csrf,client,target,'grant',await version(),reason)).rejects.toMatchObject({status:403});
 const initial=await version();const spy=vi.spyOn(platform,'audit').mockRejectedValueOnce(new Error('Injected audit failure'));
 try {await expect(platform.clientRole(admin.token,admin.csrf,client,target,'grant',initial,reason)).rejects.toThrow('Injected audit failure');}finally{spy.mockRestore();}
 expect(await version()).toBe(initial);
 expect((await auth.context(member.token)).user?.id).toBe(target);
 expect((await instance.db.pool.query("SELECT id FROM role_assignments WHERE user_id=$1 AND role='admin' AND ends_at IS NULL",[target])).rowCount).toBe(0);
});
it('requires explicit mock join and never revives ended grants on re-entry',async()=>{
 const actor=(await instance.db.pool.query("SELECT u.*,i.id identity_id FROM users u JOIN identities i ON i.user_id=u.id WHERE u.email='demo.1.0@example.invalid'")).rows[0];
 await instance.db.pool.query("INSERT INTO role_assignments(id,user_id,role,environment,scope_type,scope_key,granted_by,reason) VALUES($1,$2,'admin','test','platform','platform',$2,$3)",[randomUUID(),actor.id,reason]);
 vi.stubEnv('TRAINING_AUTH_MODE','mock');vi.stubEnv('MOCK_IDENTITY_ENABLED','true');vi.stubEnv('TRAINING_ENVIRONMENT','test');
 try {
  const guest=await auth.context();const mock=await auth.mockLogin(guest.token!,guest.csrf,actor.identity_id);
  const initial=await version();await platform.clientRole(mock.token,mock.csrf,other,target,'join',initial,reason);
  await expect(platform.clientRole(mock.token,mock.csrf,other,target,'grant',initial,reason)).rejects.toMatchObject({status:409});
  await platform.clientRole(mock.token,mock.csrf,other,target,'grant',await version(),reason);
  await platform.clientRole(mock.token,mock.csrf,other,target,'revoke',await version(),reason);
  await instance.db.pool.query("UPDATE client_memberships SET status='ended',ended_at=now() WHERE user_id=$1 AND organisation_id=$2",[target,other]);
  await platform.clientRole(mock.token,mock.csrf,other,target,'join',await version(),reason);
  expect((await instance.db.pool.query("SELECT id FROM role_assignments WHERE user_id=$1 AND organisation_id=$2 AND ends_at IS NULL",[target,other])).rowCount).toBe(0);
  expect((await instance.db.pool.query("SELECT count(*)::int count FROM platform_audit_events WHERE action='platform.client.account.join' AND target_id=$1",[other])).rows[0].count).toBe(2);
 } finally {vi.unstubAllEnvs();}
});

it('derives account client defaults independently of client directory pagination',async()=>{
 await instance.db.pool.query("UPDATE organisations SET name='Z Current client' WHERE id=$1",[client]);
 for(let n=0;n<21;n++) {
  const id=randomUUID();await instance.db.pool.query('INSERT INTO organisations(id,name) VALUES($1,$2)',[id,'A Extra '+n]);
  await instance.db.pool.query("INSERT INTO platform_client_states(organisation_id,environment) VALUES($1,'test')",[id]);
 }
 const result=await platform.clientAccounts(admin.token,'demo.1.2@example.invalid');
 expect(result.accounts).toHaveLength(1);expect(result.accounts[0].defaultClientId).toBe(client);
 expect(result.clients.some(c=>c.id===client)).toBe(true);
 expect((await platform.directory(admin.token)).clients.some(c=>c.id===client)).toBe(false);
 const ambiguous=await platform.clientAccounts(admin.token,'demo.1.3@example.invalid');
 expect(ambiguous.accounts[0].memberships).toHaveLength(2);expect(ambiguous.accounts[0].defaultClientId).toBe('');
 const absent=await platform.clientAccounts(admin.token,'owner@example.invalid');
 expect(absent.accounts[0].defaultClientId).toBe('');
 expect((await platform.clientAccounts(admin.token,'demo.1.2@example.invalid',99)).accounts).toEqual([]);
});

it('includes inactive clients in the inactive directory filter even when also suspended',async()=>{
 await instance.db.pool.query('UPDATE organisations SET active=false WHERE id=$1',[other]);
 await instance.db.pool.query('UPDATE platform_client_states SET suspended=true WHERE organisation_id=$1',[other]);
 expect((await platform.directory(admin.token,'',1,'inactive')).clients.some(c=>c.id===other)).toBe(true);
 expect((await platform.directory(admin.token,'',1,'suspended')).clients.some(c=>c.id===other)).toBe(true);
 expect((await platform.directory(admin.token,'',1,'active')).clients.some(c=>c.id===other)).toBe(false);
});
