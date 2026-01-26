import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { getSession, unauthorized } from '@/lib/auth';

// GET /api/resources - Get available system resources
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const resources = await getSystemResources();
    return NextResponse.json(resources);
  } catch (error) {
    console.error('Error fetching resources:', error);
    return NextResponse.json(
      { error: 'Failed to fetch system resources' },
      { status: 500 }
    );
  }
}

function getSystemResources(): Promise<{
  cpu: { count: number };
  gpu: {
    available: boolean;
    count: number;
    devices: Array<{ id: number; name: string; memory_gb: number | null }>;
    backend: string | null;
  };
}> {
  return new Promise((resolve, reject) => {
    const projectRoot = process.cwd();
    const pythonPath = path.join(projectRoot, 'venv', 'bin', 'python');
    const scriptPath = path.join(projectRoot, 'runner', 'core', 'resources.py');

    const pythonProcess = spawn(pythonPath, [scriptPath], {
      cwd: projectRoot,
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        try {
          const resources = JSON.parse(stdout.trim());
          resolve(resources);
        } catch (parseError) {
          reject(new Error(`Failed to parse resources: ${stdout}`));
        }
      } else {
        reject(new Error(`Python script failed: ${stderr}`));
      }
    });

    pythonProcess.on('error', (error) => {
      reject(error);
    });
  });
}