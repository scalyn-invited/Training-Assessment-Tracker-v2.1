import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Database } from '../../packages/database/src/database.js';
test('client filters restore through direct URLs, reload, history and pagination',async({page,request})=>{
 test.setTimeout(120000);const guest=await(await request.get('/api/auth/context')).json();
 expect((await request.post('/api/auth/setup',{headers:{Origin:'http://127.0.0.1:3110'},data:{csrf:guest.csrf,name:'Directory owner',email:'owner@example.invalid',password:'Unique administrator passphrase',demoPassword:'Separate demonstration password'}})).ok()).toBe(true);
 const db=new Database('postgresql://postgres:postgres@127.0.0.1:55432/postgres');
 try{for(let n=0;n<24;n++){const id=randomUUID();await db.pool.query('INSERT INTO organisations(id,name) VALUES($1,$2)',[id,'URL Test '+String(n).padStart(2,'0')]);await db.pool.query("INSERT INTO platform_client_states(organisation_id,environment) VALUES($1,'test')",[id]);}}finally{await db.close();}
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('owner@example.invalid');await page.getByLabel('Password',{exact:true}).fill('Unique administrator passphrase');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(/platform/);
 await page.goto('/platform/clients?client_search=URL+Test&status=active&sort=desc&page=2&view=clients#directory');
 const search=page.getByRole('search',{name:'Find clients'}),table=page.getByRole('table',{name:'Client directory'});
 await expect(search.getByRole('searchbox',{name:'Search clients'})).toHaveValue('URL Test');await expect(search.getByRole('combobox',{name:'Status'})).toHaveValue('active');
 await expect(table.getByRole('button',{name:'Manage URL Test 03',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Previous',exact:true}).click();await expect(page).not.toHaveURL(/[?&]page=/);await expect(table.getByRole('button',{name:'Manage URL Test 23',exact:true})).toBeVisible();
 await page.goBack();await expect(page).toHaveURL(/[?&]page=2/);await expect(table.getByRole('button',{name:'Manage URL Test 03',exact:true})).toBeVisible();
 await page.reload();await expect(search.getByRole('searchbox',{name:'Search clients'})).toHaveValue('URL Test');await expect(table.getByRole('button',{name:'Manage URL Test 03',exact:true})).toBeVisible();
 await search.getByRole('combobox',{name:'Status'}).selectOption('suspended');await expect(page).toHaveURL(/status=suspended/);await expect(page).not.toHaveURL(/[?&]page=/);
 await page.goBack();await expect(search.getByRole('combobox',{name:'Status'})).toHaveValue('active');await expect(table.getByRole('button',{name:'Manage URL Test 03',exact:true})).toBeVisible();
 await page.goForward();await expect(search.getByRole('combobox',{name:'Status'})).toHaveValue('suspended');
 await search.getByRole('button',{name:'Clear filters'}).click();await expect(search.getByRole('searchbox',{name:'Search clients'})).toHaveValue('');await expect(page).toHaveURL(/sort=desc/);await expect(page).toHaveURL(/view=clients/);await expect(page).toHaveURL(/#directory$/);await expect(page).not.toHaveURL(/client_search|status=|page=/);
 await search.getByRole('searchbox',{name:'Search clients'}).fill('Demo Client 2');await expect(page).toHaveURL(/client_search=Demo\+Client\+2/);await expect(table.getByRole('button',{name:'Manage Demo Client 2',exact:true})).toBeVisible();
 await page.reload();await expect(search.getByRole('searchbox',{name:'Search clients'})).toHaveValue('Demo Client 2');
 await page.goto('/platform/clients?status=bogus&sort=bogus&page=-7');await expect(search.getByRole('combobox',{name:'Status'})).toHaveValue('');await expect(table.getByRole('button',{name:'Manage Demo Client 1',exact:true})).toBeVisible();
 await page.setViewportSize({width:375,height:812});
 await page.getByRole('button',{name:'Client name: A to Z',exact:true}).click();await expect(page).toHaveURL(/sort=desc/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.goBack();await expect(page.getByRole('button',{name:'Client name: A to Z',exact:true})).toBeVisible();
});
