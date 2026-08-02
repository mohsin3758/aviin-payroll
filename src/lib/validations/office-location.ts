import { z } from "zod";

export const createOfficeLocationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  radiusMeters: z.coerce.number().int().min(1).max(50000).default(200),
});

export const editOfficeLocationSchema = createOfficeLocationSchema.partial();
