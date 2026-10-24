import type { FastifyPluginAsync } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import type { Auth } from './auth.js';

/** Transmet les requêtes /api/auth/* au gestionnaire de Better Auth. */
export const authRoutes: FastifyPluginAsync<{ auth: Auth; apiUrl: string }> = async (
  app,
  { auth, apiUrl },
) => {
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const hasBody = request.body !== undefined && request.body !== null;
      const response = await auth.handler(
        new Request(new URL(request.url, apiUrl), {
          method: request.method,
          headers: fromNodeHeaders(request.headers),
          body: hasBody ? JSON.stringify(request.body) : undefined,
        }),
      );

      reply.status(response.status);
      response.headers.forEach((value, key) => {
        if (key !== 'set-cookie') reply.header(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) reply.header('set-cookie', cookies);
      return reply.send(response.body ? await response.text() : null);
    },
  });
};
