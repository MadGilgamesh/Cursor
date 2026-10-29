import { ERROR_CODES, type ErrorCode } from '@game/shared';
import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

/** Błąd domenowy z kodem z kontraktu API — bezpieczny do pokazania klientowi. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((_request, reply) => {
    void reply
      .status(404)
      .send({ error: { code: ERROR_CODES.notFound, message: 'Nie znaleziono zasobu' } });
  });

  app.setErrorHandler((error: FastifyError | AppError | ZodError, request, reply) => {
    if (error instanceof AppError) {
      return reply
        .status(error.statusCode)
        .send({ error: { code: error.code, message: error.message } });
    }
    if (error instanceof ZodError) {
      const first = error.issues[0];
      const field = first?.path.join('.') ?? '';
      return reply.status(400).send({
        error: {
          code: ERROR_CODES.validation,
          message: first ? `${field ? `${field}: ` : ''}${first.message}` : 'Niepoprawne dane',
        },
      });
    }
    if (error.statusCode === 429) {
      return reply.status(429).send({
        error: { code: ERROR_CODES.rateLimited, message: 'Zbyt wiele prób. Odczekaj chwilę.' },
      });
    }
    if (error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500) {
      return reply
        .status(error.statusCode)
        .send({ error: { code: ERROR_CODES.validation, message: error.message } });
    }
    request.log.error({ err: error }, 'Nieobsłużony błąd');
    return reply
      .status(500)
      .send({ error: { code: ERROR_CODES.internal, message: 'Wewnętrzny błąd serwera' } });
  });
}
