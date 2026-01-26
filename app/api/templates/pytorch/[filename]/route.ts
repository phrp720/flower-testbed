import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

// Valid template files
const VALID_TEMPLATES = [
  'model_template.py',
  'dataset_template.py',
  'strategy_template.py',
  'config_template.py',
];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;

    // Validate filename to prevent path traversal
    if (!VALID_TEMPLATES.includes(filename)) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    // Read the template file
    const templatePath = path.join(
      process.cwd(),
      'runner',
      'templates',
      'pytorch',
      filename
    );

    const content = await readFile(templatePath, 'utf-8');

    // Return as downloadable Python file
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/x-python',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error serving template:', error);
    return NextResponse.json(
      { error: 'Failed to read template' },
      { status: 500 }
    );
  }
}
