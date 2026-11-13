import { ProgrammeGeneration } from '../packages/domain/src/programme-generation.js';
import { AiGateway } from '../packages/domain/src/ai-gateway.js';
import { AiRegistry, aiConfig } from '../packages/domain/src/ai-registry.js';
import { mockProvider } from '../packages/domain/src/ai-provider.js';
import { claim, finish } from '../packages/domain/src/outbox.js';
import { AssessmentDefinitions } from '../packages/domain/src/assessment-definitions.js';
import { AssessmentAssignments } from '../packages/domain/src/assessment-assignments.js';
import { AssessmentResponses } from '../packages/domain/src/assessment-responses.js';
import { AssessmentReviews } from '../packages/domain/src/assessment-reviews.js';
import { it, expect } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { Database } from '../packages/database/src/database.js';
import { migrate } from '../packages/database/src/migrate.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Tenancy } from '../packages/domain/src/tenancy.js';
import { Platform } from '../packages/domain/src/platform.js';
import { Enrolments } from '../packages/domain/src/enrolments.js';
import { Onboarding } from '../packages/domain/src/onboarding.js';
import { LearningPlans } from '../packages/domain/src/learning-plans.js';
import { Branding } from '../packages/domain/src/branding.js';
import type { PoolClient } from 'pg';
const url=process.env.TEST_POSTGRES_URL;
it.skipIf(!url)('rechecks revoked authority after real client/platform lock waits and serializes service writes',async()=>{
 if(!new URL(url!).pathname.endsWith('_test'))throw new Error('Dedicated test cluster required.');
 const root=new Database(url),name='client_services_'+randomUUID().replaceAll('-','')+'_test',connection=new URL(url!);connection.pathname='/'+name;
 let db:Database|undefined;
 try {
  await root.pool.query('CREATE DATABASE '+name);db=new Database(connection.toString(),'tracker_tenant_'+randomBytes(6).toString('hex'));await migrate(db);
  const auth=new Auth(db,randomBytes(32)),tenancy=new Tenancy(auth),platform=new Platform(auth),brand=new Branding(auth);
  const reason='Qualified concurrent client service change';
  const guest=await auth.context();await auth.setup(guest.token!,guest.csrf,{name:'Concurrency owner',email:'owner@example.invalid',password:'Unique administrator passphrase',demoPassword:'Separate demonstration password'});
  async function login(email:string,password='Separate demonstration password') {const g=await auth.context();return auth.login(g.token!,g.csrf,email,password);}
  const owner=await login('owner@example.invalid','Unique administrator passphrase'),local=await login('demo.1.0@example.invalid');
  const people=(await db.pool.query("SELECT u.*,cm.id membership_id,cm.organisation_id FROM users u JOIN client_memberships cm ON cm.user_id=u.id WHERE u.email LIKE 'demo.1.%' ORDER BY u.email")).rows;
  const client=people[0].organisation_id,localUser=people[0],target=people.find(p=>p.email==='demo.1.6@example.invalid');
  await tenancy.select(owner.token,owner.csrf,client);await tenancy.select(local.token,local.csrf,client);
  const competing=await Promise.allSettled([0,1].map(()=>tenancy.grantRole(owner.token,owner.csrf,client,target.membership_id,'coordinator',null,reason)));
  expect(competing.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(competing.filter(r=>r.status==='rejected').map(r=>(r as PromiseRejectedResult).reason.status)).toEqual([409]);
  expect((await db.pool.query("SELECT id FROM audit_events WHERE action='client.role.granted' AND metadata->>'reason'=$1",[reason])).rowCount).toBe(1);
  const input={version:0,displayName:'Concurrent client',appName:'Training',accent:'#1d4668',theme:'client-light',mode:'white-label' as const,reason};
  const brands=await Promise.allSettled([0,1].map(()=>brand.save(owner.token,owner.csrf,client,input)));
  expect(brands.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(brands.filter(r=>r.status==='rejected').map(r=>(r as PromiseRejectedResult).reason.status)).toEqual([409]);
  const preferences=await Promise.allSettled([0,1].map(()=>brand.preference(local.token,local.csrf,client,0,'dark')));
  expect(preferences.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(preferences.filter(r=>r.status==='rejected').map(r=>(r as PromiseRejectedResult).reason.status)).toEqual([409]);
  async function blocked(lock:string,parameters:unknown[],work:()=>Promise<unknown>,change:(sql:PoolClient)=>Promise<unknown>){
   const holder=await db!.pool.connect();
   try {
    await holder.query('BEGIN');await holder.query(lock,parameters);const pid=(await holder.query('SELECT pg_backend_pid() pid')).rows[0].pid;
    const outcome=work().then(value=>({ok:true,value}),error=>({ok:false,error}));
    let observed=false;
    for(let attempt=0;attempt<200;attempt++){
     const waiting=await db!.pool.query('SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND $1::integer=ANY(pg_blocking_pids(pid))',[pid]);
     if(waiting.rowCount){observed=true;break;}await new Promise(resolve=>setTimeout(resolve,25));
    }
    expect(observed,'the service must be observed waiting on the held database lock').toBe(true);
    await change(holder);await holder.query('COMMIT');return await outcome;
   } finally {await holder.query('ROLLBACK');holder.release();}
  }
  const member3=people.find(p=>p.email==='demo.1.3@example.invalid'),member4=people.find(p=>p.email==='demo.1.4@example.invalid');
  const allocation=(await db.pool.query('SELECT id FROM coordinator_allocations WHERE member_membership_id=$1 AND ends_at IS NULL',[member3.membership_id])).rows[0].id;
  const sensitive=await Promise.allSettled([0,1].map(()=>tenancy.sensitive(local.token,local.csrf,client,allocation,true,reason)));
  expect(sensitive.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(sensitive.filter(r=>r.status==='rejected').map(r=>(r as PromiseRejectedResult).reason.status)).toEqual([409]);
  expect((await db.pool.query('SELECT id FROM client_sensitive_grants WHERE allocation_id=$1',[allocation])).rowCount).toBe(1);
  expect((await db.pool.query("SELECT id FROM audit_events WHERE action='client.sensitive.granted'")).rowCount).toBe(1);
  const ending=(await db.pool.query('SELECT id FROM coordinator_allocations WHERE member_membership_id=$1 AND ends_at IS NULL',[member4.membership_id])).rows[0].id;
  const ended=await blocked('SELECT id FROM organisations WHERE id=$1 FOR UPDATE',[client],
   ()=>tenancy.sensitive(local.token,local.csrf,client,ending,true,reason),
   sql=>sql.query('UPDATE coordinator_allocations SET ends_at=now() WHERE id=$1',[ending]));
  expect(ended).toMatchObject({ok:false,error:{status:404}});
  expect((await db.pool.query('SELECT id FROM client_sensitive_grants WHERE allocation_id=$1',[ending])).rowCount).toBe(0);
  const reviewer1=people.find(p=>p.email==='demo.1.1@example.invalid'),reviewer2=people.find(p=>p.email==='demo.1.2@example.invalid');
  const allocations=await Promise.allSettled([reviewer1,reviewer2].map(reviewer=>tenancy.allocate(owner.token,owner.csrf,client,member4.membership_id,reviewer.membership_id,'primary',reason)));
  expect(allocations.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(allocations.filter(r=>r.status==='rejected').map(r=>(r as PromiseRejectedResult).reason.status)).toEqual([409]);
  expect((await db.pool.query("SELECT id FROM coordinator_allocations WHERE member_membership_id=$1 AND kind='primary' AND ends_at IS NULL",[member4.membership_id])).rowCount).toBe(1);
  const enrolments=new Enrolments(auth),onboarding=new Onboarding(enrolments,randomBytes(32)),plans=new LearningPlans(onboarding);
  const reviewer=await login(reviewer2.email);await tenancy.select(reviewer.token,reviewer.csrf,client);
  const enrolment=(await enrolments.create(owner.token,owner.csrf,client,{memberId:member3.membership_id,coordinatorId:reviewer2.membership_id,groupId:null,title:'Waiting approval',reason})).id;
  await expect(db.pool.query('UPDATE users SET is_synthetic=false WHERE id=$1',[member3.id])).rejects.toMatchObject({code:'23514',constraint:'training_synthetic_status_immutable'});
  expect((await db.pool.query('SELECT is_synthetic FROM users WHERE id=$1',[member3.id])).rows[0].is_synthetic).toBe(true);
  const historyBefore=(await db.pool.query('SELECT * FROM enrolments WHERE id=$1',[enrolment])).rows;
  await db.pool.query('UPDATE users SET is_synthetic=true WHERE id=$1',[member3.id]);
  expect((await db.pool.query('SELECT * FROM enrolments WHERE id=$1',[enrolment])).rows).toEqual(historyBefore);
  const inputs={
   profile:{current_role:'Member',responsibilities:'Practice',experience:'One year',tools:'Laptop',preferences:'English'},
   capability:{target_role:'Supervisor',purpose:'Safe practice',proficiency:'Independent',success:'Complete tasks',prerequisites:'Induction',competencies:'Safety'},
   assessment:{source:'Original interview',provider:'Coordinator',date:'2026-01-01',scale:'Not scored',findings:'Observed safe practice',kind:'observed evidence'},
   measures:{kpis:Array.from({length:3},(_,i)=>({name:'Measure '+i,baseline:'unknown',target:'90',unit:'percent',rationale:'Safety',evidence:'Observation',cadence:'Weekly'}))},
   resources:{title:'Guide',reference:'Internal handbook',licence:'Internal use',cost:'No cost',access:'Access checked',tasks:'Safe practice'},
   schedule:{duration:4,daily_minutes:30,capacity_minutes:30,start_date:'2090-01-02',timezone:'Asia/Manila',weekdays:[1],holidays:[],absences:[]}
  };
  let onboardingVersion=0;
  for(const [step,input] of Object.entries(inputs))onboardingVersion=(await onboarding.save(reviewer.token,reviewer.csrf,client,enrolment,step as any,input,onboardingVersion,step==='assessment')).version;
  await onboarding.confirmCalendar(reviewer.token,reviewer.csrf,client,enrolment,0,onboardingVersion,reason);
  let planVersion=(await plans.create(reviewer.token,reviewer.csrf,client,enrolment,0,onboardingVersion,reason)).version;
  const plan=await plans.read(reviewer.token,client,enrolment);
  for(const [index,block] of plan.plan.content.blocks.entries()) {
   const input={...block,objective:'Apply safe practice',prerequisites:'Complete induction',competency:1,criterion_one:'Safe method',criterion_two:'Evidence quality',weight_one:0.5,weight_two:0.5,
    lessons:block.lessons.map(lesson=>({...lesson,title:'Safe practice',explanation:'Review the method.',example:'Observe a worked example.',activity:'Demonstrate safe practice.',tools:'Use the supplied handbook.',completion:'Record an observed demonstration.',reading:5,practice:15,assessment:5,revision:5,kpi:1}))};
   planVersion=(await plans.edit(reviewer.token,reviewer.csrf,client,enrolment,planVersion,index,input,reason)).version;
  }
  await plans.review(reviewer.token,reviewer.csrf,client,enrolment,planVersion,false,'');
  const sensitiveDenied=await blocked('SELECT id FROM organisations WHERE id=$1 FOR UPDATE',[client],
   ()=>plans.review(reviewer.token,reviewer.csrf,client,enrolment,planVersion,true,reason),
   sql=>sql.query('UPDATE client_sensitive_grants SET ends_at=now() WHERE allocation_id=$1 AND ends_at IS NULL',[allocation]));
  expect(sensitiveDenied).toMatchObject({ok:false,error:{status:404}});
  expect((await db.pool.query('SELECT state FROM programme_versions WHERE enrolment_id=$1 ORDER BY version DESC LIMIT 1',[enrolment])).rows[0].state).toBe('needs_review');
  const ownerId=(await auth.context(owner.token)).user!.id;
  await db.pool.query("INSERT INTO client_sensitive_grants(id,organisation_id,environment,allocation_id,granted_by,reason) VALUES($1,$2,'test',$3,$4,$5)",[randomUUID(),client,allocation,ownerId,reason]);
  const suspendedDenied=await blocked('SELECT id FROM organisations WHERE id=$1 FOR UPDATE',[client],
   ()=>plans.review(reviewer.token,reviewer.csrf,client,enrolment,planVersion,true,reason),
   sql=>sql.query('UPDATE platform_client_states SET suspended=true WHERE organisation_id=$1',[client]));
  expect(suspendedDenied).toMatchObject({ok:false,error:{status:403}});
  expect((await db.pool.query("SELECT id FROM programme_versions WHERE enrolment_id=$1 AND state='approved'",[enrolment])).rowCount).toBe(0);
  await db.pool.query('UPDATE platform_client_states SET suspended=false WHERE organisation_id=$1',[client]);
  const definitions=new AssessmentDefinitions(auth,randomBytes(32)),assignments=new AssessmentAssignments(definitions),responses=new AssessmentResponses(assignments),reviews=new AssessmentReviews(responses);
  const firstSection=randomUUID(),lastSection=randomUUID(),area=randomUUID(),rating=randomUUID();
  const definition=(await definitions.save(reviewer.token,reviewer.csrf,client,{
   title:'Concurrent section assessment',questions:[
    {id:'matrix',type:'self_assessment',prompt:'Rate your practice',matrix:{areas:[{id:area,text:'I verify evidence'}],ratings:[{id:rating,text:'Confident'},{id:randomUUID(),text:'Learning'}],required:true,notes_enabled:true}},
    {id:'written',type:'open_response',prompt:'Explain your evidence'}],
   sections:[{id:firstSection,title:'Reflection',instructions:'Reflect on practice',question_ids:['matrix']},{id:lastSection,title:'Evidence',instructions:'Explain practice',question_ids:['written']}],
   rubric:{threshold:75,criteria:[{id:'evidence',category:'Practice',label:'Evidence',guidance:'Use evidence',weight:1}]}
  },null,0,randomUUID())).id;
  await definitions.publish(reviewer.token,reviewer.csrf,client,definition,1);
  const assigned=await Promise.all([0,1].map(()=>assignments.create(reviewer.token,reviewer.csrf,client,definition,'member',enrolment)));
  expect(assigned[0].id).toBe(assigned[1].id);const assignment=assigned[0].id;
  const member=await login(member3.email);await tenancy.select(member.token,member.csrf,client);
  const matrix={section_id:firstSection,navigate_to:lastSection,save_token:randomUUID(),responses:{matrix:{[area]:{rating_id:rating,note:'Observed safe practice'}}}};
  const saves=await Promise.all([0,1].map(()=>responses.save(member.token,member.csrf,client,assignment,1,matrix)));
  expect(saves[0]).toEqual(saves[1]);expect(saves[0].version).toBe(2);expect(saves[0].progress?.current).toBe(lastSection);
  const distinct=await Promise.allSettled(['First writer','Second writer'].map(text=>responses.save(member.token,member.csrf,client,assignment,2,{section_id:lastSection,save_token:randomUUID(),responses:{written:text}})));
  expect(distinct.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(distinct.filter(r=>r.status==='rejected').map(r=>(r as PromiseRejectedResult).reason.status)).toEqual([409]);
  const submissionKey=randomUUID();const submissions=await Promise.all([0,1].map(()=>responses.submit(member.token,member.csrf,client,assignment,3,submissionKey)));
  expect(submissions[0].receipt).toBe(submissions[1].receipt);
  expect((await db.pool.query('SELECT id FROM assessment_attempts WHERE assignment_id=$1',[assignment])).rowCount).toBe(1);
  const attempt=submissions[0].receipt,result={rubric_id:definition,rubric_version:1,criteria:[{id:'evidence',score:80,evidence_ids:[attempt+':written'],feedback:'Evidence supports the result.',insufficient_evidence:false}]};
  const decisions=await Promise.allSettled([0,1].map(()=>reviews.decide(reviewer.token,reviewer.csrf,client,assignment,attempt,submissions[0].version,'approved',reason,result)));
  expect(decisions.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(decisions.filter(r=>r.status==='rejected').map(r=>(r as PromiseRejectedResult).reason.status)).toEqual([409]);
  expect((await db.pool.query('SELECT id FROM assessment_reviews WHERE attempt_id=$1',[attempt])).rowCount).toBe(1);
  const team=(await db.pool.query('SELECT id FROM groups WHERE organisation_id=$1 LIMIT 1',[client])).rows[0].id;
  const teamRecord=(await enrolments.create(owner.token,owner.csrf,client,{memberId:member3.membership_id,coordinatorId:reviewer2.membership_id,groupId:team,title:'Team rule race',reason})).id;
  await Promise.all([0,1].map(()=>assignments.create(reviewer.token,reviewer.csrf,client,definition,'team',team)));
  await Promise.all([assignments.recover(),assignments.recover()]);
  expect((await db.pool.query('SELECT id FROM assessment_team_rules WHERE definition_id=$1 AND group_id=$2',[definition,team])).rowCount).toBe(1);
  expect((await db.pool.query('SELECT id FROM assessment_assignments WHERE definition_id=$1 AND enrolment_id=$2',[definition,teamRecord])).rowCount).toBe(1);
  let secondOnboarding=0;
  for(const [step,input] of Object.entries(inputs))secondOnboarding=(await onboarding.save(reviewer.token,reviewer.csrf,client,teamRecord,step as any,input,secondOnboarding,step==='assessment')).version;
  const secondPlan=await plans.create(reviewer.token,reviewer.csrf,client,teamRecord,0,secondOnboarding,reason);
  const config=aiConfig();config.liveEnabled=false;config.organisationLimit=2000000;config.programmeLimit=2000000;
  const gateway=new AiGateway(new AiRegistry(enrolments,()=>config),onboarding.key),generation=new ProgrammeGeneration(plans,gateway);
  const reservations=await Promise.allSettled([[enrolment,planVersion],[teamRecord,secondPlan.version]].map(([id,version])=>generation.request(reviewer.token,reviewer.csrf,client,String(id),Number(version),randomUUID())));
  expect(reservations.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(reservations.filter(r=>r.status==='rejected').map(r=>(r as PromiseRejectedResult).reason.code)).toEqual(['spend_limit']);
  expect((await db.pool.query('SELECT id FROM ai_runs')).rowCount).toBe(1);
  expect(Number((await db.pool.query('SELECT sum(reserved+spent) total FROM ai_runs')).rows[0].total)).toBeLessThanOrEqual(2000000);
  let providerCalls=0;gateway.providers.mock=async(...args)=>{providerCalls++;return mockProvider(...args);};
  const job=await claim(db,['ai.task']);expect(job).toBeTruthy();
  await Promise.all([gateway.process(job!),gateway.process(job!)]);await finish(db,job!,'done');
  expect(providerCalls).toBe(1);expect((await db.pool.query('SELECT id FROM ai_attempts')).rowCount).toBe(1);
  expect((await db.pool.query('SELECT status FROM ai_blocks WHERE id=$1',[job!.payload.blockId])).rows[0].status).toBe('complete');
  expect(Number((await db.pool.query('SELECT spent FROM ai_runs')).rows[0].spent)).toBe(Number((await db.pool.query('SELECT cost FROM ai_attempts')).rows[0].cost));
  const capacityPlans: {id:string;version:number}[]=[];
  for(let n=0;n<2;n++) {
   const id=(await enrolments.create(owner.token,owner.csrf,client,{memberId:member3.membership_id,coordinatorId:reviewer2.membership_id,groupId:null,title:'Capacity race '+n,reason})).id;
   let sourceVersion=0;
   for(const [step,input] of Object.entries(inputs))sourceVersion=(await onboarding.save(reviewer.token,reviewer.csrf,client,id,step as any,input,sourceVersion,step==='assessment')).version;
   let version=(await plans.create(reviewer.token,reviewer.csrf,client,id,0,sourceVersion,reason)).version;
   const draft=await plans.read(reviewer.token,client,id);
   for(const [index,block] of draft.plan.content.blocks.entries()) {
    const input={...block,objective:'Apply safe practice',prerequisites:'Complete induction',competency:1,criterion_one:'Safe method',criterion_two:'Evidence quality',weight_one:0.5,weight_two:0.5,
     lessons:block.lessons.map(lesson=>({...lesson,title:'Safe practice',explanation:'Review the method.',example:'Observe a worked example.',activity:'Demonstrate safe practice.',tools:'Use the supplied handbook.',completion:'Record an observed demonstration.',reading:5,practice:15,assessment:5,revision:5,kpi:1}))};
    version=(await plans.edit(reviewer.token,reviewer.csrf,client,id,version,index,input,reason)).version;
   }
   await plans.review(reviewer.token,reviewer.csrf,client,id,version,false,'');
   capacityPlans.push({id,version});
  }
  const approvals=await Promise.allSettled(capacityPlans.map(p=>plans.review(reviewer.token,reviewer.csrf,client,p.id,p.version,true,reason)));
  expect(approvals.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(approvals.filter(r=>r.status==='rejected').map(r=>(r as PromiseRejectedResult).reason.code)).toEqual(['capacity_exceeded']);
  expect((await db.pool.query('SELECT id FROM programme_approvals')).rowCount).toBe(1);
  expect((await db.pool.query('SELECT count(*)::int count,sum(minutes)::int minutes FROM capacity_allocations WHERE active')).rows[0]).toEqual({count:4,minutes:120});
  const historySnapshot=async()=>{
   const tables=(await db!.pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
   const hashes:Record<string,unknown>={};
   for(const {tablename} of tables){
    if(!/^[a-z_][a-z0-9_]*$/.test(tablename))throw new Error('Unexpected test table identifier');
    hashes[tablename]=(await db!.pool.query(`SELECT count(*)::int count,md5(coalesce(string_agg(row_to_json(t)::text,'' ORDER BY row_to_json(t)::text),'')) digest FROM "${tablename}" t`)).rows[0];
   }
   return hashes;
  };
  const history=await historySnapshot();
  await migrate(db);
  expect(await historySnapshot()).toEqual(history);
  const before=(await db.pool.query('SELECT count(*)::int count FROM audit_events')).rows[0].count;
  const denied=await blocked('SELECT id FROM organisations WHERE id=$1 FOR UPDATE',[client],
   ()=>tenancy.createGroup(local.token,local.csrf,client,'Revocation race group','team',reason),
   sql=>sql.query("UPDATE role_assignments SET ends_at=now() WHERE user_id=$1 AND role='admin' AND scope_type='client'",[localUser.id]));
  expect(denied).toMatchObject({ok:false,error:{status:403}});
  expect((await db.pool.query("SELECT id FROM groups WHERE name='Revocation race group'")).rowCount).toBe(0);
  expect((await db.pool.query('SELECT count(*)::int count FROM audit_events')).rows[0].count).toBe(before);
  await expect(tenancy.administration(local.token,client)).rejects.toMatchObject({status:403});
  const actor=people.find(p=>p.email==='demo.1.1@example.invalid');
  await db.pool.query("INSERT INTO role_assignments(id,user_id,role,environment,scope_type,scope_key,granted_by,reason) VALUES($1,$2,'admin','test','platform','platform',$2,$3)",[randomUUID(),actor.id,reason]);
  const otherAdmin=await login(actor.email);
  const platformDenied=await blocked("SELECT environment FROM platform_settings WHERE environment='test' FOR UPDATE",[],
   ()=>platform.clientRole(otherAdmin.token,otherAdmin.csrf,client,target.id,'grant',target.permission_version,reason),
   sql=>sql.query("UPDATE role_assignments SET ends_at=now() WHERE user_id=$1 AND scope_type='platform'",[actor.id]));
  expect(platformDenied).toMatchObject({ok:false,error:{status:403}});
  expect((await db.pool.query("SELECT id FROM platform_audit_events WHERE action='platform.client.account.grant'")).rowCount).toBe(0);
  await db.pool.query("INSERT INTO role_assignments(id,user_id,role,environment,scope_type,scope_key,granted_by,reason) VALUES($1,$2,'admin','test','platform','platform',$2,$3)",[randomUUID(),actor.id,reason]);
  await tenancy.select(otherAdmin.token,otherAdmin.csrf,client);
  const brandDenied=await blocked('SELECT id FROM users WHERE id=$1 FOR UPDATE',[actor.id],
   ()=>brand.save(otherAdmin.token,otherAdmin.csrf,client,{...input,version:1,displayName:'Revoked actor brand'}),
   sql=>sql.query("UPDATE role_assignments SET ends_at=now() WHERE user_id=$1 AND scope_type='platform' AND ends_at IS NULL",[actor.id]));
  expect(brandDenied).toMatchObject({ok:false,error:{status:403}});
  expect((await db.pool.query('SELECT version FROM client_brandings WHERE organisation_id=$1',[client])).rows[0].version).toBe(1);

 } finally {await db?.close();await root.pool.query('DROP DATABASE IF EXISTS '+name+' WITH (FORCE)');await root.close();}
},120000);
