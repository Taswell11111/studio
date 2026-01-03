
import { testParcelninjaConnectionFlow } from '@/ai/flows/test-parcelninja-connection';
import { NextResponse } from 'next/server';

export async function POST() {
    try {
        // Use .stream() to get the streaming response
        const flowResponse = testParcelninjaConnectionFlow.stream();
        const flowStream = flowResponse.stream;

        const readableStream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                try {
                    for await (const chunk of flowStream) {
                        controller.enqueue(encoder.encode(JSON.stringify(chunk) + '\n\n'));
                    }
                } catch (e: any) {
                    console.error("Connection Test Stream error:", e);
                    const errorChunk = { error: e.message || "An unknown stream error occurred." };
                    controller.enqueue(encoder.encode(JSON.stringify(errorChunk) + '\n\n'));
                } finally {
                    controller.close();
                }
            },
        });

        return new NextResponse(readableStream, {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
