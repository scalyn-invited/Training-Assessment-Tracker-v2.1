import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Database } from '../../packages/database/src/database.js';
test('mock platform account join requires explicit choice and changes ambiguous defaults',async({page,request})=>{
 test.setTimeout(120000);
 const guest=await(await request.get('/api/auth/context')).json();
 expect((await request.post('/api/auth/setup',{headers:{Origin:'http://127.0.0.1:3110'},data:{csrf:guest.csrf,name:'Platform owner',email:'owner@example.invalid',password:'Unique administrator passphrase',demoPassword:'Separate demonstration password'}})).ok()).toBe(true);
 const db=new Database('postgresql://postgres:postgres@127.0.0.1:55432/postgres');
 try{
 const actor=(await db.pool.query("SELECT id FROM users WHERE email='demo.1.0@example.invalid'")).rows[0].id;
 await db.pool.query("INSERT INTO role_assignments(id,user_id,role,environment,scope_type,scope_key,granted_by,reason) VALUES($1,$2,'admin','test','platform','platform',$2,'Explicit browser fixture authority')",[randomUUID(),actor]);
 await page.goto('/login');await page.getByRole('button',{name:'Sign in as Demo Client Admin 1.0',exact:true}).click();await expect(page).toHaveURL(/platform/);
 await page.goto('/platform/clients#client-account-access');const section=page.getByRole('region',{name:'Client account access'});
 await section.getByLabel('Search accounts',{exact:true}).fill('demo.1.3@example.invalid');await section.getByRole('button',{name:'Search accounts',exact:true}).click();
 await expect(section.getByText('1 matching accounts',{exact:true})).toBeVisible();await expect(section.getByText('Loading accounts...',{exact:true})).toHaveCount(0);await section.getByText('Demo Member 1.3 - demo.1.3@example.invalid',{exact:true}).click();
 const form=section.getByRole('form',{name:'Manage client access for demo.1.3@example.invalid'});
 await form.getByRole('combobox',{name:'Client',exact:true}).selectOption({label:'Demo Client 2'});await form.getByRole('combobox',{name:'Action',exact:true}).selectOption('join');await form.getByLabel('Reason',{exact:true}).fill('Explicit join to another fictional client');await form.getByRole('checkbox').check();await form.getByRole('button',{name:'Apply access change'}).click();
 await expect(section.getByText('Access updated for Demo Member 1.3. Affected sessions have ended.',{exact:true})).toBeVisible();
 await expect(section.getByText('1 matching accounts',{exact:true})).toBeVisible();await expect(section.getByText('Loading accounts...',{exact:true})).toHaveCount(0);await section.getByText('Demo Member 1.3 - demo.1.3@example.invalid',{exact:true}).click();await expect(form.getByRole('combobox',{name:'Client',exact:true})).toHaveValue('');await expect(form.getByRole('combobox',{name:'Action',exact:true})).toHaveValue('');
 expect((await db.pool.query("SELECT cm.id FROM client_memberships cm JOIN users u ON u.id=cm.user_id WHERE u.email='demo.1.3@example.invalid' AND cm.status='active' AND cm.ended_at IS NULL")).rowCount).toBe(2);
 }finally{await db.close();}
});
