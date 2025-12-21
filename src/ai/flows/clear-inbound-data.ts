'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { initializeFirebaseOnServer } from '@/firebase/server-init';
import { ClearInboundDataOutputSchema, type ClearInboundDataOutput } from '@/types';

const BATCH_SIZE = 100;

export async function clearInboundData(): Promise<ClearInboundDataOutput> {
  return clearInboundDataFlow({});
}

const clearInboundDataFlow = ai.defineFlow(
  {
    name: 'clearInboundDataFlow',
    inputSchema: z.object({}), // No input needed
    outputSchema: ClearInboundDataOutputSchema,
  },
  async () => {
    try {
      const { firestore } = initializeFirebaseOnServer();
      const appId = process.env.NEXT_PUBLIC_APP_ID || 'default-app-id';
      const inboundsColRef = firestore.collection(`artifacts/${appId}/public/data/inbounds`);

      let recordsDeleted = 0;
      let hasMore = true;

      while (hasMore) {
        const snapshot = await inboundsColRef.limit(BATCH_SIZE).get();

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
        message: `Successfully deleted ${recordsDeleted} inbound records.`,
      };

    } catch (error: any) {
      console.error('Error in clearInboundDataFlow:', error);
      return {
        success: false,
        recordsDeleted: 0,
        message: error.message || 'An unexpected error occurred during inbound data clear.',
      };
    }
  }
);
