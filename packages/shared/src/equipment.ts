import { z } from 'zod';

/** Types d'équipement placés sur les plans. « machine » porte le nom propre à l'entreprise. */
export const EQUIPMENT_TYPES = [
  'tgbt',
  'td',
  'coffret',
  'armoire',
  'eclairage_securite',
  'prise_courant',
  'luminaire',
  'transformateur',
  'onduleur',
  'borne_recharge',
  'machine',
  'autre',
] as const;

export const equipmentTypeSchema = z.enum(EQUIPMENT_TYPES);
export type EquipmentType = z.infer<typeof equipmentTypeSchema>;

/** Libellés affichés dans l'interface. */
export const EQUIPMENT_TYPE_LABELS: Record<EquipmentType, string> = {
  tgbt: 'TGBT',
  td: 'Tableau divisionnaire (TD)',
  coffret: 'Coffret',
  armoire: 'Armoire',
  eclairage_securite: 'Éclairage de sécurité',
  prise_courant: 'Prise de courant',
  luminaire: 'Luminaire',
  transformateur: 'Transformateur',
  onduleur: 'Onduleur',
  borne_recharge: 'Borne de recharge',
  machine: 'Machine',
  autre: 'Autre',
};
