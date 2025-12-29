import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { spawn } from 'child_process';
import path from 'path';
import { mkdir } from 'fs/promises';

// POST /api/experiments/[id]/start - Start an experiment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const experimentId = parseInt(id);

    if (isNaN(experimentId)) {
      return NextResponse.json(
        { error: 'Invalid experiment ID' },
        { status: 400 }
      );
    }

    // Fetch experiment
    const [experiment] = await db
      .select()
      .from(schema.experiments)
      .where(eq(schema.experiments.id, experimentId));

    if (!experiment) {
      return NextResponse.json(
        { error: 'Experiment not found' },
        { status: 404 }
      );
    }

    if (experiment.status === 'running') {
      return NextResponse.json(
        { error: 'Experiment is already running' },
        { status: 400 }
      );
    }

    // Update status to running
    await db
      .update(schema.experiments)
      .set({
        status: 'running',
        startedAt: new Date(),
      })
      .where(eq(schema.experiments.id, experimentId));

    // Create checkpoint directory for this experiment
    const checkpointDir = path.join(process.cwd(), 'checkpoints', `exp_${experimentId}`);
    await mkdir(checkpointDir, { recursive: true });

    // Start the experiment in the background
    startFlowerExperiment(experimentId);

    return NextResponse.json({
      success: true,
      message: 'Experiment started',
      experimentId,
    });
  } catch (error) {
    console.error('Error starting experiment:', error);
    return NextResponse.json(
      { error: 'Failed to start experiment' },
      { status: 500 }
    );
  }
}

// Background function to run Flower experiment
function startFlowerExperiment(experimentId: number) {
  console.log(`[Experiment ${experimentId}] Starting Flower experiment...`);

  const projectRoot = process.cwd();
  const pythonScript = path.join(projectRoot, 'runner', 'flower_runner.py');

  // Spawn Python process
  const pythonProcess = spawn('python3', [pythonScript, experimentId.toString()], {
    cwd: projectRoot,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Log stdout
  pythonProcess.stdout?.on('data', (data) => {
    console.log(`[Experiment ${experimentId}] ${data.toString().trim()}`);
  });

  // Log stderr
  pythonProcess.stderr?.on('data', (data) => {
    console.error(`[Experiment ${experimentId}] ERROR: ${data.toString().trim()}`);
  });

  // Handle completion
  pythonProcess.on('close', (code) => {
    if (code === 0) {
      console.log(`[Experiment ${experimentId}] ✓ Completed successfully`);
    } else {
      console.error(`[Experiment ${experimentId}] ✗ Failed with exit code ${code}`);
    }
  });

  // Handle errors
  pythonProcess.on('error', (error) => {
    console.error(`[Experiment ${experimentId}] ✗ Process error:`, error);
  });

  // Detach the process so it continues running after API response
  pythonProcess.unref();
}