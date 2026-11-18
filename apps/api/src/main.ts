import { RequestLimits } from '../../../packages/domain/src/request-limits.js';
import { FoundationChecks } from '../../../packages/domain/src/foundation-checks.js';
import { Promotions } from '../../../packages/domain/src/promotions.js';
import { MockIdentity } from '../../../packages/domain/src/mock-identity.js';
import { ApprovedFeed } from '../../../packages/domain/src/approved-feed.js';
import { AccountDelivery } from '../../../packages/domain/src/account-delivery.js';
import { LearningNotices } from '../../../packages/domain/src/learning-notices.js';
import { LearningSupport } from '../../../packages/domain/src/learning-support.js';
import { LearningKpis } from '../../../packages/domain/src/learning-kpis.js';
import { LearningLifecycle } from '../../../packages/domain/src/learning-lifecycle.js';
import { LearningGrading } from '../../../packages/domain/src/learning-grading.js';
import { Delivery } from '../../../packages/domain/src/delivery.js';
import { ProgrammeGeneration } from '../../../packages/domain/src/programme-generation.js';
import { DocumentExtractions } from '../../../packages/domain/src/document-extractions.js';
import 'dotenv/config';
import 'reflect-metadata';
import {
  Controller,
  UseInterceptors,
  UploadedFile,
  Param,
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
import { Tenancy } from '../../../packages/domain/src/tenancy.js';
import { Platform } from '../../../packages/domain/src/platform.js';
import { Accounts } from '../../../packages/domain/src/accounts.js';
import {
  draft as assessmentDraft,
  readiness as assessmentReadiness,
} from '../../../packages/domain/src/assessment-content.js';
import { AssessmentDefinitions } from '../../../packages/domain/src/assessment-definitions.js';
import { Branding } from '../../../packages/domain/src/branding.js';
import { FileInterceptor } from '@nestjs/platform-express';
import { AI_TASKS, AiRegistry } from '../../../packages/domain/src/ai-registry.js';
import { AiGateway } from '../../../packages/domain/src/ai-gateway.js';
import { AssessmentAnalysis } from '../../../packages/domain/src/assessment-analysis.js';
import { AssessmentReviews } from '../../../packages/domain/src/assessment-reviews.js';
import { AssessmentResponses } from '../../../packages/domain/src/assessment-responses.js';
import { AssessmentAssignments } from '../../../packages/domain/src/assessment-assignments.js';
import { EvidenceFiles } from '../../../packages/domain/src/evidence-files.js';
import { Onboarding } from '../../../packages/domain/src/onboarding.js';
import { LearningPlans } from '../../../packages/domain/src/learning-plans.js';
import { OnboardingDocuments } from '../../../packages/domain/src/onboarding-documents.js';
import { Enrolments } from '../../../packages/domain/src/enrolments.js';
import { AssessmentMedia } from '../../../packages/domain/src/assessment-media.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Auth } from '../../../packages/domain/src/auth.js';
import { encryptionKey } from '../../../packages/domain/src/crypto.js';
import { DomainError } from '../../../packages/domain/src/errors.js';
import {
  productionBootstrapProfile,
  localProductionRequest,
} from '../../../packages/domain/src/production-profile.js';
const db = new Database(),
  auth = new Auth(db, await encryptionKey());
const cookieName = 'tracker_session';
const password = z.string().min(1).max(128),
  csrf = z.string().length(64);
const localProduction = process.env.TRAINING_LOCAL_PRODUCTION === 'true';
if (localProduction) productionBootstrapProfile('local');
const origin = new URL(process.env.APP_ORIGIN ?? 'http://localhost:3100').origin;
const allowedOrigins = new Set([origin]);
if (process.env.NODE_ENV !== 'production') {
  const local = new URL(origin);
  if (['localhost', '127.0.0.1'].includes(local.hostname)) {
    local.hostname = local.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
    allowedOrigins.add(local.origin);
  }
}
if (process.env.NODE_ENV === 'production' && !localProduction && !origin.startsWith('https://'))
  throw new Error('APP_ORIGIN must use HTTPS in production');
function token(req: Request) {
  return String(req.cookies?.[cookieName] ?? '');
}
function setCookie(res: Response, value: string) {
  res.cookie(cookieName, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' && origin.startsWith('https://'),
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
      requestId = String(res.getHeader('X-Request-ID') ?? randomUUID());
    if (error instanceof DomainError) {
      res.status(error.status).json({
        status: error.status,
        code: error.code,
        message: error.message,
        errors: error.errors,
        requestId,
      });
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
    const sqlState =
      typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
    console.error(
      'Request failed',
      requestId,
      error instanceof Error ? error.name : 'unknown',
      /^[A-Z0-9]{5}$/.test(sqlState) ? sqlState : '',
    );
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
    return {
      csrf: result.csrf,
      user: result.user,
      installed: result.installed,
      client: result.client ?? null,
      canAdmin: result.canAdmin ?? false,
      canCoordinate: result.canCoordinate ?? false,
      authMode: result.authMode ?? null,
    };
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
  @Get('sign-in-options') async signInOptions(@Req() req: Request) {
    await auth.limit('sign-in-options:' + req.ip, 60);
    return auth.signInOptions();
  }
  @Post('mock-login') async mockLogin(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await auth.limit('mock-login-ip:' + req.ip, 30);
    const data = parse(z.object({ csrf, identityId: z.uuid() }), req);
    const result = await auth.mockLogin(token(req), data.csrf, data.identityId);
    setCookie(res, result.token);
    return { csrf: result.csrf, user: result.user };
  }
  @Post('login') async login(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await auth.limit('login-ip:' + req.ip, 10);
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
    const data = parse(
      z.object({ csrf, current: password, next: password, confirmation: password }),
      req,
    );
    const result = await auth.changePassword(
      token(req),
      data.csrf,
      data.current,
      data.next,
      data.confirmation,
    );
    setCookie(res, result.token);
    return { csrf: result.csrf };
  }
}

const tenancy = new Tenancy(auth),
  platform = new Platform(auth);
const uuid = z.uuid(),
  reason = z.string().trim().min(8).max(2000),
  version = z.number().int().nonnegative();
@Controller('clients')
class ClientsController {
  @Get('people') async people(@Req() req: Request) {
    const d = z
      .object({ clientId: uuid, page: z.coerce.number().int().min(1).max(100000).default(1) })
      .parse(req.query);
    const result = await tenancy.administration(token(req), d.clientId, '', d.page);
    return {
      total: result.total,
      people: result.people.map((p) => ({
        id: p.id,
        name: p.name,
        sync_policy: p.sync_policy,
        active: p.active,
      })),
    };
  }

  @Get() list(@Req() req: Request) {
    return tenancy.choices(token(req));
  }
  @Get('administration') administration(@Req() req: Request) {
    const d = z
      .object({
        clientId: uuid,
        search: z.string().max(120).default(''),
        page: z.coerce.number().int().min(1).max(100000).default(1),
      })
      .parse(req.query);
    return tenancy.administration(token(req), d.clientId, d.search, d.page);
  }
  @Post('select') select(@Req() req: Request) {
    const d = parse(z.object({ csrf, clientId: uuid }), req);
    return tenancy.select(token(req), d.csrf, d.clientId, true);
  }
  @Post('people') person(@Req() req: Request) {
    const d = parse(
      z.object({
        csrf,
        clientId: uuid,
        name: z.string().min(1).max(120),
        email: z.string().email().max(200),
        role: z.enum(['member', 'coordinator']),
        synthetic: z.boolean(),
        reason,
      }),
      req,
    );
    return tenancy.createPerson(token(req), d.csrf, d.clientId, d);
  }
  @Post('groups') group(@Req() req: Request) {
    const d = parse(
      z.object({
        csrf,
        clientId: uuid,
        name: z.string().min(1).max(160),
        kind: z.enum(['team', 'cohort']),
        reason,
      }),
      req,
    );
    return tenancy.createGroup(token(req), d.csrf, d.clientId, d.name, d.kind, d.reason);
  }
  @Post('roles/grant') role(@Req() req: Request) {
    const d = parse(
      z.object({
        csrf,
        clientId: uuid,
        memberId: uuid,
        expectedAccountVersion: z.number().int().positive(),
        role: z.enum(['admin', 'coordinator', 'member']),
        teamId: uuid.nullable(),
        reason,
      }),
      req,
    );
    return tenancy.grantRole(
      token(req),
      d.csrf,
      d.clientId,
      d.memberId,
      d.role,
      d.teamId,
      d.reason,
      d.expectedAccountVersion,
    );
  }
  @Post('roles/revoke') revoke(@Req() req: Request) {
    const d = parse(
      z.object({
        csrf,
        clientId: uuid,
        id: uuid,
        expectedAccountVersion: z.number().int().positive(),
        reason,
      }),
      req,
    );
    return tenancy.revokeRole(
      token(req),
      d.csrf,
      d.clientId,
      d.id,
      d.reason,
      d.expectedAccountVersion,
    );
  }
  @Post('teams/membership') team(@Req() req: Request) {
    const d = parse(
      z.object({
        csrf,
        clientId: uuid,
        memberId: uuid,
        expectedAccountVersion: z.number().int().positive(),
        teamId: uuid,
        join: z.boolean(),
        reason,
      }),
      req,
    );
    return tenancy.teamMembership(
      token(req),
      d.csrf,
      d.clientId,
      d.memberId,
      d.teamId,
      d.join,
      d.reason,
      d.expectedAccountVersion,
    );
  }
  @Post('allocations') allocate(@Req() req: Request) {
    const d = parse(
      z.object({
        csrf,
        clientId: uuid,
        memberId: uuid,
        coordinatorId: uuid,
        kind: z.enum(['primary', 'backup']),
        reason,
      }),
      req,
    );
    return tenancy.allocate(
      token(req),
      d.csrf,
      d.clientId,
      d.memberId,
      d.coordinatorId,
      d.kind,
      d.reason,
    );
  }
  @Post('allocations/end') end(@Req() req: Request) {
    const d = parse(z.object({ csrf, clientId: uuid, id: uuid, reason }), req);
    return tenancy.endAllocation(token(req), d.csrf, d.clientId, d.id, d.reason);
  }
  @Post('membership/end') leave(@Req() req: Request) {
    const d = parse(
      z.object({
        csrf,
        clientId: uuid,
        memberId: uuid,
        expectedAccountVersion: z.number().int().positive(),
        version,
        reason,
      }),
      req,
    );
    return tenancy.leave(
      token(req),
      d.csrf,
      d.clientId,
      d.memberId,
      d.version,
      d.reason,
      d.expectedAccountVersion,
    );
  }
  @Post('sensitive') sensitive(@Req() req: Request) {
    const d = parse(
      z.object({ csrf, clientId: uuid, allocationId: uuid, grant: z.boolean(), reason }),
      req,
    );
    return tenancy.sensitive(token(req), d.csrf, d.clientId, d.allocationId, d.grant, d.reason);
  }
}
@Controller('platform')
class PlatformController {
  @Get('overview') overview(@Req() req: Request) {
    return platform.overview(token(req));
  }
  @Get('admins') administrators(@Req() req: Request) {
    const d = z
      .object({
        search: z.string().max(120).default(''),
        page: z.coerce.number().int().min(1).max(100000).default(1),
        adminsPage: z.coerce.number().int().min(1).max(100000).default(1),
      })
      .parse(req.query);
    return platform.administrators(token(req), d.search, d.page, d.adminsPage);
  }
  @Get('audit') audit(@Req() req: Request) {
    const q = z
      .object({
        action: z.string().max(120).optional(),
        query: z.string().max(120).optional(),
        target: z.string().max(80).optional(),
        actor: z.string().max(120).optional(),
        from: z.string().max(10).optional(),
        to: z.string().max(10).optional(),
        page: z.coerce.number().int().min(1).max(100000).optional(),
      })
      .parse(req.query);
    return platform.history(token(req), q);
  }

  @Get('client-accounts') clientAccounts(@Req() req: Request) {
    const d = z
      .object({
        search: z.string().max(120).default(''),
        page: z.coerce.number().int().min(1).max(100000).default(1),
        view: z.enum(['all', 'admins']).default('all'),
      })
      .parse(req.query);
    return platform.clientAccounts(token(req), d.search, d.page, d.view);
  }
  @Post('client-accounts') clientAccount(@Req() req: Request) {
    const d = parse(
      z.object({
        csrf,
        clientId: uuid,
        userId: uuid,
        action: z.enum(['join', 'grant', 'revoke']),
        expectedVersion: z.number().int().positive(),
        reason,
      }),
      req,
    );
    return platform.clientRole(
      token(req),
      d.csrf,
      d.clientId,
      d.userId,
      d.action,
      d.expectedVersion,
      d.reason,
    );
  }
  @Get('clients') clients(@Req() req: Request) {
    const q = z
      .object({
        search: z.string().max(120).default(''),
        status: z.enum(['', 'active', 'suspended', 'inactive']).default(''),
        sort: z.enum(['asc', 'desc']).default('asc'),
        page: z.coerce.number().int().min(1).max(100000).default(1),
      })
      .parse(req.query);
    return platform.directory(token(req), q.search, q.page, q.status, q.sort);
  }
  @Post('clients') client(@Req() req: Request) {
    const d = parse(
      z.object({
        csrf,
        id: uuid.nullable(),
        name: z.string().min(1).max(160),
        version,
        reason,
        suspended: z.boolean().optional(),
      }),
      req,
    );
    return platform.client(token(req), d.csrf, d.id, d.name, d.version, d.reason, d.suspended);
  }
  @Post('admins/appoint') appoint(@Req() req: Request) {
    const d = parse(
      z.object({ csrf, userId: uuid, reason, expectedVersion: z.number().int().positive() }),
      req,
    );
    return platform.appoint(token(req), d.csrf, d.userId, d.reason, d.expectedVersion);
  }
  @Post('admins/revoke') revoke(@Req() req: Request) {
    const d = parse(z.object({ csrf, id: uuid, reason }), req);
    return platform.revoke(token(req), d.csrf, d.id, d.reason);
  }
}

const accounts = new Accounts(auth);
const accountDelivery = new AccountDelivery(accounts);
@Controller('accounts')
class AccountsController {
  @Get('manage') async manage(@Req() req: Request) {
    const q = z
      .object({
        clientId: uuid.optional(),
        page: z.coerce.number().int().min(1).max(100000).default(1),
        search: z.string().max(120).default(''),
      })
      .parse(req.query);
    return {
      ...(await accounts.manage(token(req), q.clientId ?? null, q.page, q.search)),
      accountMailAvailable: accountDelivery.available(),
    };
  }
  @Post('create') async create(@Req() req: Request) {
    const d = parse(
      z.object({
        csrf,
        clientId: uuid,
        name: z.string().max(120),
        email: z.email().max(200),
        password,
        reason,
        mode: z.enum(['new', 'existing']),
        synthetic: z.boolean(),
        sendEmail: z.boolean().default(false),
      }),
      req,
    );
    const result = await accounts.create(token(req), d.csrf, d);
    return {
      ...result,
      delivery: d.sendEmail ? await accountDelivery.send(token(req), d.csrf, result) : null,
    };
  }
  @Post('recover') async recover(@Req() req: Request) {
    const d = parse(
      z.object({
        csrf,
        userId: uuid,
        clientId: uuid.nullable(),
        purpose: z.enum(['setup', 'reset']),
        password,
        reason,
        sendEmail: z.boolean().default(false),
      }),
      req,
    );
    const result = await accounts.recover(token(req), d.csrf, d);
    return {
      ...result,
      delivery: d.sendEmail ? await accountDelivery.send(token(req), d.csrf, result) : null,
    };
  }
  @Post('cancel') cancel(@Req() req: Request) {
    const d = parse(z.object({ csrf, id: uuid, clientId: uuid.nullable(), password, reason }), req);
    return accounts.cancel(token(req), d.csrf, d.id, d.clientId, d.password, d.reason);
  }
  @Post('inspect') async inspect(@Req() req: Request) {
    await auth.limit('account-inspect:' + req.ip, 20);
    const d = parse(
      z.object({ csrf, raw: z.string().length(64), purpose: z.enum(['setup', 'reset', 'invite']) }),
      req,
    );
    return accounts.inspect(token(req), d.csrf, d.raw, d.purpose);
  }
  @Post('redeem') async redeem(@Req() req: Request) {
    await auth.limit('account-redeem:' + req.ip, 10);
    const d = parse(
      z.object({
        csrf,
        raw: z.string().length(64),
        purpose: z.enum(['setup', 'reset', 'invite']),
        password: password.optional(),
        confirmation: password.optional(),
        accept: z.boolean().optional(),
      }),
      req,
    );
    if (d.purpose === 'invite' && !d.accept)
      throw new DomainError(
        422,
        'accept_required',
        'Confirm that you accept this client invitation.',
      );
    return accounts.redeem(token(req), d.csrf, d.raw, d.purpose, d.password, d.confirmation);
  }
}

const branding = new Branding(auth);
@Controller('branding')
class BrandingController {
  @Get('current') current(@Req() req: Request) {
    return branding.current(token(req), req.query.shared === '1');
  }
  @Get() read(@Req() req: Request) {
    const d = z.object({ clientId: uuid.optional() }).parse(req.query);
    return branding.read(token(req), d.clientId ?? null);
  }
  @Get('logo') async logo(@Req() req: Request, @Res() res: Response) {
    const d = z.object({ clientId: uuid.optional() }).parse(req.query);
    res
      .set({
        'Content-Type': 'image/png',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(await branding.logo(token(req), d.clientId ?? null));
  }
  @Post() save(@Req() req: Request) {
    const d = parse(
      z.object({
        csrf,
        clientId: uuid.nullable(),
        version,
        displayName: z.string().min(1).max(120),
        appName: z.string().min(1).max(120),
        accent: z.string().regex(/^#[0-9a-f]{6}$/i),
        theme: z.string(),
        mode: z.enum(['cerebru', 'co-branded', 'white-label']),
        reason: z.string().max(2000).default(''),
        logo: z.string().max(2796204).optional(),
        removeLogo: z.boolean().optional(),
      }),
      req,
    );
    return branding.save(token(req), d.csrf, d.clientId, d);
  }
  @Post('preference') preference(@Req() req: Request) {
    const d = parse(z.object({ csrf, clientId: uuid, version, theme: z.string().nullable() }), req);
    return branding.preference(token(req), d.csrf, d.clientId, d.version, d.theme);
  }
}

const definitions = new AssessmentDefinitions(auth, await encryptionKey());
const assignments = new AssessmentAssignments(definitions);
const responses = new AssessmentResponses(assignments);
const reviews = new AssessmentReviews(responses);
const aiRegistry = new AiRegistry(assignments.enrolments);
const aiGateway = new AiGateway(aiRegistry, definitions.key);
const assessmentAnalysis = new AssessmentAnalysis(reviews, aiGateway);
const extractions = new DocumentExtractions(reviews);
const onboardingDocuments = new OnboardingDocuments(extractions);
@Controller('ai')
class AiController {
  @Get('settings') settings(@Req() req: Request) {
    return aiRegistry.settings(token(req), uuid.parse(req.query.clientId));
  }
  @Post('policy') policy(@Req() req: Request) {
    const d = parse(
      z.object({
        csrf,
        clientId: uuid,
        task: z.enum(AI_TASKS),
        expectedVersion: z.number().int().min(0),
        primary: z.string().min(1),
        fallback: z.string().min(1).nullable(),
      }),
      req,
    );
    return aiRegistry.save(
      token(req),
      d.csrf,
      d.clientId,
      d.task,
      d.expectedVersion,
      d.primary,
      d.fallback,
    );
  }
  @Post('runs/:id/reconcile') reconcile(@Req() req: Request, @Param('id') id: string) {
    const d = parse(
      z.object({
        csrf,
        clientId: uuid,
        total: z.number().int().nonnegative().safe(),
        reason: z.string().min(8).max(2000),
      }),
      req,
    );
    return aiGateway.reconcile(token(req), d.csrf, d.clientId, uuid.parse(id), d.total, d.reason);
  }
}

@Controller('assessments')
class AssessmentController {
  @Get('appeals') routingOptions(@Req() req: Request) {
    return reviews.routing(token(req), uuid.parse(req.query.clientId));
  }
  @Get('reviews/:id') reviewDetails(@Req() req: Request, @Param('id') id: string) {
    return reviews.read(token(req), uuid.parse(req.query.clientId), uuid.parse(id));
  }
  @Post('reviews/:id') reviewAction(@Req() req: Request, @Param('id') id: string) {
    const d = parse(
      z.object({
        csrf,
        clientId: uuid,
        expected_version: z.number().int().min(1),
        action: z.enum(['confirm', 'approve', 'reject', 'appeal', 'uphold', 'analysis', 'extract']),
        reason: z.string(),
        attempt: uuid.optional(),
        file: uuid.optional(),
        text: z.string().optional(),
        result: z.unknown().optional(),
        source: uuid.nullable().optional(),
        return_feedback: z.string().trim().min(8).max(4000).optional(),
      }),
      req,
    );
    if (d.action === 'extract')
      return extractions.requestAssessment(
        token(req),
        d.csrf,
        d.clientId,
        uuid.parse(id),
        uuid.parse(d.attempt),
        d.expected_version,
        uuid.parse(d.file),
      );
    if (d.action === 'analysis')
      return assessmentAnalysis.request(
        token(req),
        d.csrf,
        d.clientId,
        uuid.parse(id),
        uuid.parse(d.attempt),
        d.expected_version,
        d.reason,
      );
    if (d.action === 'appeal')
      return reviews.appeal(
        token(req),
        d.csrf,
        d.clientId,
        uuid.parse(id),
        d.expected_version,
        d.reason,
      );
    if (d.action === 'uphold')
      return reviews.uphold(
        token(req),
        d.csrf,
        d.clientId,
        uuid.parse(id),
        d.expected_version,
        d.reason,
      );
    if (d.action === 'confirm')
      return reviews.confirm(
        token(req),
        d.csrf,
        d.clientId,
        uuid.parse(id),
        uuid.parse(d.attempt),
        d.expected_version,
        uuid.parse(d.file),
        z.string().parse(d.text),
        d.reason,
      );
    return reviews.decide(
      token(req),
      d.csrf,
      d.clientId,
      uuid.parse(id),
      uuid.parse(d.attempt),
      d.expected_version,
      d.action === 'approve' ? 'approved' : 'rejected',
      d.reason,
      d.result,
      d.source ?? null,
      d.return_feedback ?? null,
    );
  }
  @Post('appeals/:id/route') routeAppeal(@Req() req: Request, @Param('id') id: string) {
    const d = parse(z.object({ csrf, clientId: uuid, reviewer: uuid, reason: z.string() }), req);
    return reviews.route(token(req), d.csrf, d.clientId, uuid.parse(id), d.reviewer, d.reason);
  }
  @Get('assignments/:id') response(@Req() req: Request, @Param('id') id: string) {
    return responses.read(token(req), uuid.parse(req.query.clientId), uuid.parse(id));
  }
  @Post('responses/:id') respond(@Req() req: Request, @Param('id') id: string) {
    const d = parse(
      z.object({
        csrf,
        clientId: uuid,
        expected_version: z.number().int().min(1),
        action: z.enum(['save', 'submit']),
      }),
      req,
    );
    return d.action === 'save'
      ? responses.save(token(req), d.csrf, d.clientId, uuid.parse(id), d.expected_version, req.body)
      : responses.submit(
          token(req),
          d.csrf,
          d.clientId,
          uuid.parse(id),
          d.expected_version,
          uuid.parse(req.body.idempotency_key),
        );
  }

  @Get('assignments') assigned(@Req() req: Request) {
    const d = z
      .object({ clientId: uuid, page: z.coerce.number().int().min(1).max(100000).default(1) })
      .parse(req.query);
    return assignments.list(token(req), d.clientId, d.page);
  }
  @Get('assignment-options') options(@Req() req: Request) {
    const d = z.object({ clientId: uuid, definition: uuid }).parse(req.query);
    return assignments.choices(token(req), d.clientId, d.definition);
  }
  @Post('assignments') assign(@Req() req: Request) {
    const d = parse(
      z.object({
        csrf,
        clientId: uuid,
        definition: uuid,
        mode: z.enum(['member', 'team']),
        target: uuid,
        confirmed: z.literal(true),
      }),
      req,
    );
    return assignments.create(token(req), d.csrf, d.clientId, d.definition, d.mode, d.target);
  }
  @Post('team-rules') rule(@Req() req: Request) {
    const d = parse(
      z.object({
        csrf,
        clientId: uuid,
        id: uuid,
        version,
        action: z.enum(['stop', 'resume', 'retry']),
      }),
      req,
    );
    return assignments.change(token(req), d.csrf, d.clientId, d.id, d.version, d.action);
  }

  @Post('builder') async builder(@Req() req: Request) {
    const data = parse(
      z.object({
        csrf,
        clientId: uuid,
        action: z.enum(['save', 'publish']),
        id: uuid.nullable(),
        expected_version: version,
        save_token: uuid.optional(),
        title: z.unknown().optional(),
        threshold: z.unknown().optional(),
        sections: z.unknown().optional(),
        questions: z.unknown().optional(),
        criteria: z.unknown().optional(),
        answer_key: z.unknown().optional(),
      }),
      req,
    );
    if (data.action === 'publish') {
      if (!data.id)
        throw new DomainError(422, 'definition_required', 'Save a draft before publishing.');
      return {
        ...(await definitions.publish(
          token(req),
          data.csrf,
          data.clientId,
          data.id,
          data.expected_version,
        )),
        status: 'published',
      };
    }
    const content = assessmentDraft({
      title: data.title,
      sections: data.sections,
      questions: data.questions,
      answer_key: data.answer_key,
      rubric: { threshold: data.threshold, criteria: data.criteria },
    });
    if (!data.save_token)
      throw new DomainError(422, 'save_token_required', 'A save reference is required.');
    return {
      ...(await definitions.save(
        token(req),
        data.csrf,
        data.clientId,
        content,
        data.id,
        data.expected_version,
        data.save_token,
      )),
      status: 'draft',
      readiness: assessmentReadiness(content),
    };
  }

  @Get('definitions') list(@Req() req: Request) {
    const d = z
      .object({
        clientId: uuid,
        id: uuid.optional(),
        page: z.coerce.number().int().min(1).max(100000).default(1),
      })
      .parse(req.query);
    return d.id
      ? definitions.get(token(req), d.clientId, d.id)
      : definitions.list(token(req), d.clientId, d.page);
  }
  @Post('definitions') save(@Req() req: Request) {
    const d = parse(
      z.object({
        csrf,
        clientId: uuid,
        source: uuid.nullable(),
        version,
        saveToken: uuid,
        content: z.unknown(),
      }),
      req,
    );
    return definitions.save(
      token(req),
      d.csrf,
      d.clientId,
      d.content,
      d.source,
      d.version,
      d.saveToken,
    );
  }
  @Post('publish') publish(@Req() req: Request) {
    const d = parse(z.object({ csrf, clientId: uuid, id: uuid, version }), req);
    return definitions.publish(token(req), d.csrf, d.clientId, d.id, d.version);
  }
}

const assessmentMedia = new AssessmentMedia(definitions);
@Controller('assessments/media')
class AssessmentMediaController {
  @Post()
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 2, fieldSize: 128 },
    }),
  )
  upload(@Req() req: Request, @UploadedFile() file?: { buffer: Buffer; originalname: string }) {
    const d = parse(z.object({ csrf, clientId: uuid }), req);
    if (!file) throw new DomainError(422, 'image_required', 'Choose an image to upload.');
    return assessmentMedia.upload(token(req), d.csrf, d.clientId, file.buffer, file.originalname);
  }
  @Get(':id/status') status(@Req() req: Request, @Param('id') id: string) {
    return assessmentMedia.status(token(req), uuid.parse(id));
  }
  @Post(':id/retry') retry(@Req() req: Request, @Param('id') id: string) {
    const d = parse(z.object({ csrf }), req);
    return assessmentMedia.retry(token(req), d.csrf, uuid.parse(id));
  }
  @Get(':id') async download(@Req() req: Request, @Param('id') id: string, @Res() res: Response) {
    const bytes = await assessmentMedia.download(token(req), uuid.parse(id));
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(bytes);
  }
}

const enrolments = new Enrolments(auth);
const foundationChecks = new FoundationChecks(enrolments);
const onboarding = new Onboarding(enrolments, definitions.key);
const learningPlans = new LearningPlans(onboarding);
const programmeGeneration = new ProgrammeGeneration(learningPlans, aiGateway);
const evidence = new EvidenceFiles(enrolments, undefined, undefined, definitions.key);
const delivery = new Delivery(learningPlans, evidence);
const learningGrading = new LearningGrading(delivery, aiGateway);
const learningLifecycle = new LearningLifecycle(delivery);
const learningKpis = new LearningKpis(delivery);
const learningSupport = new LearningSupport(delivery, aiGateway);
const learningNotices = new LearningNotices(delivery.enrolments);
@Controller('notifications')
class NotificationsController {
  @Get() read(@Req() req: Request) {
    return learningNotices.read(
      token(req),
      uuid.parse(req.query.clientId),
      z.coerce
        .number()
        .int()
        .min(1)
        .max(100000)
        .parse(req.query.page ?? 1),
    );
  }
  @Post() preference(@Req() req: Request) {
    const d = parse(z.object({ csrf, trainingEmail: z.boolean() }), req);
    return learningNotices.preference(token(req), d.csrf, d.trainingEmail);
  }
}
@Controller('enrolments')
class EnrolmentsController {
  @Get('learning-reviews') learningQueue(@Req() req: Request) {
    return learningGrading.queue(
      token(req),
      uuid.parse(req.query.clientId),
      z.coerce.number().int().min(1).max(100000).default(1).parse(req.query.page),
    );
  }
  @Get('learning-appeals') learningAppeals(@Req() req: Request) {
    return learningGrading.routing(token(req), uuid.parse(req.query.clientId));
  }
  @Post('learning-appeals/:appealId/route') learningRoute(
    @Req() req: Request,
    @Param('appealId') appealId: string,
  ) {
    const d = parse(z.object({ csrf, clientId: uuid, reviewerId: uuid, reason: z.string() }), req);
    return learningGrading.route(
      token(req),
      d.csrf,
      d.clientId,
      uuid.parse(appealId),
      d.reviewerId,
      d.reason,
    );
  }

  @Post(':id/submissions/:submissionId/grade') async learningRequest(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('submissionId') submissionId: string,
  ) {
    const d = parse(
      z.object({ csrf, clientId: uuid, version: z.number().int().positive(), reason: z.string() }),
      req,
    );
    await learningGrading.read(token(req), d.clientId, uuid.parse(submissionId), uuid.parse(id));
    return learningGrading.request(
      token(req),
      d.csrf,
      d.clientId,
      uuid.parse(submissionId),
      d.version,
      d.reason,
    );
  }

  @Post(':id/submissions/:submissionId/manual') async learningManual(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('submissionId') submissionId: string,
  ) {
    const d = parse(
      z.object({
        csrf,
        clientId: uuid,
        version: z.number().int().positive(),
        reason: z.string(),
        outcome: z.enum(['approved', 'changes_requested']),
        result: z.unknown(),
      }),
      req,
    );
    await learningGrading.read(token(req), d.clientId, uuid.parse(submissionId), uuid.parse(id));
    return learningGrading.manual(
      token(req),
      d.csrf,
      d.clientId,
      uuid.parse(submissionId),
      d.version,
      d.outcome,
      d.reason,
      d.result,
    );
  }

  @Post(':id/submissions/:submissionId/decide') async learningDecide(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('submissionId') submissionId: string,
  ) {
    const d = parse(
      z.object({
        csrf,
        clientId: uuid,
        version: z.number().int().positive(),
        reason: z.string(),
        gradeId: uuid,
        outcome: z.enum(['approved', 'changes_requested']),
      }),
      req,
    );
    await learningGrading.read(token(req), d.clientId, uuid.parse(submissionId), uuid.parse(id));
    return learningGrading.decide(
      token(req),
      d.csrf,
      d.clientId,
      uuid.parse(submissionId),
      d.gradeId,
      d.version,
      d.outcome,
      d.reason,
    );
  }

  @Post(':id/submissions/:submissionId/appeal') async learningAppeal(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('submissionId') submissionId: string,
  ) {
    const d = parse(
      z.object({ csrf, clientId: uuid, version: z.number().int().positive(), reason: z.string() }),
      req,
    );
    await learningGrading.read(token(req), d.clientId, uuid.parse(submissionId), uuid.parse(id));
    return learningGrading.appeal(
      token(req),
      d.csrf,
      d.clientId,
      uuid.parse(submissionId),
      d.version,
      d.reason,
    );
  }

  @Post(':id/submissions/:submissionId/uphold') async learningUphold(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('submissionId') submissionId: string,
  ) {
    const d = parse(
      z.object({ csrf, clientId: uuid, version: z.number().int().positive(), reason: z.string() }),
      req,
    );
    await learningGrading.read(token(req), d.clientId, uuid.parse(submissionId), uuid.parse(id));
    return learningGrading.uphold(
      token(req),
      d.csrf,
      d.clientId,
      uuid.parse(submissionId),
      d.version,
      d.reason,
    );
  }

  @Get(':id/support') supportRead(@Req() req: Request, @Param('id') id: string) {
    return learningSupport.read(token(req), uuid.parse(req.query.clientId), uuid.parse(id));
  }
  @Post(':id/support') supportChange(@Req() req: Request, @Param('id') id: string) {
    const d = parse(
      z.discriminatedUnion('action', [
        z.object({
          action: z.literal('propose'),
          csrf,
          clientId: uuid,
          evidenceBlock: z.number().int().min(1).max(12),
          reason: z.string(),
        }),
        z.object({ action: z.literal('suggest'), csrf, clientId: uuid }),
        z.object({
          action: z.literal('approve'),
          csrf,
          clientId: uuid,
          proposalId: uuid,
          baseId: uuid,
          reason: z.string(),
        }),
      ]),
      req,
    );
    const recordId = uuid.parse(id);
    switch (d.action) {
      case 'propose':
        return learningSupport.propose(
          token(req),
          d.csrf,
          d.clientId,
          recordId,
          d.evidenceBlock,
          d.reason,
        );
      case 'suggest':
        return learningSupport.suggest(token(req), d.csrf, d.clientId, recordId);
      case 'approve':
        return learningSupport.approve(
          token(req),
          d.csrf,
          d.clientId,
          recordId,
          d.proposalId,
          d.baseId,
          d.reason,
        );
    }
  }

  @Get(':id/progress') progressRead(@Req() req: Request, @Param('id') id: string) {
    return learningKpis.read(token(req), uuid.parse(req.query.clientId), uuid.parse(id));
  }
  @Post(':id/progress') progressChange(@Req() req: Request, @Param('id') id: string) {
    const d = parse(
      z.discriminatedUnion('action', [
        z.object({
          action: z.literal('revise'),
          csrf,
          clientId: uuid,
          metricId: uuid,
          definition: z.unknown(),
          effective: z.string(),
          reason: z.string(),
        }),
        z.object({
          action: z.literal('observe'),
          csrf,
          clientId: uuid,
          metricId: uuid,
          value: z.number(),
          evidence: z.string(),
          reason: z.string(),
        }),
        z.object({ action: z.literal('snapshot'), csrf, clientId: uuid, metricId: uuid }),
      ]),
      req,
    );
    const recordId = uuid.parse(id);
    switch (d.action) {
      case 'revise':
        return learningKpis.revise(
          token(req),
          d.csrf,
          d.clientId,
          recordId,
          d.metricId,
          d.definition,
          d.effective,
          d.reason,
        );
      case 'observe':
        return learningKpis.observe(
          token(req),
          d.csrf,
          d.clientId,
          recordId,
          d.metricId,
          d.value,
          d.evidence,
          d.reason,
        );
      case 'snapshot':
        return learningKpis.refresh(token(req), d.csrf, d.clientId, recordId, d.metricId);
    }
  }

  @Get(':id/lifecycle') lifecycleRead(@Req() req: Request, @Param('id') id: string) {
    return learningLifecycle.read(token(req), uuid.parse(req.query.clientId), uuid.parse(id));
  }
  @Post(':id/lifecycle') lifecycleChange(@Req() req: Request, @Param('id') id: string) {
    const d = parse(
      z.discriminatedUnion('action', [
        z.object({
          action: z.literal('pause'),
          csrf,
          clientId: uuid,
          version: z.number().int().positive(),
          reason: z.string(),
        }),
        z.object({
          action: z.literal('preview'),
          csrf,
          clientId: uuid,
          version: z.number().int().positive(),
          reason: z.string(),
          weeks: z.number().int().min(0).max(52),
        }),
        z.object({ action: z.literal('resume'), csrf, clientId: uuid, changeId: uuid }),
        z.object({
          action: z.literal('complete'),
          csrf,
          clientId: uuid,
          version: z.number().int().positive(),
          reason: z.string(),
        }),
      ]),
      req,
    );
    const recordId = uuid.parse(id);
    switch (d.action) {
      case 'pause':
        return learningLifecycle.pause(
          token(req),
          d.csrf,
          d.clientId,
          recordId,
          d.version,
          d.reason,
        );
      case 'preview':
        return learningLifecycle.preview(
          token(req),
          d.csrf,
          d.clientId,
          recordId,
          d.version,
          d.weeks,
          d.reason,
        );
      case 'resume':
        return learningLifecycle.resume(token(req), d.csrf, d.clientId, recordId, d.changeId);
      case 'complete':
        return learningLifecycle.complete(
          token(req),
          d.csrf,
          d.clientId,
          recordId,
          d.version,
          d.reason,
        );
    }
  }

  @Get(':id/delivery') deliveryRead(@Req() req: Request, @Param('id') id: string) {
    return delivery.read(token(req), uuid.parse(req.query.clientId), uuid.parse(id));
  }
  @Post(':id/delivery/activate') activate(@Req() req: Request, @Param('id') id: string) {
    const d = parse(
      z.object({ csrf, clientId: uuid, version: z.number().int().positive(), reason: z.string() }),
      req,
    );
    return delivery.activate(token(req), d.csrf, d.clientId, uuid.parse(id), d.version, d.reason);
  }
  @Get(':id/delivery/:blockId/lessons/:index') lesson(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('blockId') blockId: string,
    @Param('index') index: string,
  ) {
    return delivery.lesson(
      token(req),
      uuid.parse(req.query.clientId),
      uuid.parse(id),
      uuid.parse(blockId),
      z.coerce.number().int().min(0).parse(index),
    );
  }
  @Post(':id/delivery/:blockId/early-start') earlyStart(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('blockId') blockId: string,
  ) {
    const d = parse(z.object({ csrf, clientId: uuid, reason: z.string() }), req);
    return delivery.earlyStart(
      token(req),
      d.csrf,
      d.clientId,
      uuid.parse(id),
      uuid.parse(blockId),
      d.reason,
    );
  }
  @Post(':id/delivery/:blockId/lessons/:index/draft') lessonSave(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('blockId') blockId: string,
    @Param('index') index: string,
  ) {
    const d = parse(
      z.object({ csrf, clientId: uuid, version: z.number().int().min(0), data: z.unknown() }),
      req,
    );
    return delivery.save(
      token(req),
      d.csrf,
      d.clientId,
      uuid.parse(id),
      uuid.parse(blockId),
      z.coerce.number().int().min(0).parse(index),
      d.version,
      d.data,
    );
  }
  @Post(':id/delivery/:blockId/lessons/:index/quiz') lessonQuiz(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('blockId') blockId: string,
    @Param('index') index: string,
  ) {
    const d = parse(
      z.object({ csrf, clientId: uuid, reason: z.string(), questions: z.unknown() }),
      req,
    );
    return delivery.publishQuiz(
      token(req),
      d.csrf,
      d.clientId,
      uuid.parse(id),
      uuid.parse(blockId),
      z.coerce.number().int().min(0).parse(index),
      d.questions,
      d.reason,
    );
  }
  @Post(':id/delivery/:blockId/lessons/:index/submit') lessonSubmit(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('blockId') blockId: string,
    @Param('index') index: string,
  ) {
    const d = parse(
      z.object({ csrf, clientId: uuid, version: z.number().int().positive(), key: uuid }),
      req,
    );
    return delivery.submit(
      token(req),
      d.csrf,
      d.clientId,
      uuid.parse(id),
      uuid.parse(blockId),
      z.coerce.number().int().min(0).parse(index),
      d.version,
      d.key,
    );
  }
  @Get(':id/submissions/:submissionId') submissionRead(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('submissionId') submissionId: string,
  ) {
    return learningGrading.read(
      token(req),
      uuid.parse(req.query.clientId),
      uuid.parse(submissionId),
      uuid.parse(id),
    );
  }
  @Post(':id/submissions/:submissionId/withdraw') submissionWithdraw(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('submissionId') submissionId: string,
  ) {
    const d = parse(
      z.object({ csrf, clientId: uuid, version: z.number().int().positive(), reason: z.string() }),
      req,
    );
    return delivery.withdraw(
      token(req),
      d.csrf,
      d.clientId,
      uuid.parse(id),
      uuid.parse(submissionId),
      d.version,
      d.reason,
    );
  }

  @Get(':id/plan/generation/:runId') generationRun(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('runId') runId: string,
  ) {
    return programmeGeneration.read(
      token(req),
      uuid.parse(req.query.clientId),
      uuid.parse(id),
      uuid.parse(runId),
    );
  }
  @Get(':id/plan/generation') generationRead(@Req() req: Request, @Param('id') id: string) {
    return programmeGeneration.read(token(req), uuid.parse(req.query.clientId), uuid.parse(id));
  }
  @Post(':id/plan/generation') generationRequest(@Req() req: Request, @Param('id') id: string) {
    const d = parse(
      z.object({
        csrf,
        clientId: uuid,
        version: z.number().int().positive(),
        key: z.string().min(1).max(80),
        feedback: z.string().max(4000).default(''),
      }),
      req,
    );
    return programmeGeneration.request(
      token(req),
      d.csrf,
      d.clientId,
      uuid.parse(id),
      d.version,
      d.key,
      d.feedback,
    );
  }

  @Get(':id/plan') planRead(@Req() req: Request, @Param('id') id: string) {
    const d = z
      .object({ clientId: uuid, version: z.coerce.number().int().positive().optional() })
      .parse(req.query);
    return learningPlans.read(token(req), d.clientId, uuid.parse(id), d.version);
  }
  @Post(':id/plan/create') planCreate(@Req() req: Request, @Param('id') id: string) {
    const d = parse(
      z.object({
        csrf,
        clientId: uuid,
        version: z.number().int().min(0),
        onboardingVersion: z.number().int().positive(),
        reason: z.string(),
      }),
      req,
    );
    return learningPlans.create(
      token(req),
      d.csrf,
      d.clientId,
      uuid.parse(id),
      d.version,
      d.onboardingVersion,
      d.reason,
    );
  }
  @Post(':id/plan/edit') planEdit(@Req() req: Request, @Param('id') id: string) {
    const d = parse(
      z.object({
        csrf,
        clientId: uuid,
        version: z.number().int().positive(),
        block: z.number().int().min(0),
        data: z.record(z.string(), z.unknown()),
        reason: z.string(),
      }),
      req,
    );
    return learningPlans.edit(
      token(req),
      d.csrf,
      d.clientId,
      uuid.parse(id),
      d.version,
      d.block,
      d.data,
      d.reason,
    );
  }
  @Post(':id/plan/review') planReview(@Req() req: Request, @Param('id') id: string) {
    const d = parse(
      z.object({
        csrf,
        clientId: uuid,
        version: z.number().int().positive(),
        approve: z.boolean(),
        reason: z.string().default(''),
      }),
      req,
    );
    return learningPlans.review(
      token(req),
      d.csrf,
      d.clientId,
      uuid.parse(id),
      d.version,
      d.approve,
      d.reason,
    );
  }

  @Get(':id/documents/:fileId') documentRead(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
  ) {
    return onboardingDocuments.read(
      token(req),
      uuid.parse(req.query.clientId),
      uuid.parse(id),
      uuid.parse(fileId),
    );
  }
  @Post(':id/documents/:fileId') documentRequest(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
  ) {
    const d = parse(z.object({ csrf, clientId: uuid }), req);
    return onboardingDocuments.request(
      token(req),
      d.csrf,
      d.clientId,
      uuid.parse(id),
      uuid.parse(fileId),
    );
  }
  @Post(':id/document-reviews/:runId') documentReview(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('runId') runId: string,
  ) {
    const d = parse(
      z.object({
        csrf,
        clientId: uuid,
        data: z.record(z.string(), z.unknown()),
        version: z.number().int().positive(),
        onboardingVersion: z.number().int().min(0),
        confirm: z.boolean(),
      }),
      req,
    );
    return onboardingDocuments.review(
      token(req),
      d.csrf,
      d.clientId,
      uuid.parse(id),
      uuid.parse(runId),
      d.data,
      d.version,
      d.onboardingVersion,
      d.confirm,
    );
  }

  @Get(':id/onboarding') onboardingRead(@Req() req: Request, @Param('id') id: string) {
    return onboarding.read(token(req), uuid.parse(req.query.clientId), uuid.parse(id));
  }
  @Post(':id/onboarding') onboardingSave(@Req() req: Request, @Param('id') id: string) {
    const d = parse(
      z.object({
        csrf,
        clientId: uuid,
        step: z.enum(['profile', 'capability', 'assessment', 'schedule', 'measures', 'resources']),
        data: z.record(z.string(), z.unknown()),
        version: z.number().int().min(0),
        confirm: z.boolean().default(false),
      }),
      req,
    );
    return onboarding.save(
      token(req),
      d.csrf,
      d.clientId,
      uuid.parse(id),
      d.step,
      d.data,
      d.version,
      d.confirm,
    );
  }
  @Post(':id/calendar') calendar(@Req() req: Request, @Param('id') id: string) {
    const d = parse(
      z.object({
        csrf,
        clientId: uuid,
        version: z.number().int().min(0),
        onboardingVersion: z.number().int().positive(),
        reason: z.string(),
      }),
      req,
    );
    return onboarding.confirmCalendar(
      token(req),
      d.csrf,
      d.clientId,
      uuid.parse(id),
      d.version,
      d.onboardingVersion,
      d.reason,
    );
  }

  @Get(':id/files') files(@Req() req: Request, @Param('id') id: string) {
    return evidence.list(token(req), uuid.parse(req.query.clientId), uuid.parse(id));
  }
  @Post(':id/files')
  @UseInterceptors(
    FileInterceptor('evidence', {
      limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 3, fieldSize: 128 },
    }),
  )
  upload(
    @Req() req: Request,
    @Param('id') id: string,
    @UploadedFile() file?: { buffer: Buffer; originalname: string },
  ) {
    const d = parse(
      z.object({
        csrf,
        clientId: uuid,
        purpose: z.enum(['assessment', 'evidence']).default('assessment'),
      }),
      req,
    );
    if (!file) throw new DomainError(422, 'file_required', 'Choose a file to upload.');
    return evidence.upload(
      token(req),
      d.csrf,
      d.clientId,
      uuid.parse(id),
      file.buffer,
      file.originalname,
      d.purpose,
    );
  }

  @Get() list(@Req() req: Request) {
    const d = z
      .object({
        clientId: uuid,
        search: z.string().max(120).default(''),
        page: z.coerce.number().int().min(1).max(100000).default(1),
      })
      .parse(req.query);
    return enrolments.list(token(req), d.clientId, d.search, d.page, req.query.view === 'overview');
  }
  @Get('choices') choices(@Req() req: Request) {
    return enrolments.choices(token(req), uuid.parse(req.query.clientId));
  }
  @Get(':id') detail(@Req() req: Request, @Param('id') id: string) {
    return enrolments.detail(token(req), uuid.parse(req.query.clientId), uuid.parse(id));
  }
  @Post(':id/check') check(@Req() req: Request, @Param('id') id: string) {
    const d = parse(
      z.object({
        csrf,
        clientId: uuid,
        version: z.number().int().positive(),
        key: z.string().min(8).max(128),
      }),
      req,
    );
    return foundationChecks.request(token(req), d.csrf, d.clientId, uuid.parse(id), d);
  }

  @Post() create(@Req() req: Request) {
    const d = parse(
      z.object({
        csrf,
        clientId: uuid,
        memberId: uuid,
        coordinatorId: uuid,
        groupId: uuid.nullable(),
        title: z.string(),
        reason: z.string(),
      }),
      req,
    );
    return enrolments.create(token(req), d.csrf, d.clientId, d);
  }
}

@Controller('jobs')
class FoundationChecksController {
  @Get() list(@Req() req: Request) {
    return foundationChecks.list(token(req), uuid.parse(req.query.clientId));
  }
  @Get(':id') async status(@Req() req: Request, @Param('id') id: string) {
    return (
      await foundationChecks.list(token(req), uuid.parse(req.query.clientId), uuid.parse(id))
    )[0];
  }
}

@Controller('files')
class EvidenceController {
  @Get(':id') async download(@Req() req: Request, @Param('id') id: string, @Res() res: Response) {
    const file = await evidence.download(token(req), uuid.parse(id));
    res.attachment(file.name);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(file.bytes);
  }
}

const promotions = new Promotions(auth, await encryptionKey());
@Controller('promotions')
class PromotionsController {
  @Get() list(@Req() req: Request) {
    const data = z
      .object({ clientId: z.uuid(), page: z.coerce.number().int().min(1).max(100000).default(1) })
      .parse(req.query);
    return promotions.list(token(req), data.clientId, data.page);
  }
  @Post('prepare') prepare(@Req() req: Request) {
    const data = parse(
      z.object({ csrf, clientId: z.uuid(), userId: z.uuid(), key: z.uuid(), reason: z.string() }),
      req,
    );
    return promotions.request(token(req), data.csrf, data.clientId, data);
  }
  @Post(':id/dispatch') dispatch(@Req() req: Request, @Param('id') id: string) {
    const data = parse(
      z.object({ csrf, clientId: z.uuid(), reconcile: z.boolean(), reason: z.string() }),
      req,
    );
    return promotions.queue(token(req), data.csrf, data.clientId, id, data.reconcile, data.reason);
  }
  @Post('history') history(@Req() req: Request) {
    const data = parse(
      z.object({ csrf, clientId: z.uuid(), userId: z.uuid(), reason: z.string() }),
      req,
    );
    return promotions.history(token(req), data.csrf, data.clientId, data.userId, data.reason);
  }
}
const delegatedIdentity = new MockIdentity(await encryptionKey());
const approvedFeed = new ApprovedFeed();
@Controller('v1')
class DelegatedController {
  private async read(req: Request, scope: string, memberId?: string, changes = false) {
    await auth.limit('delegated:' + (req.ip ?? 'unknown'), 60);
    const bearer = req.headers.authorization?.match(/^Bearer ([^ ]+)$/i)?.[1] ?? '';
    return db.transaction(async (sql) => {
      const actor = await delegatedIdentity.verify(sql, bearer, scope);
      const client = z.uuid().parse(req.headers['x-client-id']);
      if (changes) {
        const query = z
          .object({
            after: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
            limit: z.coerce.number().int().min(1).max(100).default(50),
          })
          .parse(req.query);
        return approvedFeed.read(sql, actor, client, query.after, query.limit);
      }
      return approvedFeed.summary(sql, actor, client, memberId);
    });
  }
  @Get('me/training') self(@Req() req: Request) {
    return this.read(req, 'training.self.read');
  }
  @Get('members/:memberId/summary') member(@Req() req: Request, @Param('memberId') member: string) {
    return this.read(req, 'training.member.read', member);
  }
  @Get('training/changes') changes(@Req() req: Request) {
    return this.read(req, 'training.changes.read', undefined, true);
  }
}

@Module({
  controllers: [
    DelegatedController,
    PromotionsController,
    HealthController,
    AuthController,
    ClientsController,
    PlatformController,
    AccountsController,
    BrandingController,
    AiController,
    AssessmentController,
    AssessmentMediaController,
    EnrolmentsController,
    NotificationsController,
    EvidenceController,
    FoundationChecksController,
  ],
})
class ApiModule {}
const app = await NestFactory.create<NestExpressApplication>(ApiModule, {
  logger: ['error', 'warn'],
});
app.useBodyParser('json', { limit: '3mb' });
app.use(helmet({ frameguard: { action: 'deny' } }));
app.use(cookieParser());
app.useGlobalFilters(new Errors());
const requestLimits = new RequestLimits(auth);
app.useGlobalGuards({
  async canActivate(context) {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    try {
      await requestLimits.enforce(token(req), req.method, String(req.route.path), req.body);
      return true;
    } catch (error) {
      if (error instanceof DomainError && error.status === 429)
        http.getResponse<Response>().setHeader('Retry-After', '60');
      throw error;
    }
  },
});
app.use((req: Request, res: Response, next: () => void) => {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Request-ID', randomUUID());
  if (
    localProduction &&
    !localProductionRequest({
      address: req.socket.remoteAddress,
      host: req.headers.host,
      forwardedHost: req.headers['x-forwarded-host']?.toString(),
      forwardedFor: req.headers['x-forwarded-for']?.toString(),
    })
  ) {
    res.status(403).json({
      code: 'local_production_only',
      message: 'This workspace is available only on the configured local computer.',
    });
    return;
  }

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
await app.listen(
  port('API_PORT', 3101),
  localProduction ? '127.0.0.1' : (process.env.API_HOST ?? '127.0.0.1'),
);
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
