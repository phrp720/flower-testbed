import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import archiver from 'archiver';
import { PassThrough } from 'stream';
import { getSession, unauthorized } from '@/lib/auth';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

function getCheckpointsDir(): string {
  return process.env.CHECKPOINTS_DIR || path.join(process.cwd(), 'checkpoints-data');
}

// GET /api/experiments/[id]/checkpoints/download - Download all checkpoints as ZIP
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { id } = await params;
    const experimentId = parseInt(id, 10);

    if (isNaN(experimentId)) {
      return NextResponse.json(
        { error: 'Invalid experiment ID' },
        { status: 400 }
      );
    }

    // Fetch checkpoints from DB
    const checkpoints = await db
      .select()
      .from(schema.modelCheckpoints)
      .where(eq(schema.modelCheckpoints.experimentId, experimentId));

    if (checkpoints.length === 0) {
      return NextResponse.json(
        { error: 'No checkpoints found for this experiment' },
        { status: 404 }
      );
    }

    const checkpointsDir = getCheckpointsDir();

    // Create ZIP archive
    const archive = archiver('zip', { zlib: { level: 5 } });
    const passthrough = new PassThrough();

    archive.pipe(passthrough);

    for (const cp of checkpoints) {
      const fullPath = path.join(checkpointsDir, cp.filePath);

      // Security check
      if (!fullPath.startsWith(checkpointsDir)) {
        continue;
      }

      try {
        const fileBuffer = await readFile(fullPath);
        archive.append(fileBuffer, { name: path.basename(cp.filePath) });
      } catch {
        // Skip files that don't exist on disk
        console.warn(`Checkpoint file not found: ${fullPath}`);
      }
    }

    archive.finalize();

    // Convert Node stream to web ReadableStream
    const readable = new ReadableStream({
      start(controller) {
        passthrough.on('data', (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });
        passthrough.on('end', () => {
          controller.close();
        });
        passthrough.on('error', (err) => {
          controller.error(err);
        });
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="experiment-${experimentId}-checkpoints.zip"`,
      },
    });
  } catch (error) {
    console.error('Error creating checkpoints ZIP:', error);
    return NextResponse.json(
      { error: 'Failed to create checkpoints archive' },
      { status: 500 }
    );
  }
}
