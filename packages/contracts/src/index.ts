export type Environment = 'test' | 'production';
export type Scope = { actorId: string; organisationId: string; environment: Environment };
export type Health = { status: 'ok'; service: 'api' | 'worker'; database: 'postgresql' | 'pglite' };
export type Problem = { status: number; code: string; message: string; requestId: string };
