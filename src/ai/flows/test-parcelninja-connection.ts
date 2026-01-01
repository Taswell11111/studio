
'use server';
/**
 * @fileOverview A Genkit flow to test the API connection to Parcelninja for all configured stores.
 * This flow now STREAMS results back to the client.
 */
import { config } from 'dotenv';
config();

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { format } from 'date-fns';
import { STORES } from '@/lib/stores';
import { ConnectionTestStreamChunkSchema } from '@/types';


// --- GENKIT FLOW ---

export const testParcelninjaConnectionFlow = ai.defineFlow(
  {
    name: 'testParcelninjaConnectionFlow',
    outputSchema: ConnectionTestStreamChunkSchema, // Each chunk validates against this
  },
  async function* () {
    // The flow itself is an async generator.
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const startDate = format(yesterday, 'yyyyMMdd');
    const endDate = format(today, 'yyyyMMdd');

    const logWithTimestamp = (message: string) => {
      const timestamp = new Date().toLocaleTimeString();
      return `${timestamp} - ${message}`;
    };

    for (const creds of STORES) {
      const startLog = logWithTimestamp(
        `[Connection Test] Testing store: ${creds.name}`
      );
      yield { log: startLog }; // Stream the log message

      if (!creds.apiKey || !creds.apiSecret) {
        const errorMsg = 'Missing API Key or Secret in store configuration.';
        const failureLog = logWithTimestamp(
          `[Connection Test] ❌ ${creds.name}: FAILED - ${errorMsg}`
        );
        yield { log: failureLog }; // Stream the log
        yield {
          result: { storeName: creds.name, success: false, error: errorMsg },
        }; // Stream the final result for this store
        continue;
      }

      const url = `https://storeapi.parcelninja.com/api/v1/outbounds/?startDate=${startDate}&endDate=${endDate}&pageSize=1`;
      const basicAuth = Buffer.from(
        `${creds.apiKey}:${creds.apiSecret}`
      ).toString('base64');

      const requestLog = logWithTimestamp(
        `[Connection Test] ➡️ ${creds.name}: Requesting URL: ${url}`
      );
      yield { log: requestLog };

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: { Authorization: `Basic ${basicAuth}` },
        });

        const responseLog = logWithTimestamp(
          `[Connection Test] ⬅️ ${creds.name}: Received status ${response.status}`
        );
        yield { log: responseLog };

        if (response.ok) {
          const successLog = logWithTimestamp(
            `[Connection Test] ✅ ${creds.name}: SUCCESS`
          );
          yield { log: successLog };
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
          const failureLog = logWithTimestamp(
            `[Connection Test] ❌ ${creds.name}: FAILED - ${errorMessage}`
          );
          yield { log: failureLog };
          yield {
            result: {
              storeName: creds.name,
              success: false,
              error: errorMessage,
            },
          };
        }
      } catch (err: any) {
        const networkError = err.message || 'A network error occurred.';
        const errorLog = logWithTimestamp(
          `[Connection Test] ❌ ${creds.name}: FAILED - ${networkError}`
        );
        yield { log: errorLog };
        yield {
          result: {
            storeName: creds.name,
            success: false,
            error: networkError,
          },
        };
      }
    }
  }
);
