import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { captureError } from "../lib/sentry.js";

/** Single error envelope (`API`). Never contains a stack trace. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

export function toErrorBody(
  code: string,
  message: string,
  requestId: string
): ApiErrorBody {
  return { error: { code, message, requestId } };
}

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const status =
    typeof error.statusCode === "number" && error.statusCode >= 400
      ? error.statusCode
      : 500;

  if (status >= 500) {
    request.log.error({ err: error, requestId: request.id }, "unhandled request error");
    captureError(error);
  }

  const code = status >= 500 ? "INTERNAL_ERROR" : error.code ?? "BAD_REQUEST";
  const message =
    status >= 500 ? "Internal Server Error" : error.message;

  void reply.status(status).send(toErrorBody(code, message, request.id));
}

export function notFoundHandler(
  request: FastifyRequest,
  reply: FastifyReply
): void {
  void reply.status(404).send(toErrorBody("NOT_FOUND", "Route not found", request.id));
}
