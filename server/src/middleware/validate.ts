import type { Request } from 'express';
import { ZodError, type TypeOf, type ZodTypeAny } from 'zod';
import { AppError } from '../utils/errors.js';

/**
 * Validation helpers.
 *
 * Every request body, query string and param that carries user input goes
 * through one of these. Failures become a VALIDATION_ERROR with per-field
 * detail so the client can point at the offending input.
 */

function toDetails(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_';
    (details[key] ??= []).push(issue.message);
  }

  return details;
}

/**
 * Generic over the schema rather than its output type, so schemas that
 * transform their input (query-string booleans, coerced numbers) keep their
 * parsed output type instead of being forced to match what came in.
 */
function parse<S extends ZodTypeAny>(schema: S, value: unknown, label: string): TypeOf<S> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw AppError.validation(`Invalid ${label}.`, toDetails(result.error));
}

export function parseBody<S extends ZodTypeAny>(req: Request, schema: S): TypeOf<S> {
  return parse(schema, req.body, 'request body');
}

export function parseQuery<S extends ZodTypeAny>(req: Request, schema: S): TypeOf<S> {
  return parse(schema, req.query, 'query parameters');
}

export function parseParams<S extends ZodTypeAny>(req: Request, schema: S): TypeOf<S> {
  return parse(schema, req.params, 'path parameters');
}
