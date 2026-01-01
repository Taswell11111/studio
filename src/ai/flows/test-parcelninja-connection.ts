
'use server';
/**
 * @fileOverview A Genkit flow to test the API connection to Parcelninja for all configured stores.
 * This flow executes synchronously and returns the full result, as streaming is causing build issues with ai.defineFlow types.
 */
import { config } from 'dotenv';
config();

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { format } from 'date-fns';
import { STORES } from '@/lib/stores';

const TestResultSchema = z.object({
  storeName: z.string(),
  success: z.boolean(),
  error: z.string().optional(),
});

const ConnectionTestOutputSchema = z.object({
  results: z.array(TestResultSchema),
  logs: z.array(z.string()),
  error: z.string().optional(),
});

// --- GENKIT FLOW ---

export const testParcelninjaConnectionFlow = ai.defineFlow(
  {
    name: 'testParcelninjaConnectionFlow',
    outputSchema: ConnectionTestOutputSchema,
  },
  async () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const startDate = format(yesterday, 'yyyyMMdd');
    const endDate = format(today, 'yyyyMMdd');

    const logs: string[] = [];
    const results: any[] = [];

    const logWithTimestamp = (message: string) => {
      const timestamp = new Date().toLocaleTimeString();
      return `${timestamp} - ${message}`;
    };

    for (const creds of STORES) {
      logs.push(logWithTimestamp(`[Connection Test] Testing store: ${creds.name}`));

      if (!creds.apiKey || !creds.apiSecret) {
        const errorMsg = 'Missing API Key or Secret in store configuration.';
        logs.push(logWithTimestamp(`[Connection Test] ❌ ${creds.name}: FAILED - ${errorMsg}`));
        results.push({ storeName: creds.name, success: false, error: errorMsg });
        continue;
      }

      const url = `https://storeapi.parcelninja.com/api/v1/outbounds/?startDate=${startDate}&endDate=${endDate}&pageSize=1`;
      const basicAuth = Buffer.from(`${creds.apiKey}:${creds.apiSecret}`).toString('base64');

      logs.push(logWithTimestamp(`[Connection Test] ➡️ ${creds.name}: Requesting URL: ${url}`));

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: { Authorization: `Basic ${basicAuth}` },
        });

        logs.push(logWithTimestamp(`[Connection Test] ⬅️ ${creds.name}: Received status ${response.status}`));

        if (response.ok) {
          logs.push(logWithTimestamp(`[Connection Test] ✅ ${creds.name}: SUCCESS`));
          results.push({ storeName: creds.name, success: true });
        } else {
          let errorMessage = `API returned status ${response.status}.`;
          if (response.status === 401) {
            errorMessage = 'Authentication failed. Please check API credentials.';
          } else {
            try {
              const errorBody = await response.text();
              errorMessage += ` Body: ${errorBody.substring(0, 150)}`;
            } catch (e) {}
          }
          logs.push(logWithTimestamp(`[Connection Test] ❌ ${creds.name}: FAILED - ${errorMessage}`));
          results.push({ storeName: creds.name, success: false, error: errorMessage });
        }
      } catch (err: any) {
        const networkError = err.message || 'A network error occurred.';
        logs.push(logWithTimestamp(`[Connection Test] ❌ ${creds.name}: FAILED - ${networkError}`));
        results.push({ storeName: creds.name, success: false, error: networkError });
      }
    }

    return { results, logs };
  }
);

// Helper for calling directly if needed (bypassing Genkit flow for server actions if flow invocation is tricky)
export async function testParcelninjaConnection() {
     return await testParcelninjaConnectionFlow();
}
