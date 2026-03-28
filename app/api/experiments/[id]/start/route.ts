import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { spawn, SpawnOptions } from 'child_process';
import path from 'path';
import { mkdir } from 'fs/promises';
import { getSession, unauthorized } from '@/lib/auth';

function getCheckpointsDir(): string {
  return process.env.CHECKPOINTS_DIR || path.join(process.cwd(), 'checkpoints-data');
}

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
    const checkpointDir = path.join(getCheckpointsDir(), `exp_${experimentId}`);
    await mkdir(checkpointDir, { recursive: true });

    // Start the experiment in the background and fail fast on startup errors
    try {
      await startFlowerExperiment(experimentId);
    } catch (startupError) {
      await db
        .update(schema.experiments)
        .set({
          status: 'failed',
          errorMessage: startupError instanceof Error ? startupError.message : 'Flower runner failed to start',
          completedAt: new Date(),
        })
        .where(eq(schema.experiments.id, experimentId));
      throw startupError;
    }

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
async function startFlowerExperiment(experimentId: number): Promise<void> {
  const projectRoot = process.cwd();
  const pythonScript = path.join(projectRoot, 'runner', 'flower_runner.py');

  const pythonPath = path.join(
    process.env.VENV_PATH ?? path.join(projectRoot, 'venv'),
    'bin',
    'python'
  );

  const showLogs = process.env.SHOW_FLWR_LOGS === 'true';

  const spawnOptions: SpawnOptions = {
    cwd: projectRoot,
    detached: true,
    stdio: showLogs ? 'inherit' : 'ignore',
  };

  const pythonProcess = spawn(pythonPath, [pythonScript, experimentId.toString()], spawnOptions);
  const startupGraceMs = 1500;

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(startupTimer);
      callback();
    };

    const startupTimer = setTimeout(() => {
      settle(resolve);
    }, startupGraceMs);

    pythonProcess.once('error', (error) => {
      settle(() => reject(error));
    });

    pythonProcess.once('exit', (code, signal) => {
      settle(() => {
        reject(
          new Error(
            `Flower runner exited during startup (code=${code ?? 'null'}, signal=${signal ?? 'null'})`
          )
        );
      });
    });
  });

  // Detach so it can continue running after API response
  pythonProcess.unref();
}
