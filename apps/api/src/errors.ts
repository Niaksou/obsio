import { STATUS_CODES } from 'node:http';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { logSecurityEvent } from './security-log.js';

/**
 * Erreurs non prévues par les routes : le détail (message SQL, pile) reste dans le journal, le
 * navigateur ne reçoit qu'un message générique (ASVS 16.5.1). Les erreurs 4xx (validation,
 * limitation de débit) gardent leur message, qui décrit la requête et non le serveur.
 */
export function handleError(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
  if (status >= 500) {
    request.log.error({ err: error }, 'Erreur interne');
    return reply.code(status).send({
      statusCode: status,
      error: STATUS_CODES[status],
      message: 'Erreur interne du serveur. Réessayez plus tard.',
    });
  }
  if (error.validation) {
    // Champs refusés, sans leur valeur : une tentative de contournement se repère à la répétition.
    logSecurityEvent(request, 'validation-refusee', { statut: status, detail: error.message });
  }
  return reply
    .code(status)
    .send({ statusCode: status, error: STATUS_CODES[status], message: error.message });
}
