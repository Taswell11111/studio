
'use server';
/**
 * @fileOverview A Genkit flow to test the API connection to Parcelninja for all configured stores.
 * This flow now streams its logs and results back to the caller.
 */
import { config } from 'dotenv';
config();

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { format } from 'date-fns';
import { getStores } from '@/lib/stores';

const TestResultSchema = z.object({
  storeName: z.string(),
  success: z.boolean(),
  error: z.string().optional(),
});

const ConnectionTestStreamChunkSchema = z.object({
  log: z.string().optional(),
  result: TestResultSchema.optional(),
  error: z.string().optional(),
});


// --- GENKIT FLOW ---

export const testParcelninjaConnectionFlow = ai.defineFlow(
  {
    name: 'testParcelninjaConnectionFlow',
    outputSchema: ConnectionTestStreamChunkSchema,
    stream: true, // Enable streaming output
  },
  async function* () {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const startDate = format(yesterday, 'yyyyMMdd');
    const endDate = format(today, 'yyyyMMdd');

    const logWithTimestamp = (message: string) => {
      const timestamp = new Date().toLocaleTimeString();
      return `${timestamp} - ${message}`;
    };

    // Use getStores() to ensure we have the latest config
    const stores = getStores();

    for (const creds of stores) {
      const logMsg = logWithTimestamp(`[Connection Test] Testing store: ${creds.name}`);
      yield { log: logMsg };

      if (!creds.apiKey || !creds.apiSecret) {
        const errorMsg = 'Missing API Key or Secret in store configuration.';
        yield { log: logWithTimestamp(`[Connection Test] ❌ ${creds.name}: FAILED - ${errorMsg}`) };
        yield { result: { storeName: creds.name, success: false, error: errorMsg } };
        continue;
      }

      const url = `https://storeapi.parcelninja.com/api/v1/outbounds/?startDate=${startDate}&endDate=${endDate}&pageSize=1`;
      const basicAuth = Buffer.from(`${creds.apiKey}:${creds.apiSecret}`).toString('base64');

      yield { log: logWithTimestamp(`[Connection Test] ➡️ ${creds.name}: Requesting URL: ${url}`) };

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: { Authorization: `Basic ${basicAuth}` },
        });

        yield { log: logWithTimestamp(`[Connection Test] ⬅️ ${creds.name}: Received status ${response.status}`) };

        if (response.ok) {
           yield { result: { storeName: creds.name, success: true } };
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
          yield { result: { storeName: creds.name, success: false, error: errorMessage } };
        }
      } catch (err: any) {
        const networkError = err.message || 'A network error occurred.';
        yield { result: { storeName: creds.name, success: false, error: networkError } };
      }
    }
  }
);
