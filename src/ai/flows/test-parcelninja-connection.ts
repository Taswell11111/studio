
'use server';
/**
 * @fileOverview A Genkit flow to test the API connection to Parcelninja for all configured stores.
 */
import { config } from 'dotenv';
config();

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { format } from 'date-fns';
import { STORES } from '@/lib/stores';

// --- SCHEMAS ---

const ConnectionTestResultSchema = z.object({
  storeName: z.string(),
  success: z.boolean(),
  error: z.string().optional(),
});
type ConnectionTestResult = z.infer<typeof ConnectionTestResultSchema>;

const TestConnectionOutputSchema = z.object({
  results: z.array(ConnectionTestResultSchema),
  logs: z.array(z.string()),
  error: z.string().optional(), // Added optional error field to top-level output
});
export type TestConnectionOutput = z.infer<typeof TestConnectionOutputSchema>;


// --- Exported Function ---

export async function testParcelninjaConnection(): Promise<TestConnectionOutput> {
  return testParcelninjaConnectionFlow();
}


// --- GENKIT FLOW ---

const testParcelninjaConnectionFlow = ai.defineFlow(
  {
    name: 'testParcelninjaConnectionFlow',
    outputSchema: TestConnectionOutputSchema,
  },
  async () => {
    
    const testResults: ConnectionTestResult[] = [];
    const logs: string[] = [];
    
    // Define a 1-day date range for the test query.
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const startDate = format(yesterday, 'yyyyMMdd');
    const endDate = format(today, 'yyyyMMdd');

    const logWithTimestamp = (message: string) => {
        const timestamp = new Date().toLocaleTimeString();
        logs.push(`${timestamp} - ${message}`);
    }

    for (const creds of STORES) {
      logWithTimestamp(`[Connection Test] Testing store: ${creds.name}`);
      if (!creds.apiKey || !creds.apiSecret) {
        const errorMsg = 'Missing API Key or Secret in store configuration.';
        logWithTimestamp(`[Connection Test] ❌ ${creds.name}: FAILED - ${errorMsg}`);
        testResults.push({
          storeName: creds.name,
          success: false,
          error: errorMsg,
        });
        continue;
      }

      // This is a lightweight, valid API call to list outbounds.
      // It serves as a reliable way to test authentication and connectivity.
      const url = `https://storeapi.parcelninja.com/api/v1/outbounds/?startDate=${startDate}&endDate=${endDate}&pageSize=1`;
      const basicAuth = Buffer.from(`${creds.apiKey}:${creds.apiSecret}`).toString('base64');
      
      logWithTimestamp(`[Connection Test] ➡️ ${creds.name}: Requesting URL: ${url}`);

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Authorization': `Basic ${basicAuth}` },
        });
        
        logWithTimestamp(`[Connection Test] ⬅️ ${creds.name}: Received status ${response.status}`);

        if (response.ok) {
          logWithTimestamp(`[Connection Test] ✅ ${creds.name}: SUCCESS`);
          testResults.push({ storeName: creds.name, success: true });
        } else {
          let errorMessage = `API returned status ${response.status}.`;
          if (response.status === 401) {
              errorMessage = 'Authentication failed. Please check API credentials.';
          } else {
            try {
              const errorBody = await response.text();
              errorMessage += ` Body: ${errorBody.substring(0, 150)}`; // Limit error body length
            } catch (e) {}
          }
          logWithTimestamp(`[Connection Test] ❌ ${creds.name}: FAILED - ${errorMessage}`);
          testResults.push({ storeName: creds.name, success: false, error: errorMessage });
        }
      } catch (err: any) {
        const networkError = err.message || 'A network error occurred.';
        logWithTimestamp(`[Connection Test] ❌ ${creds.name}: FAILED - ${networkError}`);
        testResults.push({ storeName: creds.name, success: false, error: networkError });
      }
    }
    
    return { results: testResults, logs };
  }
);

    