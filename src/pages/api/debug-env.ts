import { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    message: 'Environment variables loaded in this Next.js API route',
    processEnv: {
        NEXT_PUBLIC_APP_ID: process.env.NEXT_PUBLIC_APP_ID,
        JEEP_API_KEY: process.env.JEEP_API_KEY ? 'Loaded' : 'Not Loaded',
        JEEP_API_SECRET: process.env.JEEP_API_SECRET ? 'Loaded' : 'Not Loaded',
        RAM_API_KEY: process.env.RAM_API_KEY ? 'Loaded' : 'Not Loaded',
        RAM_API_SECRET: process.env.RAM_API_SECRET ? 'Loaded' : 'Not Loaded',
        CHRYSLER_API_KEY: process.env.CHRYSLER_API_KEY ? 'Loaded' : 'Not Loaded',
        CHRYSLER_API_SECRET: process.env.CHRYSLER_API_SECRET ? 'Loaded' : 'Not Loaded',
        // Add any other env vars you expect to be loaded
    }
  });
}
