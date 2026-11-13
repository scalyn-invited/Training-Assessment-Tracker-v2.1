import { test, expect } from '@playwright/test';
test('API responses and errors retain private security headers and server-generated request IDs',async({request})=>{
 const ids=new Set<string>();
 for(const origin of ['http://127.0.0.1:3111','http://127.0.0.1:3110/api']) {
  for(const route of ['/health/ready','/auth/context','/unknown-header-route']) {
   const response=await request.get(origin+route,{headers:{'X-Request-ID':'untrusted-id'}});
   expect(response.status()).toBe(route==='/unknown-header-route'?404:200);
   const headers=response.headers();
   expect(headers['cache-control']).toContain('no-store');expect(headers['cache-control']).toContain('private');
   expect(headers['x-frame-options']).toBe('DENY');expect(headers['x-content-type-options']).toBe('nosniff');expect(headers['referrer-policy']).toBe('no-referrer');
   expect(headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);expect(ids.has(headers['x-request-id'])).toBe(false);ids.add(headers['x-request-id']);
   if(route==='/unknown-header-route')expect((await response.json()).requestId).toBe(headers['x-request-id']);
  }
 }
});
