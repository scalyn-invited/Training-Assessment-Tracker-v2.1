import 'dotenv/config';
import 'reflect-metadata';
import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  Module,
  ServiceUnavailableException,
  Catch,
  type ExceptionFilter,
  type ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Request, Response } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { z, ZodError } from 'zod';
import { randomUUID } from 'node:crypto';
import { Database } from '../../../packages/database/src/database.js';
import { databaseMode, port } from '../../../packages/database/src/config.js';
import { Auth } from '../../../packages/domain/src/auth.js';
import { encryptionKey } from '../../../packages/domain/src/crypto.js';
import { DomainError } from '../../../packages/domain/src/errors.js';
const db = new Database(),
  auth = new Auth(db, await encryptionKey());
const cookieName = 'tracker_session';
const password = z.string().min(1).max(128),
  csrf = z.string().length(64);
const origin = new URL(process.env.APP_ORIGIN ?? 'http://localhost:3100').origin;
const allowedOrigins = new Set([origin]);
if (process.env.NODE_ENV !== 'production') {
  const local = new URL(origin);
  if (['localhost', '127.0.0.1'].includes(local.hostname)) {
    local.hostname = local.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
    allowedOrigins.add(local.origin);
  }
}
if (process.env.NODE_ENV === 'production' && !origin.startsWith('https://'))
  throw new Error('APP_ORIGIN must use HTTPS in production');
function token(req: Request) {
  return String(req.cookies?.[cookieName] ?? '');
}
function setCookie(res: Response, value: string) {
  res.cookie(cookieName, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 8 * 60 * 60 * 1000,
  });
}
function parse<T extends z.ZodType>(schema: T, req: Request): z.infer<T> {
  return schema.parse(req.body);
}
@Catch()
class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>(),
      requestId = randomUUID();
    if (error instanceof DomainError) {
      res
        .status(error.status)
        .json({ status: error.status, code: error.code, message: error.message, requestId });
      return;
    }
    if (error instanceof ZodError) {
      res.status(422).json({
        status: 422,
        code: 'validation',
        message: 'Check the required fields and their lengths, then try again.',
        requestId,
      });
      return;
    }
    if (error instanceof HttpException) {
      res.status(error.getStatus()).json({
        status: error.getStatus(),
        code: 'request_failed',
        message: error.message,
        requestId,
      });
      return;
    }
    console.error('Request failed', requestId, error instanceof Error ? error.name : 'unknown');
    res.status(500).json({
      status: 500,
      code: 'server_error',
      message:
        'The request could not be completed. Try again; if it persists, contact your administrator.',
      requestId,
    });
  }
}
@Controller()
class HealthController {
  @Get('health/live') live() {
    return { status: 'ok', service: 'api' };
  }
  @Get('health/ready') async ready() {
    try {
      await db.pool.query('SELECT 1 FROM schema_migrations LIMIT 1');
      return { status: 'ok', service: 'api', database: databaseMode() };
    } catch {
      throw new ServiceUnavailableException(
        'Database is unavailable or migrations have not been applied.',
      );
    }
  }
}
@Controller('auth')
class AuthController {
  @Get('context') async context(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await auth.limit('context:' + req.ip, 120);
    const result = await auth.context(token(req));
    setCookie(res, result.token!);
    return { csrf: result.csrf, user: result.user, installed: result.installed };
  }
  @Post('setup') async setup(@Req() req: Request) {
    await auth.limit('setup:' + req.ip, 10);
    const data = parse(
      z.object({
        csrf,
        name: z.string().min(1).max(120),
        email: z.email().max(200),
        password,
        demoPassword: password,
      }),
      req,
    );
    return auth.setup(token(req), data.csrf, data);
  }
  @Post('login') async login(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await auth.limit('login-ip:' + req.ip, 30);
    const data = parse(
      z.object({ csrf, email: z.email().max(200), password, code: z.string().max(64).optional() }),
      req,
    );
    const result = await auth.login(token(req), data.csrf, data.email, data.password, data.code);
    setCookie(res, result.token);
    return { csrf: result.csrf, user: result.user };
  }
  @Post('logout') async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const data = parse(z.object({ csrf }), req),
      result = await auth.logout(token(req), data.csrf);
    setCookie(res, result.token);
    return { csrf: result.csrf };
  }
  @Get('mfa') mfa(@Req() req: Request) {
    return auth.mfaStatus(token(req));
  }
  @Post('mfa/begin') begin(@Req() req: Request) {
    const data = parse(z.object({ csrf, password }), req);
    return auth.beginMfa(token(req), data.csrf, data.password);
  }
  @Post('mfa/confirm') confirm(@Req() req: Request) {
    const data = parse(z.object({ csrf, code: z.string().regex(/^\d{6}$/) }), req);
    return auth.confirmMfa(token(req), data.csrf, data.code);
  }
  @Post('mfa/disable') disable(@Req() req: Request) {
    const data = parse(z.object({ csrf, password, code: z.string().min(1).max(64) }), req);
    return auth.disableMfa(token(req), data.csrf, data.password, data.code);
  }
  @Post('password') async change(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const data = parse(z.object({ csrf, current: password, next: password }), req);
    const result = await auth.changePassword(token(req), data.csrf, data.current, data.next);
    setCookie(res, result.token);
    return { csrf: result.csrf };
  }
}
@Module({ controllers: [HealthController, AuthController] })
class ApiModule {}
const app = await NestFactory.create(ApiModule, { logger: ['error', 'warn'] });
app.use(helmet());
app.use(cookieParser());
app.useGlobalFilters(new Errors());
app.use((req: Request, res: Response, next: () => void) => {
  res.setHeader('Cache-Control', 'no-store');
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
    !allowedOrigins.has(req.headers.origin ?? '')
  ) {
    res.status(403).json({
      code: 'origin_denied',
      message: 'Open the application at its configured address and try again.',
    });
    return;
  }
  next();
});
app.enableShutdownHooks();
await app.listen(port('API_PORT', 3101), process.env.API_HOST ?? '127.0.0.1');
console.log('API listening on port ' + port('API_PORT', 3101));
let closing = false;
async function stop() {
  if (closing) return;
  closing = true;
  await app.close();
  await db.close();
}
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
