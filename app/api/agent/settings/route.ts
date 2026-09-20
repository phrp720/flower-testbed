import { NextRequest, NextResponse } from 'next/server';
import { getSession, unauthorized } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { loadPublicAgentSettings, saveAgentSettings } from '@/lib/llm/settings';

export const runtime = 'nodejs';

// GET /api/agent/settings - never includes the API key, only a 4-char hint
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    return NextResponse.json({ settings: await loadPublicAgentSettings() });
  } catch (error) {
    return toErrorResponse(error, 'Error loading agent settings', 'Failed to load settings');
  }
}

// PUT /api/agent/settings - an omitted apiKey leaves the stored one untouched
export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const settings = await saveAgentSettings(await request.json());
    return NextResponse.json({ settings });
  } catch (error) {
    return toErrorResponse(error, 'Error saving agent settings', 'Failed to save settings');
  }
}
