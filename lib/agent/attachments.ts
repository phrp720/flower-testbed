import path from 'path';
import { createHash } from 'crypto';
import { writeFile } from 'fs/promises';
import { db, schema } from '@/lib/db';
import { ValidationError } from '@/lib/errors';
import { ensureDir, getAgentWorkspaceDir, resolveSafe } from '@/lib/storage';

/**
 * Files a user attaches to a chat message.
 *
 * Kept separate from lib/uploads.ts on purpose. That module persists the four
 * experiment modules, and the shape of the path it returns is a contract the
 * Python ModuleLoader and the GitHub Action both depend on. An attachment is a
 * different thing: it lands in the agent workspace, which is the one directory
 * the agent may read and write, and it is described by an agent_artifacts row
 * rather than by a column on the experiment.
 */

/** Where attachments live, relative to the workspace root. */
const ATTACHMENTS_DIR = 'attachments';

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Wider than the experiment upload allowlist, because the agent is being asked
 * to read and reason about these rather than execute them. Still an allowlist:
 * the workspace is reachable by tools, so an arbitrary extension here would be
 * a way to stage something for a later execute-shaped tool.
 */
const ALLOWED_EXTENSIONS = new Set([
  // Text the agent can read with read_file.
  '.py', '.json', '.yaml', '.yml', '.toml',
  '.txt', '.md', '.csv', '.tsv', '.log',
  // Binary the agent cannot read, but can describe with inspect_checkpoint and
  // promote with upload_from_agent as an experiment's model file. Deliberately
  // not .npy or .npz: nothing in the tool surface consumes them, so accepting
  // one would only let someone upload a file that then sits there unusable.
  '.pt', '.pth', '.pkl',
]);

export interface Attachment {
  id: string;
  filename: string;
  /** Relative to the workspace root; what `read_file {scope:'workspace'}` takes. */
  relativePath: string;
  sizeBytes: number;
}

/**
 * Strip a name down to something safe to put on disk.
 *
 * Only the basename survives, so `../../etc/passwd` becomes `passwd`, and the
 * result is re-checked against the workspace root by resolveSafe below -- a
 * sanitiser is a convenience, never the boundary.
 */
function safeFilename(raw: string): string {
  const base = path.basename(raw).replace(/[^\w.\- ]+/g, '_').trim();
  return base.length > 0 ? base.slice(0, 120) : 'attachment';
}

export async function persistAttachment(
  file: File,
  conversationId: string | null
): Promise<Attachment> {
  if (file.size === 0) throw new ValidationError('That file is empty.');
  if (file.size > MAX_BYTES) {
    throw new ValidationError(
      `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_BYTES / 1024 / 1024} MB.`
    );
  }

  const filename = safeFilename(file.name);
  const extension = path.extname(filename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new ValidationError(
      `${extension || 'That file type'} is not accepted. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`
    );
  }

  // Prefixed with the time so two uploads of the same name coexist, which is
  // what happens when someone iterates on one file across a conversation.
  const stored = `${Date.now()}_${filename}`;
  const relativePath = path.posix.join(ATTACHMENTS_DIR, stored);

  const root = getAgentWorkspaceDir();
  const absolute = resolveSafe(root, relativePath);
  if (!absolute) throw new ValidationError('Invalid file name.');

  await ensureDir(path.dirname(absolute));

  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(absolute, bytes);

  const [row] = await db
    .insert(schema.agentArtifacts)
    .values({
      conversationId,
      kind: 'attachment',
      filename,
      relativePath,
      language: extension === '.py' ? 'python' : null,
      contentHash: createHash('sha256').update(bytes).digest('hex'),
      sizeBytes: bytes.byteLength,
    })
    .returning();

  return {
    id: row.id,
    filename: row.filename,
    relativePath: row.relativePath,
    sizeBytes: row.sizeBytes ?? bytes.byteLength,
  };
}

/**
 * The line appended to a message that carries attachments.
 *
 * Written into the message the user sees rather than slipped into the system
 * prompt: the agent is being told where to find something, and the person who
 * attached it should be able to read the same instruction.
 */
export function describeAttachments(attachments: Attachment[]): string {
  if (attachments.length === 0) return '';

  const lines = attachments.map(
    (a) => `- ${a.filename} -> workspace:${a.relativePath} (${a.sizeBytes} bytes)`
  );

  return [
    '',
    attachments.length === 1 ? 'Attached file:' : 'Attached files:',
    ...lines,
    '',
    'Read them with read_file using scope "workspace".',
  ].join('\n');
}
