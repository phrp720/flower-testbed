import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { getSession, unauthorized } from '@/lib/auth';

// GET /api/checkpoints/[...path] - Download checkpoint file
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { path: filePath } = await params;

    // Construct full path
    const fullPath = path.join(process.cwd(), 'checkpoints-data', ...filePath);

    // Security check - ensure path is within checkpoints directory
    const checkpointsDir = path.join(process.cwd(), 'checkpoints-data');
    if (!fullPath.startsWith(checkpointsDir)) {
      return NextResponse.json(
        { error: 'Invalid file path' },
        { status: 403 }
      );
    }

    // Read file
    const fileBuffer = await readFile(fullPath);
    const fileName = path.basename(fullPath);

    // Return file as download
    return new Response(fileBuffer, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error('Error downloading checkpoint:', error);
    return NextResponse.json(
      { error: 'File not found' },
      { status: 404 }
    );
  }
}