import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { getSession, unauthorized } from '@/lib/auth';

function getCheckpointsDir(): string {
  return process.env.CHECKPOINTS_DIR || path.join(process.cwd(), 'checkpoints-data');
}

// GET /api/checkpoints/[...path] - Download checkpoint file
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { path: filePath } = await params;
    const checkpointsDir = getCheckpointsDir();

    // Construct full path
    const fullPath = path.join(checkpointsDir, ...filePath);

    // Security check - ensure path is within checkpoints directory
    if (!fullPath.startsWith(checkpointsDir)) {
      return NextResponse.json(
        { error: 'Invalid file path' },
        { status: 403 }
      );
    }

    const fileBuffer = await readFile(fullPath);
    const fileName = path.basename(fullPath);

    return new Response(new Uint8Array(fileBuffer), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  } catch (error) {
    console.error('Error downloading checkpoint:', error);
    return NextResponse.json(
      { error: 'File not found' },
      { status: 404 }
    );
  }
}