import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

export class PanelError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PanelError';
  }
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((_request, reply) => {
    void reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Nie znaleziono zasobu' } });
  });

  app.setErrorHandler((error: FastifyError | PanelError | ZodError, request, reply) => {
    if (error instanceof PanelError) {
      return reply
        .status(error.statusCode)
        .send({ error: { code: error.code, message: error.message } });
    }
    if (error instanceof ZodError) {
      const first = error.issues[0];
      const field = first?.path.join('.') ?? '';
      return reply.status(400).send({
        error: {
          code: 'VALIDATION',
          message: first ? `${field ? `${field}: ` : ''}${first.message}` : 'Niepoprawne dane',
        },
      });
    }
    if (error.statusCode === 429) {
      return reply.status(429).send({
        error: { code: 'RATE_LIMITED', message: 'Zbyt wiele prób. Odczekaj chwilę.' },
      });
    }
    if (error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500) {
      return reply
        .status(error.statusCode)
        .send({ error: { code: 'VALIDATION', message: error.message } });
    }
    request.log.error({ err: error }, 'Nieobsłużony błąd Kancelarii');
    return reply
      .status(500)
      .send({ error: { code: 'INTERNAL', message: 'Wewnętrzny błąd Kancelarii' } });
  });
}
