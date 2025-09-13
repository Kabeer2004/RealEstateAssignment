import { z } from 'zod';

export const addressSchema = z.object({
  addresses: z.array(
    z.object({
      value: z.string().min(1, { message: 'Address cannot be empty.' }),
    })
  ).min(1, { message: 'Please enter at least one address.' }),
  geoType: z.enum(['tract', 'county']),
});
