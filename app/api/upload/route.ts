import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { getSession, unauthorized } from '@/lib/auth';

function getDataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'uploads');
}

// Create upload directories if they don't exist
async function ensureUploadDir(subdir: string) {
  const uploadPath = path.join(getDataDir(), subdir);
  await mkdir(uploadPath, { recursive: true });
  return uploadPath;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string; // 'algorithm', 'model', 'config', 'dataset'

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!type || !['algorithm', 'model', 'config', 'dataset'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Must be one of: algorithm, model, config, dataset' },
        { status: 400 }
      );
    }

    // Validate file extensions
    const validExtensions: Record<string, string[]> = {
      algorithm: ['.py'],
      model: ['.py', '.pt', '.pth', '.h5', '.pkl'],
      config: ['.py', '.json', '.yaml', '.yml'],
      dataset: ['.py'],
    };

    const fileExt = path.extname(file.name).toLowerCase();
    if (!validExtensions[type].includes(fileExt)) {
      return NextResponse.json(
        {
          error: `Invalid file extension for ${type}. Expected: ${validExtensions[type].join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Ensure upload directory exists
    const uploadDir = await ensureUploadDir(type === 'dataset' ? 'datasets' : `${type}s`);

    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const filename = `${timestamp}_${file.name}`;
    const filepath = path.join(uploadDir, filename);

    // Convert file to buffer and save
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filepath, buffer);

    // Return relative path
    const dataDir = getDataDir();
    const isDefaultPath = dataDir === path.join(process.cwd(), 'uploads');
    const relativePath = isDefaultPath
      ? path.join('uploads', type === 'dataset' ? 'datasets' : `${type}s`, filename)
      : path.join(dataDir, type === 'dataset' ? 'datasets' : `${type}s`, filename);

    return NextResponse.json({
      success: true,
      filename,
      path: relativePath,
      size: buffer.length,
      type,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}