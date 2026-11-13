import { test, expect } from '@playwright/test';
import { Database } from '../../packages/database/src/database.js';
test('browser client selection rotates CSRF, audits selection and rejects the old token',async({page})=>{
 const origin='http://127.0.0.1:3110',request=page.request,password='Private client selection passphrase';
 const context=async()=>await(await request.get('/api/auth/context')).json();
 const post=(path:string,data:Record<string,unknown>)=>request.post('/api'+path,{headers:{Origin:origin},data});
 let ctx=await context();expect((await post('/auth/setup',{csrf:ctx.csrf,name:'Selection owner',email:'owner@example.invalid',password,demoPassword:'Separate fictional password'})).ok()).toBe(true);
 ctx=await context();expect((await post('/auth/login',{csrf:ctx.csrf,email:'owner@example.invalid',password})).ok()).toBe(true);
 ctx=await context();const client=(await(await request.get('/api/clients')).json())[0].id;
 const response=await post('/clients/select',{csrf:ctx.csrf,clientId:client});expect(response.status()).toBe(201);
 const selected=await response.json();expect(selected.csrf).not.toBe(ctx.csrf);expect(selected.clientId).toBe(client);
 expect((await context()).csrf).toBe(selected.csrf);
 expect((await post('/clients/select',{csrf:ctx.csrf,clientId:client})).status()).toBe(403);
 const db=new Database('postgresql://postgres:postgres@127.0.0.1:55432/postgres');
 try{const rows=(await db.pool.query("SELECT organisation_id,target_id FROM audit_events WHERE action='client.selected'")).rows;expect(rows).toEqual([{organisation_id:client,target_id:client}]);}finally{await db.close();}
 await page.goto('/dashboard');await expect(page.getByRole('heading',{name:'Welcome back, Selection owner.',exact:true})).toBeVisible();
 expect((await post('/clients/select',{csrf:selected.csrf,clientId:client})).status()).toBe(201);
});
