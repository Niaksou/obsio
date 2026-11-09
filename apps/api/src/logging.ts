import type { FastifyRequest } from 'fastify';

// Les jetons portés par l'URL ne doivent pas finir dans les journaux (ASVS 14.2.1, 16.2.5) :
// lien intervenant, réinitialisation du mot de passe, vérification de l'adresse e-mail.
const TOKEN_IN_PATH = /^(\/api\/intervention\/|\/api\/auth\/reset-password\/)[^/?#]+/;
const TOKEN_IN_QUERY = /([?&](?:token|code)=)[^&#]*/gi;
const MASK = '[masqué]';

export function redactUrl(url: string): string {
  return url.replace(TOKEN_IN_PATH, `$1${MASK}`).replace(TOKEN_IN_QUERY, `$1${MASK}`);
}

/** Requête telle que journalisée par Fastify, l'URL sans ses jetons. */
export const logSerializers = {
  req(request: FastifyRequest) {
    return {
      method: request.method,
      url: redactUrl(request.url),
      host: request.host,
      remoteAddress: request.ip,
      remotePort: request.socket?.remotePort,
    };
  },
};

export function loggerOptions(nodeEnv: 'development' | 'test' | 'production') {
  if (nodeEnv === 'test') return false;
  if (nodeEnv === 'development') {
    return {
      serializers: logSerializers,
      transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } },
    };
  }
  return { serializers: logSerializers };
}
