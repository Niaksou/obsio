import {
  buildingSchema,
  equipmentSchema,
  floorDetailSchema,
  floorSchema,
  planUploadResponseSchema,
  siteSchema,
  type BuildingInput,
  type EquipmentInput,
  type EquipmentUpdate,
  type FloorInput,
  type PlanConfirm,
  type PlanUploadRequest,
  type PresignedPost,
  type SiteInput,
} from '@obsio/shared';
import { memberRoleSchema } from '@obsio/shared';
import { z } from 'zod';

const BASE_URL = import.meta.env.VITE_API_URL;

export class ApiError extends Error {
  override name = 'ApiError';

  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Appel à l'API avec le cookie de session ; la réponse est validée par le schéma partagé. */
async function request<T>(
  schema: z.ZodType<T>,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    credentials: 'include',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(response.status, payload?.message ?? 'Une erreur est survenue. Réessayez.');
  }
  return schema.parse(response.status === 204 ? null : await response.json());
}

const meSchema = z.object({
  user: z.object({ id: z.uuid(), name: z.string(), email: z.string() }),
  organisation: z.object({ id: z.uuid(), name: z.string(), role: memberRoleSchema }).nullable(),
});

export const api = {
  me: () => request(meSchema, 'GET', '/api/me'),

  sites: () => request(z.array(siteSchema), 'GET', '/api/sites'),
  site: (id: string) => request(siteSchema, 'GET', `/api/sites/${id}`),
  createSite: (input: SiteInput) => request(siteSchema, 'POST', '/api/sites', input),
  updateSite: (id: string, input: Partial<SiteInput>) =>
    request(siteSchema, 'PATCH', `/api/sites/${id}`, input),

  buildings: (siteId: string) =>
    request(z.array(buildingSchema), 'GET', `/api/sites/${siteId}/buildings`),
  createBuilding: (siteId: string, input: BuildingInput) =>
    request(buildingSchema, 'POST', `/api/sites/${siteId}/buildings`, input),
  updateBuilding: (id: string, input: Partial<BuildingInput>) =>
    request(buildingSchema, 'PATCH', `/api/buildings/${id}`, input),

  floors: (buildingId: string) =>
    request(z.array(floorSchema), 'GET', `/api/buildings/${buildingId}/floors`),
  floor: (id: string) => request(floorDetailSchema, 'GET', `/api/floors/${id}`),
  createFloor: (buildingId: string, input: FloorInput) =>
    request(floorSchema, 'POST', `/api/buildings/${buildingId}/floors`, input),
  updateFloor: (id: string, input: Partial<FloorInput>) =>
    request(floorSchema, 'PATCH', `/api/floors/${id}`, input),

  planUploads: (floorId: string, input: PlanUploadRequest) =>
    request(planUploadResponseSchema, 'POST', `/api/floors/${floorId}/plan/uploads`, input),
  confirmPlan: (floorId: string, input: PlanConfirm) =>
    request(floorSchema, 'PUT', `/api/floors/${floorId}/plan`, input),

  equipment: (floorId: string) =>
    request(z.array(equipmentSchema), 'GET', `/api/floors/${floorId}/equipment`),
  createEquipment: (floorId: string, input: EquipmentInput) =>
    request(equipmentSchema, 'POST', `/api/floors/${floorId}/equipment`, input),
  updateEquipment: (id: string, input: EquipmentUpdate) =>
    request(equipmentSchema, 'PATCH', `/api/equipment/${id}`, input),

  archive: (kind: 'sites' | 'buildings' | 'floors' | 'equipment', id: string) =>
    request(z.null(), 'POST', `/api/${kind}/${id}/archive`),
};

/** Envoie un fichier au stockage avec le formulaire signé fourni par l'API. */
export async function uploadToStorage(post: PresignedPost, file: Blob): Promise<void> {
  const form = new FormData();
  for (const [name, value] of Object.entries(post.fields)) form.append(name, value);
  form.append('file', file);
  const response = await fetch(post.url, { method: 'POST', body: form });
  if (!response.ok) throw new ApiError(response.status, "L'envoi du fichier a échoué. Réessayez.");
}

/** Rôle dans l'organisation active : seul l'admin modifie sites, plans et équipements. */
export function isAdmin(me: Awaited<ReturnType<typeof api.me>> | undefined) {
  return me?.organisation?.role === 'admin';
}
