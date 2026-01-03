import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // A simplified representation of environment variables for security.
    // We don't want to expose all secrets, just confirm they are loaded.
    const env_vars = {
      JEEP_API_KEY_SET: !!process.env.JEEP_API_KEY,
      JEEP_API_SECRET_SET: !!process.env.JEEP_API_SECRET,
      HURLEY_API_KEY_SET: !!process.env.HURLEY_API_KEY,
      HURLEY_API_SECRET_SET: !!process.env.HURLEY_API_SECRET,
      NODE_ENV: process.env.NODE_ENV,
    };

    return NextResponse.json(env_vars);
  } catch (error) {
    let errorMessage = 'An unknown error occurred';
    if (error instanceof Error) {
        errorMessage = error.message;
    }
    return new Response(JSON.stringify({ error: { message: errorMessage } }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
    });
  }
}
