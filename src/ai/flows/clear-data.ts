'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { initializeFirebaseOnServer } from '@/firebase/server-init';

const BATCH_SIZE = 100;

const ClearDataOutputSchema = z.object({
  success: z.boolean(),
  recordsDeleted: z.number(),
  message: z.string(),
});
export type ClearDataOutput = z.infer<typeof ClearDataOutputSchema>;

export async function clearShipmentData(): Promise<ClearDataOutput> {
  return clearShipmentDataFlow({});
}

const clearShipmentDataFlow = ai.defineFlow(
  {
    name: 'clearShipmentDataFlow',
    inputSchema: z.object({}), // No input needed for clearing all data
    outputSchema: ClearDataOutputSchema,
  },
  async () => {
    try {
      const { firestore } = initializeFirebaseOnServer();
      const appId = process.env.NEXT_PUBLIC_APP_ID || 'default-app-id';
      const shipmentsColRef = firestore.collection(`artifacts/${appId}/public/data/shipments`);

      let recordsDeleted = 0;
      let hasMore = true;

      while (hasMore) {
        const snapshot = await shipmentsColRef.limit(BATCH_SIZE).get();

        if (snapshot.empty) {
          hasMore = false;
          break;
        }

        const batch = firestore.batch();
        snapshot.docs.forEach((doc) => {
          batch.delete(doc.ref);
          recordsDeleted++;
        });

        await batch.commit();
      }

      return {
        success: true,
        recordsDeleted,
        message: `Successfully deleted ${recordsDeleted} records.`,
      };

    } catch (error: any) {
      console.error('Error in clearShipmentDataFlow:', error);
      return {
        success: false,
        recordsDeleted: 0,
        message: error.message || 'An unexpected error occurred during data clear.',
      };
    }
  }
);
