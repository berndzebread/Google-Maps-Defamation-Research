import { z } from 'zod';

export const CountrySchema = z.enum(['DE', 'AT']);
export type Country = z.infer<typeof CountrySchema>;

export const PlaceTypeSchema = z.enum([
  'Restaurant',
  'Café',
  'Bar',
  'Arzt',
  'Zahnarzt',
  'Anwalt',
  'Friseur',
  'Hotel',
  'Apotheke',
  'Werkstatt',
  'Shop',
  'Custom'
]);
export type PlaceType = z.infer<typeof PlaceTypeSchema>;

export const ConfigSchema = z.object({
  country: CountrySchema,
  postalCode: z.string().min(2).max(50),
  placeType: PlaceTypeSchema,
  customType: z.string().optional(),
  maxResults: z.number().int().positive().optional(),
  headless: z.boolean().optional(),
  discoveryOnly: z.boolean().optional(),
  resumeFolder: z.string().optional(),
  delayMin: z.number().int().min(1).optional(),
  delayMax: z.number().int().min(1).optional(),
  windowPos: z.string().optional(),
  windowSize: z.string().optional(),
  pinWindow: z.boolean().optional(),
  noOverlay: z.boolean().optional(),
  noNotify: z.boolean().optional(),
  noSound: z.boolean().optional(),
});
export type Config = z.infer<typeof ConfigSchema>;

export const PlaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().url(),
  status: z.enum(['success', 'error', 'skipped', 'captcha']),
  error: z.string().nullable(),
  readAt: z.date().nullable(),
  hasDefamationNotice: z.boolean(),
  rating: z.number().nullable(),
  totalReviews: z.number().int().nullable(),
  removedMin: z.number().int().nullable(),
  removedMax: z.number().int().nullable(),
  removedText: z.string().nullable(),
});
export type Place = z.infer<typeof PlaceSchema>;

export const DiscoveryResultSchema = z.object({
  timestamp: z.date(),
  config: ConfigSchema,
  places: z.array(PlaceSchema),
});
export type DiscoveryResult = z.infer<typeof DiscoveryResultSchema>;

export const ScrapingResultSchema = z.object({
  timestamp: z.date(),
  config: ConfigSchema,
  discoveryPath: z.string(),
  places: z.array(PlaceSchema),
  totalProcessed: z.number().int(),
  totalWithNotice: z.number().int(),
  lastProcessedIndex: z.number().int(),
});
export type ScrapingResult = z.infer<typeof ScrapingResultSchema>;
