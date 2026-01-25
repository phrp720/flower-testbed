import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { desc } from 'drizzle-orm';
import { getSession, unauthorized } from '@/lib/auth';

// GET /api/experiments - List all experiments
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const experiments = await db
      .select()
      .from(schema.experiments)
      .orderBy(desc(schema.experiments.createdAt));

    return NextResponse.json({ experiments });
  } catch (error) {
    console.error('Error fetching experiments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch experiments' },
      { status: 500 }
    );
  }
}

// POST /api/experiments - Create a new experiment
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const body = await request.json();

    const {
      name,
      description,
      framework,
      algorithmPath,
      modelPath,
      configPath,
      numClients = 10,
      numRounds = 3,
      clientFraction = 0.5,
      localEpochs = 1,
      learningRate = 0.01,
      useGpu = false,
      customConfig,
    } = body;

    // Validate required fields
    if (!name || !framework) {
      return NextResponse.json(
        { error: 'Name and framework are required' },
        { status: 400 }
      );
    }

    // Insert experiment into database
    const [experiment] = await db
      .insert(schema.experiments)
      .values({
        name,
        description,
        framework,
        algorithmPath,
        modelPath,
        configPath,
        numClients,
        numRounds,
        clientFraction,
        localEpochs,
        learningRate,
        useGpu,
        customConfig,
        status: 'pending',
      })
      .returning();

    return NextResponse.json({ experiment }, { status: 201 });
  } catch (error) {
    console.error('Error creating experiment:', error);
    return NextResponse.json(
      { error: 'Failed to create experiment' },
      { status: 500 }
    );
  }
}