import {
  assignmentCreatedSchema,
  buildingSchema,
  contractorSchema,
  equipmentSchema,
  floorDetailSchema,
  floorSchema,
  invitationDetailsSchema,
  myReserveSchema,
  planUploadResponseSchema,
  presignedPostSchema,
  interventionSchema,
  reportImportDetailSchema,
  reportImportSchema,
  reserveDetailSchema,
  reserveListItemSchema,
  siteDashboardSchema,
  siteEquipmentSchema,
  siteSchema,
  type AssignmentInput,
  type BuildingInput,
  type CollaboratorAssignmentInput,
  type ContractorInput,
  type DraftUpdate,
  type EquipmentInput,
  type EquipmentUpdate,
  type FloorInput,
  type PlanConfirm,
  type PlanUploadRequest,
  type PresignedPost,
  type ProofDossierQuery,
  type ProofInput,
  type ReserveFilters,
  type ReserveUpdate,
  type SiteInput,
  inspectionSchema,
  type InspectionKind,
  type UpdateInspection,
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

/** Filtres en paramètres d'URL, sans les valeurs vides. */
function queryString(params: Record<string, string | undefined>) {
  const entries = Object.entries(params).filter((entry): entry is [string, string] => !!entry[1]);
  return entries.length ? `?${new URLSearchParams(entries)}` : '';
}

const meSchema = z.object({
  user: z.object({ id: z.uuid(), name: z.string(), email: z.string() }),
  organisation: z.object({ id: z.uuid(), name: z.string(), role: memberRoleSchema }).nullable(),
});

export const api = {
  me: () => request(meSchema, 'GET', '/api/me'),
  invitation: (id: string) => request(invitationDetailsSchema, 'GET', `/api/invitations/${id}`),

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
  setPlanScale: (floorId: string, scale: number | null) =>
    request(floorSchema, 'PUT', `/api/floors/${floorId}/plan/scale`, { scale }),

  equipment: (floorId: string) =>
    request(z.array(equipmentSchema), 'GET', `/api/floors/${floorId}/equipment`),
  createEquipment: (floorId: string, input: EquipmentInput) =>
    request(equipmentSchema, 'POST', `/api/floors/${floorId}/equipment`, input),
  updateEquipment: (id: string, input: EquipmentUpdate) =>
    request(equipmentSchema, 'PATCH', `/api/equipment/${id}`, input),

  siteEquipment: (siteId: string) =>
    request(z.array(siteEquipmentSchema), 'GET', `/api/sites/${siteId}/equipment`),

  imports: (siteId: string) =>
    request(z.array(reportImportSchema), 'GET', `/api/sites/${siteId}/imports`),
  importDetail: (id: string) => request(reportImportDetailSchema, 'GET', `/api/imports/${id}`),
  reportUpload: (siteId: string, input: { fileName: string; size: number }) =>
    request(presignedPostSchema, 'POST', `/api/sites/${siteId}/imports/upload`, input),
  createImport: (siteId: string, input: { key: string; fileName: string }) =>
    request(reportImportSchema, 'POST', `/api/sites/${siteId}/imports`, input),
  retryImport: (id: string) => request(reportImportSchema, 'POST', `/api/imports/${id}/retry`),
  updateDraft: (id: string, input: DraftUpdate) =>
    request(z.null(), 'PATCH', `/api/drafts/${id}`, input),
  validateImport: (id: string) =>
    request(reportImportSchema, 'POST', `/api/imports/${id}/validate`),

  reserves: (siteId: string, filters: ReserveFilters = {}) =>
    request(
      z.array(reserveListItemSchema),
      'GET',
      `/api/sites/${siteId}/reserves${queryString(filters)}`,
    ),
  reserve: (id: string) => request(reserveDetailSchema, 'GET', `/api/reserves/${id}`),
  updateReserve: (id: string, input: ReserveUpdate) =>
    request(z.null(), 'PATCH', `/api/reserves/${id}`, input),
  comment: (id: string, text: string) =>
    request(z.null(), 'POST', `/api/reserves/${id}/comments`, { text }),
  reservePhotoUpload: (id: string, input: { contentType: string; size: number }) =>
    request(presignedPostSchema, 'POST', `/api/reserves/${id}/photos`, input),
  addProof: (id: string, input: ProofInput) =>
    request(z.null(), 'POST', `/api/reserves/${id}/proofs`, input),
  review: (id: string, input: { decision: 'lever' | 'refuser'; comment: string | null }) =>
    request(z.null(), 'POST', `/api/reserves/${id}/review`, input),

  dashboard: (siteId: string) =>
    request(siteDashboardSchema, 'GET', `/api/sites/${siteId}/dashboard`),
  inspections: () => request(z.array(inspectionSchema), 'GET', '/api/inspections'),
  siteInspections: (siteId: string) =>
    request(z.array(inspectionSchema), 'GET', `/api/sites/${siteId}/inspections`),
  updateInspection: (siteId: string, kind: InspectionKind, input: UpdateInspection) =>
    request(inspectionSchema, 'PUT', `/api/sites/${siteId}/inspections/${kind}`, input),

  contractors: () => request(z.array(contractorSchema), 'GET', '/api/contractors'),
  createContractor: (input: ContractorInput) =>
    request(contractorSchema, 'POST', '/api/contractors', input),
  updateContractor: (id: string, input: Partial<ContractorInput>) =>
    request(contractorSchema, 'PATCH', `/api/contractors/${id}`, input),
  createAssignment: (input: AssignmentInput) =>
    request(assignmentCreatedSchema, 'POST', '/api/assignments', input),
  revokeAssignment: (id: string) => request(z.null(), 'POST', `/api/assignments/${id}/revoke`),
  assignCollaborators: (input: CollaboratorAssignmentInput) =>
    request(z.null(), 'POST', '/api/collaborator-assignments', input),
  removeCollaborator: (reserveId: string, userId: string) =>
    request(z.null(), 'POST', `/api/reserves/${reserveId}/collaborators/${userId}/remove`),
  myReserves: () => request(z.array(myReserveSchema), 'GET', '/api/me/reserves'),

  intervention: (token: string) => request(interventionSchema, 'GET', `/api/intervention/${token}`),
  interventionPhotoUpload: (
    token: string,
    input: { reserveId: string; contentType: string; size: number },
  ) => request(presignedPostSchema, 'POST', `/api/intervention/${token}/photos`, input),
  interventionProof: (token: string, reserveId: string, input: ProofInput) =>
    request(z.null(), 'POST', `/api/intervention/${token}/reserves/${reserveId}/proofs`, input),

  archive: (kind: 'sites' | 'buildings' | 'floors' | 'equipment', id: string) =>
    request(z.null(), 'POST', `/api/${kind}/${id}/archive`),
};

/** Télécharge le dossier de preuves en PDF (la session passe par le cookie, d'où fetch). */
export async function downloadProofDossier(siteId: string, query: ProofDossierQuery) {
  const response = await fetch(
    `${BASE_URL}/api/sites/${siteId}/proof-dossier${queryString({ ...query })}`,
    { credentials: 'include' },
  );
  if (!response.ok) {
    // Quota atteint : le message de l'API donne le délai d'attente.
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(
      response.status,
      (response.status === 429 && payload?.message) || 'Le dossier n’a pas pu être généré.',
    );
  }
  const name =
    response.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ??
    'dossier-preuves.pdf';
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

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
