import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import {spawn, SpawnOptions} from 'child_process';
import path from 'path';
import { mkdir } from 'fs/promises';
import { getSession, unauthorized } from '@/lib/auth';
import * as fs from "node:fs";

// POST /api/experiments/[id]/start - Start an experiment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();

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
    const checkpointDir = path.join(process.cwd(), 'checkpoints-data', `exp_${experimentId}`);
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

export function getPythonPath(projectRoot: string): string {
  const nodeEnv = process.env.NODE_ENV || 'production';

  if (nodeEnv === 'development') {
    const devPath =
    if (fs.existsSync(devPath)) return devPath;
  } else {
  if (fs.existsSync(prodPath)) return prodPath;
  }

  // Final fallback to system python3
  return 'python3';
}


// Background function to run Flower experiment
function startFlowerExperiment(experimentId: number) {

  const projectRoot = process.cwd();
  const pythonScript = path.join(projectRoot, 'runner', 'flower_runner.py');

  const venvEnv = process.env.VENV_PATH;
  const pythonPath = venvEnv ? path.join(venvEnv, 'bin', 'python') : path.join(projectRoot, 'venv', 'bin', 'python');

  const showLogs = process.env.SHOW_FLWR_LOGS === 'true';

  const spawnOptions: SpawnOptions = {
    cwd: projectRoot,
    detached: true,
    stdio: showLogs ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  };

  const pythonProcess = spawn(pythonPath, [pythonScript, experimentId.toString()], spawnOptions);

// Detach so it can continue running after API response
  pythonProcess.unref();

}