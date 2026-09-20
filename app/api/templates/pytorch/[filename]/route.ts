import { NextRequest, NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/errors';
import { readPytorchTemplate } from '@/lib/templates';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    const content = await readPytorchTemplate(filename);

    // Return as downloadable Python file
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/x-python',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return toErrorResponse(error, 'Error serving template', 'Failed to read template');
  }
}
