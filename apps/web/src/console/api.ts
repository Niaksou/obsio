import {
  consoleAuditEntrySchema,
  consoleClientDetailSchema,
  consoleClientSchema,
  consoleSessionSchema,
  consoleUsageSchema,
  type ConsoleClientCreate,
  type Licence,
} from '@obsio/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, request } from '../api.js';

export const consoleApi = {
  session: () => request(consoleSessionSchema, 'GET', '/api/console/session'),
  clients: () => request(z.array(consoleClientSchema), 'GET', '/api/console/clients'),
  audit: () => request(z.array(consoleAuditEntrySchema), 'GET', '/api/console/audit'),
  client: (id: string) => request(consoleClientDetailSchema, 'GET', `/api/console/clients/${id}`),
  usage: (days: number) => request(consoleUsageSchema, 'GET', `/api/console/usage?days=${days}`),
  createClient: (body: ConsoleClientCreate) =>
    request(z.object({ id: z.uuid() }), 'POST', '/api/console/clients', body),
  saveLicence: (id: string, licence: Licence) =>
    request(z.null(), 'PUT', `/api/console/clients/${id}/licence`, licence),
};

export const consoleKeys = {
  session: ['console', 'session'] as const,
  clients: ['console', 'clients'] as const,
  audit: ['console', 'audit'] as const,
  usage: (days: number) => ['console', 'usage', String(days)] as const,
  client: (id: string) => ['console', 'client', id] as const,
};

/** Console reverrouillée côté serveur (15 minutes sans activité). */
export const isLocked = (error: unknown) =>
  error instanceof ApiError && error.code === 'CONSOLE_LOCKED';

export function useConsoleSession() {
  return useQuery({ queryKey: consoleKeys.session, queryFn: consoleApi.session });
}

/** Requête de la console : un reverrouillage renvoie à l'écran de déverrouillage. */
function useConsoleQuery<T>(
  queryKey: readonly string[],
  queryFn: () => Promise<T>,
  enabled = true,
) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey,
    queryFn: async () => {
      try {
        const data = await queryFn();
        // La requête a prolongé le déverrouillage : l'échéance affichée suit.
        void queryClient.invalidateQueries({ queryKey: consoleKeys.session });
        return data;
      } catch (error) {
        if (isLocked(error)) void queryClient.invalidateQueries({ queryKey: consoleKeys.session });
        throw error;
      }
    },
    retry: (count, error) => !isLocked(error) && count < 2,
    enabled,
  });
}

export const useClients = (enabled = true) =>
  useConsoleQuery(consoleKeys.clients, consoleApi.clients, enabled);
export const useUsage = (days: number) =>
  useConsoleQuery(consoleKeys.usage(days), () => consoleApi.usage(days));
export const useClientDetail = (id: string) =>
  useConsoleQuery(consoleKeys.client(id), () => consoleApi.client(id));
export const useAudit = () => useConsoleQuery(consoleKeys.audit, consoleApi.audit);

function useConsoleMutation<V, R>(fn: (variables: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['console'] }),
    onError: (error) => {
      if (isLocked(error)) void queryClient.invalidateQueries({ queryKey: consoleKeys.session });
    },
  });
}

export const useCreateClient = () => useConsoleMutation(consoleApi.createClient);
export const useSaveLicence = () =>
  useConsoleMutation(({ id, licence }: { id: string; licence: Licence }) =>
    consoleApi.saveLicence(id, licence),
  );
