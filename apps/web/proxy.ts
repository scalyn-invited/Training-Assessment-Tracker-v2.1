import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { pageResponseHeaders } from '../../packages/domain/src/http-policy';
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const headers = pageResponseHeaders(request.nextUrl.pathname, process.env.TRAINING_AUTH_MODE !== 'mock', randomUUID());
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  return response;
}
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api(?:/|$)|assessments/media(?:/|$)).*)'],
};
