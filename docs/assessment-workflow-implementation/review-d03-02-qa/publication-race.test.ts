import {it,expect} from 'vitest';
import {randomBytes,randomUUID} from 'node:crypto';
import {testDatabase} from '../../../tests/helpers.js';
import {Auth} from '../../../packages/domain/src/auth.js';
import {Tenancy} from '../../../packages/domain/src/tenancy.js';
import {AssessmentDefinitions} from '../../../packages/domain/src/assessment-definitions.js';
it('real domain permits changed draft publication at version3 while original version1 publish correctly conflicts',async()=>{
 const instance=await testDatabase();
 try {
  const key=randomBytes(32),auth=new Auth(instance.db,key),tenancy=new Tenancy(auth),definitions=new AssessmentDefinitions(auth,key);
  const guest=await auth.context();await auth.setup(guest.token!,guest.csrf,{name:'Synthetic admin',email:'admin@example.invalid',password:'Unique administrator passphrase',demoPassword:'Separate demonstration password'});
  const g=await auth.context();const author=await auth.login(g.token!,g.csrf,'demo.1.2@example.invalid','Separate demonstration password');
  const client=(await tenancy.choices(author.token))[0].id;await tenancy.select(author.token,author.csrf,client);
  const original={title:'Local version1 title',questions:[{id:'q',type:'multiple_choice',prompt:'Local version1 prompt',choices:[{id:'yes',text:'Yes'},{id:'no',text:'No'}]}],answer_key:{q:'yes'},rubric:{criteria:[],threshold:null}};
  const first=await definitions.save(author.token,author.csrf,client,original,null,0,randomUUID());
  const changed={...original,title:'Other window published title',questions:original.questions.map(q=>({...q,prompt:'Other window published prompt'}))};
  const second=await definitions.save(author.token,author.csrf,client,changed,first.id,first.version,randomUUID());
  await definitions.publish(author.token,author.csrf,client,second.id,second.version);
  await expect(definitions.publish(author.token,author.csrf,client,first.id,first.version)).rejects.toMatchObject({status:409,code:'definition_changed'});
  const row=await definitions.get(author.token,client,first.id);
  expect(row).toMatchObject({id:first.id,revision:1,version:3,status:'published',title:changed.title,questions:changed.questions});
  expect(row.title).not.toBe(original.title);
 } finally {await instance.close();}
});
