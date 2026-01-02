
'use server';
import { config } from 'dotenv';
config();

/**
 * @fileOverview A Genkit flow to fetch all shipment and inbound records from Firestore.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseOnServer } from '@/firebase/server-init';
import { z } from 'zod';
import { ShipmentRecordSchema, type ShipmentRecord } from '@/types';

// --- INPUT/OUTPUT SCHEMAS ---

const GetAllRecordsOutputSchema = z.object({
  records: z.array(ShipmentRecordSchema),
  error: z.string().optional(),
});
type GetAllRecordsOutput = z.infer<typeof GetAllRecordsOutputSchema>;

export async function getAllRecords(): Promise<GetAllRecordsOutput> {
  return getAllRecordsFlow();
}

// --- THE GENKIT FLOW ---

const getAllRecordsFlow = ai.defineFlow(
  {
    name: 'getAllRecordsFlow',
    outputSchema: GetAllRecordsOutputSchema,
  },
  async () => {
    try {
      const { firestore } = initializeFirebaseOnServer();
      const appId = process.env.NEXT_PUBLIC_APP_ID || 'default-app-id';

      const shipmentsRef = firestore.collection(`artifacts/${appId}/public/data/shipments`);
      const inboundsRef = firestore.collection(`artifacts/${appId}/public/data/inbounds`);

      const [shipmentsSnapshot, inboundsSnapshot] = await Promise.all([
        shipmentsRef.get(),
        inboundsRef.get(),
      ]);

      const records: ShipmentRecord[] = [];
      shipmentsSnapshot.forEach(doc => records.push({ id: doc.id, ...doc.data() } as ShipmentRecord));
      inboundsSnapshot.forEach(doc => records.push({ id: doc.id, ...doc.data() } as ShipmentRecord));
      
      console.log(`Fetched ${records.length} total records from Firestore.`);

      return { records };

    } catch (e: any) {
      console.error('Failed to fetch all records from Firestore:', e);
      return {
        records: [],
        error: e.message || 'An unexpected error occurred while fetching records.',
      };
    }
  }
);
