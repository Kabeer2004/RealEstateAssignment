import { z } from 'zod';

export const addressSchema = z.object({
  addresses: z.string().min(10, 'At least one valid address is required.'),
  geoType: z.enum(['tract', 'zip', 'county']).default('tract').optional(),
});
