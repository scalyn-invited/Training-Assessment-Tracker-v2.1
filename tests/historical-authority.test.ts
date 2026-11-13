import { it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { testDatabase } from './helpers.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Access } from '../packages/domain/src/access.js';
it('matches historical team and allocation boundaries used by source application records',async()=>{
 const instance=await testDatabase({port:55449});
 try{
  const db=instance.db,auth=new Auth(db,randomBytes(32)),access=new Access();
  const g=await auth.context();await auth.setup(g.token!,g.csrf,{name:'Owner',email:'owner@example.invalid',password:'Unique administrator passphrase',demoPassword:'Separate demonstration password'});
  const people=(await db.pool.query("SELECT u.*,cm.id membership FROM users u JOIN client_memberships cm ON cm.user_id=u.id WHERE u.email IN ('demo.1.3@example.invalid','demo.1.2@example.invalid')")).rows;
  const member=people.find(p=>p.email==='demo.1.3@example.invalid')!,coordinator=people.find(p=>p.email==='demo.1.2@example.invalid')!;
  const team=(await db.pool.query('SELECT group_id FROM client_team_memberships WHERE client_membership_id=$1 AND ends_at IS NULL',[member.membership])).rows[0].group_id;
  const at=new Date('2020-01-02T00:00:00.000Z'),before=new Date(at.getTime()-1);
  await db.pool.query('UPDATE client_team_memberships SET starts_at=$2 WHERE client_membership_id=$1',[member.membership,at]);
  await db.pool.query("UPDATE role_assignments SET starts_at=$2 WHERE user_id=$1 AND role='coordinator'",[coordinator.id,at]);
  await db.pool.query('UPDATE coordinator_allocations SET starts_at=$2 WHERE member_membership_id=$1',[member.membership,at]);
  expect(await access.viewTraining(db.pool,coordinator as any,member.membership,team,before)).toBe(false);
  expect(await access.viewTraining(db.pool,coordinator as any,member.membership,team,at)).toBe(true);
  expect(await access.manageTraining(db.pool,coordinator as any,member.membership,team,at)).toBe(true);
  const after=new Date(at.getTime()+1);
  await db.pool.query("UPDATE role_assignments SET starts_at=$2 WHERE user_id=$1 AND role='coordinator'",[coordinator.id,after]);
  expect(await access.viewTraining(db.pool,coordinator as any,member.membership,team,at)).toBe(false);
  await db.pool.query("UPDATE role_assignments SET starts_at=$2 WHERE user_id=$1 AND role='coordinator'",[coordinator.id,at]);
  await db.pool.query('UPDATE client_team_memberships SET starts_at=$2 WHERE client_membership_id=$1',[member.membership,after]);
  expect(await access.viewTraining(db.pool,coordinator as any,member.membership,team,at)).toBe(false);
  await db.pool.query('UPDATE client_team_memberships SET starts_at=$2 WHERE client_membership_id=$1',[member.membership,at]);
  expect(await access.viewTraining(db.pool,member as any,member.membership,team,before)).toBe(true);
  expect(await access.viewTraining(db.pool,coordinator as any,member.membership,null,before)).toBe(false);
  expect(await access.manageTraining(db.pool,coordinator as any,member.membership,null,before)).toBe(false);
  expect(await access.viewTraining(db.pool,coordinator as any,member.membership,null,at)).toBe(true);
  expect(await access.manageTraining(db.pool,coordinator as any,member.membership,null,at)).toBe(true);
  await db.pool.query("UPDATE coordinator_allocations SET starts_at=now()+interval '1 day' WHERE member_membership_id=$1",[member.membership]);
  expect(await access.viewTraining(db.pool,coordinator as any,member.membership,null,at)).toBe(false);
  await db.pool.query('UPDATE coordinator_allocations SET starts_at=$2,ends_at=now() WHERE member_membership_id=$1',[member.membership,at]);
  expect(await access.viewTraining(db.pool,coordinator as any,member.membership,null,at)).toBe(false);
  expect(await access.manageTraining(db.pool,coordinator as any,member.membership,team,at)).toBe(false);
 }finally{await instance.close();}
});
