
import { multiLookupShipmentFlow } from '@/ai/flows/multi-lookup-shipment';
import { type NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    try {
        const input = await req.json();
        
        // Use .stream() to get the streaming response
        const flowResponse = multiLookupShipmentFlow.stream({ 
            ...input, 
            abortSignal: req.signal 
        });

        // The actual async iterable is in the .stream property
        const flowStream = flowResponse.stream;

        const readableStream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                try {
                    for await (const chunk of flowStream) {
                        const plainChunk = {
                            log: chunk.log,
                            result: chunk.result ? {
                                results: chunk.result.results,
                                notFound: chunk.result.notFound,
                                error: chunk.result.error,
                            } : undefined,
                            error: chunk.error ? { message: chunk.error.message } : undefined,
                        };
                        controller.enqueue(encoder.encode(JSON.stringify(plainChunk) + '\n\n'));
                    }
                } catch (e: any) {
                    console.error("Multi-search Stream error:", e);
                    const errorChunk = { error: { message: e.message || "An unknown stream error occurred." } };
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
