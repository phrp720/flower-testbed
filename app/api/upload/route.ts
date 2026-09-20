import { NextRequest, NextResponse } from 'next/server';
import { getSession, unauthorized } from '@/lib/auth';
import { toErrorResponse, ValidationError } from '@/lib/errors';
import { assertUploadType, persistUpload } from '@/lib/uploads';

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      throw new ValidationError('No file provided');
    }

    const type = assertUploadType(formData.get('type'));
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await persistUpload(buffer, file.name, type);

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return toErrorResponse(error, 'Upload error', 'Failed to upload file');
  }
}
