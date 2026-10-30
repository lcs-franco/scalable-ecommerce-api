import type { FastifyError, FastifyInstance } from 'fastify'
import { ZodError } from 'zod'
import { CommonErrorCode } from './ErrorCode.js'
import { ApplicationError } from './errors/ApplicationError.js'
import { HttpError } from './errors/HttpError.js'

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: CommonErrorCode.VALIDATION,
        message: error.message,
      })
    }

    if (error instanceof ApplicationError || error instanceof HttpError) {
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
      })
    }

    const statusCode = error.statusCode ?? 500

    if (statusCode < 500) {
      return reply.status(statusCode).send({
        error: error.message,
        message: error.message,
      })
    }

    app.log.error(error)

    return reply.status(500).send({
      error: CommonErrorCode.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    })
  })
}
