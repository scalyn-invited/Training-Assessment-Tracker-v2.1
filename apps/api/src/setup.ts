import { randomUUID } from 'node:crypto';
import { config as loadEnvironment } from 'dotenv';
const setupExternalEnvironment = { ...process.env };
loadEnvironment();
import 'reflect-metadata';
import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  Module,
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { json, type Request, type Response, type NextFunction } from 'express';
import { readFile } from 'node:fs/promises';
import type { TLSSocket } from 'node:tls';
import { z, ZodError } from 'zod';
import { InstallationState } from '../../../packages/domain/src/installation-state.js';
import { Installer } from '../../../packages/domain/src/installer.js';
import { verifySetupTransport } from '../../../packages/domain/src/installation-transport.js';
import { DomainError, requireCondition } from '../../../packages/domain/src/errors.js';
import { generate, themes } from '../../../packages/domain/src/theme.js';
import { port } from '../../../packages/database/src/config.js';
const store = new InstallationState(process.env.SETUP_APP_ROOT ?? process.cwd()),
  installer = new Installer(
    store,
    undefined,
    setupExternalEnvironment,
    undefined,
    process.env.SETUP_LOCAL_DATABASE === 'true'
      ? {
          engine: 'pglite',
          host: '127.0.0.1',
          port: port('PGLITE_PORT', 55431),
          database: 'postgres',
          username: 'postgres',
          password: 'postgres',
        }
      : undefined,
  );
const cookie = 'tracker_setup';
const csrf = z.string().regex(/^[a-f0-9]{64}$/);
const limits = new Map<string, { count: number; until: number }>();
function limit(key: string, max: number) {
  const now = Date.now();
  for (const [entry, value] of limits) if (value.until < now) limits.delete(entry);
  requireCondition(
    limits.size < 10000 || limits.has(key),
    429,
    'setup_rate_limited',
    'Wait one minute before trying again.',
  );
  const value = limits.get(key) ?? { count: 0, until: now + 60000 };
  value.count++;
  limits.set(key, value);
  requireCondition(
    value.count <= max,
    429,
    'setup_rate_limited',
    'Wait one minute before trying again.',
  );
}
function token(req: Request) {
  return String(req.cookies?.[cookie] ?? '');
}
function setCookie(res: Response, value: string) {
  res.cookie(cookie, value, {
    httpOnly: true,
    secure: state.mode === 'hosted' || state.origin.startsWith('https:'),
    sameSite: 'strict',
    path: '/api/installation',
    maxAge: 3600000,
  });
}
@Catch()
class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (error instanceof DomainError) {
      res.status(error.status).json({ code: error.code, message: error.message });
      return;
    }
    if (error instanceof ZodError) {
      res.status(422).json({
        code: 'validation',
        message: 'Check the required fields and their lengths, then try again.',
      });
      return;
    }
    if (error instanceof HttpException) {
      res
        .status(error.getStatus())
        .json({ code: 'setup_request', message: 'This setup request is unavailable.' });
      return;
    }
    const code = (error as { code?: unknown } | null)?.code;
    console.warn(
      'Setup stage failed: ' +
        (typeof code === 'string' && /^[A-Z0-9_]{2,40}$/.test(code) ? code : 'unexpected_error'),
    );
    res.status(503).json({
      code: 'setup_failed',
      message:
        'Setup could not complete this stage. Check server permissions and database availability, then retry. Existing records were preserved.',
    });
  }
}
@Controller()
class SetupController {
  @Get('branding/current') branding() {
    return {
      displayName: 'Scalyn',
      appName: 'Assessment Training Tracker',
      mode: 'white-label',
      selectedTheme: 'light',
      theme: 'light',
      logo: '/images/scalyn-opc-logo.png',
      themes,
      palettes: generate('#1d4668'),
      platformPalettes: generate('#1d4668'),
    };
  }

  @Get('health/ready') ready() {
    return { status: 'setup' };
  }
  @Get('auth/context') redirect() {
    return { installed: false, user: null, csrf: '', setupMode: state.mode };
  }
  @Get('installation/completion') async completion() {
    return { complete: (await store.read())?.status === 'installed' };
  }
  @Get('installation/context') async context(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    limit('read:' + req.socket.remoteAddress, 60);
    const session = await store.session(token(req));
    if (session.token !== token(req)) setCookie(res, session.token);
    let owner = false;
    try {
      await store.verified(session.token);
      owner = true;
    } catch (error) {
      if (!(error instanceof DomainError) || error.status !== 403) throw error;
    }
    return {
      csrf: session.value.csrf,
      mode: session.state.mode,
      upgrade: Boolean(session.state.upgrade),
      localDatabaseAvailable:
        session.state.mode === 'local' &&
        !session.state.upgrade &&
        Boolean(installer.localDatabase),
      fixtureProgress: owner ? (session.value.fixtureProgress ?? 0) : 0,
      step: owner ? session.value.step : 'token',
      stage: owner ? session.value.stage : undefined,
      started: session.state.status === 'installing',
      requirements: await installer.requirements(),
      database:
        owner && session.value.database
          ? {
              engine: session.value.database.engine ?? 'postgresql',
              host: session.value.database.host,
              port: session.value.database.port,
              database: session.value.database.database,
              username: session.value.database.username,
            }
          : null,
      administrator:
        owner && session.value.administrator
          ? { name: session.value.administrator.name, email: session.value.administrator.email }
          : null,
    };
  }
  @Post('installation/action') async action(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    limit('action:' + req.socket.remoteAddress, 120);
    const body = z
      .object({
        csrf,
        action: z.enum(['token', 'requirements', 'database', 'administrator', 'back', 'install']),
        data: z.unknown().optional(),
      })
      .parse(req.body);
    if (body.action === 'token') {
      limit('token:' + req.socket.remoteAddress, 5);
      const data = z.object({ token: z.string().length(64) }).parse(body.data);
      const owner = await store.exchange(token(req), body.csrf, data.token);
      setCookie(res, owner.token);
      return { csrf: owner.csrf };
    }
    if (body.action === 'database')
      return installer.prepareDatabase(token(req), body.csrf, body.data);
    if (body.action === 'administrator')
      return installer.prepareAdministrator(token(req), body.csrf, body.data);
    if (body.action === 'install') {
      const result = await installer.advance(token(req), body.csrf);
      if (result.complete)
        res.clearCookie(cookie, {
          httpOnly: true,
          secure: state.mode === 'hosted' || state.origin.startsWith('https:'),
          sameSite: 'strict',
          path: '/api/installation',
        });
      return result;
    }
    return store.locked(async () => {
      const session = await store.verified(token(req), body.csrf);
      if (body.action === 'requirements') {
        requireCondition(
          Object.values(await installer.requirements()).every(Boolean),
          409,
          'requirements_failed',
          'Resolve the failed requirements, then check again.',
        );
        session.value.step = 'database';
      } else {
        requireCondition(
          session.state.status === 'pending',
          409,
          'installation_started',
          'Installation has started. Resume with the original details.',
        );
        session.value.step =
          session.value.step === 'review'
            ? 'administrator'
            : session.value.step === 'administrator'
              ? 'database'
              : 'requirements';
      }
      await store.saveSession(token(req), session.value, session.state);
      return { step: session.value.step };
    });
  }
}
@Module({ controllers: [SetupController] })
class SetupModule {}
const preparedState = await store.read();
requireCondition(
  preparedState && preparedState.status !== 'installed',
  503,
  'setup_not_prepared',
  'Prepare hosted installation from the server console first.',
);
const state = preparedState;
const keyPath = process.env.SETUP_TLS_KEY,
  certPath = process.env.SETUP_TLS_CERT;
requireCondition(
  Boolean(keyPath) === Boolean(certPath),
  503,
  'tls_configuration',
  'Configure both setup TLS key and certificate paths.',
);
const httpsOptions =
  keyPath && certPath
    ? { key: await readFile(keyPath), cert: await readFile(certPath) }
    : undefined;
const app = await NestFactory.create(SetupModule, {
  logger: false,
  bodyParser: false,
  httpsOptions,
});
app.use(helmet({ frameguard: { action: 'deny' } }));
app.use(cookieParser());
app.use(json({ limit: '32kb' }));
app.useGlobalFilters(new Errors());
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Request-ID', randomUUID());
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.path === '/health/ready') return next();
  try {
    verifySetupTransport(
      {
        encrypted: Boolean((req.socket as TLSSocket).encrypted),
        remoteAddress: req.socket.remoteAddress ?? '',
        host: req.headers.host ?? '',
        forwardedHost: req.header('x-forwarded-host'),
        forwardedProto: req.header('x-forwarded-proto'),
        origin: req.header('origin'),
        method: req.method,
      },
      state.origin,
      process.env.SETUP_TRUSTED_PROXY,
      state.mode,
    );
    next();
  } catch (error) {
    const e = error as DomainError;
    res.status(e.status ?? 503).json({ code: e.code ?? 'setup_transport', message: e.message });
  }
});
await app.listen(port('API_PORT', 3101), '127.0.0.1');
console.log('Setup API ready. Setup tokens and request values are not logged.');
