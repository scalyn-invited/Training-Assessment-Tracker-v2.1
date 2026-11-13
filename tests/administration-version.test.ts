import { beforeAll, afterAll, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { testDatabase } from './helpers.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Tenancy } from '../packages/domain/src/tenancy.js';
let instance: Awaited<ReturnType<typeof testDatabase>>, auth: Auth, tenancy: Tenancy;
let owner: {token:string;csrf:string}, client:string, member:any, team:string;
const reason='Reviewed current client account change';
async function login(email:string,password='Separate demonstration password') {const g=await auth.context();return auth.login(g.token!,g.csrf,email,password);}
beforeAll(async()=>{
 instance=await testDatabase({port:55449});auth=new Auth(instance.db,randomBytes(32));tenancy=new Tenancy(auth);
 const g=await auth.context();await auth.setup(g.token!,g.csrf,{name:'Owner',email:'owner@example.invalid',password:'Unique administrator passphrase',demoPassword:'Separate demonstration password'});
 owner=await login('owner@example.invalid','Unique administrator passphrase');
 member=(await instance.db.pool.query("SELECT u.id user_id,u.permission_version,cm.id,cm.version,cm.organisation_id FROM users u JOIN client_memberships cm ON cm.user_id=u.id WHERE u.email='demo.1.3@example.invalid'")).rows[0];
 client=member.organisation_id;await tenancy.select(owner.token,owner.csrf,client);
 team=(await tenancy.createGroup(owner.token,owner.csrf,client,'Version checked team','team',reason)).id;
});
afterAll(async()=>{await instance?.close();});
it('binds team, role and departure changes to the displayed account version without partial writes',async()=>{
 const displayed=(await tenancy.administration(owner.token,client)).people.find(p=>p.id===member.id)!;
 expect(displayed.permission_version).toBe(member.permission_version);
 await instance.db.pool.query('UPDATE users SET permission_version=permission_version+1 WHERE id=$1',[member.user_id]);
 const audits=(await instance.db.pool.query('SELECT count(*)::int n FROM audit_events')).rows[0].n;
 for(const change of [
  ()=>tenancy.teamMembership(owner.token,owner.csrf,client,member.id,team,true,reason,displayed.permission_version),
  ()=>tenancy.grantRole(owner.token,owner.csrf,client,member.id,'coordinator',team,reason,displayed.permission_version),
  ()=>tenancy.leave(owner.token,owner.csrf,client,member.id,member.version,reason,displayed.permission_version),
 ])await expect(change()).rejects.toMatchObject({code:'account_version_conflict',status:409});
 expect((await instance.db.pool.query('SELECT count(*)::int n FROM audit_events')).rows[0].n).toBe(audits);
 expect((await instance.db.pool.query('SELECT id FROM client_team_memberships WHERE group_id=$1',[team])).rowCount).toBe(0);
 const version=async()=>Number((await instance.db.pool.query('SELECT permission_version FROM users WHERE id=$1',[member.user_id])).rows[0].permission_version);
 await tenancy.teamMembership(owner.token,owner.csrf,client,member.id,team,true,reason,await version());
 const grant=(await tenancy.grantRole(owner.token,owner.csrf,client,member.id,'coordinator',team,reason,await version())).id;
 const stale=await version();await instance.db.pool.query('UPDATE users SET permission_version=permission_version+1 WHERE id=$1',[member.user_id]);
 await expect(tenancy.revokeRole(owner.token,owner.csrf,client,grant,reason,stale)).rejects.toMatchObject({code:'account_version_conflict'});
 expect((await instance.db.pool.query('SELECT ends_at FROM role_assignments WHERE id=$1',[grant])).rows[0].ends_at).toBeNull();
 await tenancy.revokeRole(owner.token,owner.csrf,client,grant,reason,await version());
 await tenancy.teamMembership(owner.token,owner.csrf,client,member.id,team,false,reason,await version());
});
it('rejects imported membership edits and self-deactivation at the domain boundary',async()=>{
 await instance.db.pool.query("UPDATE groups SET origin='primary' WHERE id=$1",[team]);
 await expect(tenancy.teamMembership(owner.token,owner.csrf,client,member.id,team,true,reason)).rejects.toMatchObject({code:'imported_membership',status:422});
 const local=await login('demo.1.0@example.invalid');await tenancy.select(local.token,local.csrf,client);
 const own=(await instance.db.pool.query("SELECT cm.id,cm.version FROM client_memberships cm JOIN users u ON u.id=cm.user_id WHERE u.email='demo.1.0@example.invalid'")).rows[0];
 await expect(tenancy.leave(local.token,local.csrf,client,own.id,own.version,reason)).rejects.toMatchObject({code:'self_deactivation',status:409});
 expect((await instance.db.pool.query('SELECT status FROM client_memberships WHERE id=$1',[own.id])).rows[0].status).toBe('active');
});
