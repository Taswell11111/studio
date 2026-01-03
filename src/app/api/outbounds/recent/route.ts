
import { getRecentOutboundsFlow } from '@/ai/flows/get-recent-outbounds';
import { type NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    try {
        const { storeName } = await req.json();
        const result = await getRecentOutboundsFlow({ storeName });
        return NextResponse.json(result);
    } catch (error: any) {
        return NextResponse.json({ records: [], error: error.message }, { status: 500 });
    }
}
