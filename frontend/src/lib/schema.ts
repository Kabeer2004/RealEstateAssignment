import { z } from 'zod';

export const addressSchema = z.object({
  addresses: z.string().min(1, { message: 'Please enter at least one address.' }).max(1000),
  geoType: z.enum(['tract', 'zip', 'county']),
});
