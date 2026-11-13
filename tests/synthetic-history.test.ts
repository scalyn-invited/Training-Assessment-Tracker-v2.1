import { it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { testDatabase } from './helpers.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Tenancy } from '../packages/domain/src/tenancy.js';
import { Enrolments } from '../packages/domain/src/enrolments.js';
it('freezes either synthetic classification only after actual enrolment creation', async()=>{
 const instance=await testDatabase({port:55449});
 try {
  const db=instance.db,auth=new Auth(db,randomBytes(32)),tenancy=new Tenancy(auth),enrolments=new Enrolments(auth);
  const guest=await auth.context();await auth.setup(guest.token!,guest.csrf,{name:'Owner',email:'owner@example.invalid',password:'Unique administrator passphrase',demoPassword:'Separate demonstration password'});
  const g=await auth.context(),owner=await auth.login(g.token!,g.csrf,'owner@example.invalid','Unique administrator passphrase');
  const rows=(await db.pool.query('SELECT u.id,u.email,cm.id membership,cm.organisation_id FROM users u JOIN client_memberships cm ON cm.user_id=u.id')).rows;
  const reviewer=rows.find(r=>r.email==='demo.1.2@example.invalid')!;
  await tenancy.select(owner.token,owner.csrf,reviewer.organisation_id);
  for(const [email,synthetic] of [['demo.1.3@example.invalid',true],['demo.1.4@example.invalid',false]] as const){
   const person=rows.find(r=>r.email===email)!;
   await db.pool.query('UPDATE users SET is_synthetic=$2 WHERE id=$1',[person.id,!synthetic]);
   await db.pool.query('UPDATE users SET is_synthetic=$2 WHERE id=$1',[person.id,synthetic]);
   const record=await enrolments.create(owner.token,owner.csrf,person.organisation_id,{memberId:person.membership,coordinatorId:reviewer.membership,groupId:null,title:'Classification history',reason:'Verify preserved member classification'});
   const before=(await db.pool.query('SELECT * FROM enrolments WHERE id=$1',[record.id])).rows;
   await expect(db.pool.query('UPDATE users SET is_synthetic=$2,name=$3 WHERE id=$1',[person.id,!synthetic,'Must roll back'])).rejects.toMatchObject({code:'23514',constraint:'training_synthetic_status_immutable'});
   expect((await db.pool.query('SELECT is_synthetic,name FROM users WHERE id=$1',[person.id])).rows[0]).toMatchObject({is_synthetic:synthetic});
   expect((await db.pool.query('SELECT name FROM users WHERE id=$1',[person.id])).rows[0].name).not.toBe('Must roll back');
   await db.pool.query("UPDATE users SET is_synthetic=$2,name='Allowed rename' WHERE id=$1",[person.id,synthetic]);
   expect((await db.pool.query('SELECT * FROM enrolments WHERE id=$1',[record.id])).rows).toEqual(before);
  }
 }finally{await instance.close();}
});
