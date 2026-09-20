import { AnyToolDescriptor, sortTools, toolsByName } from '../registry';
import { trainingTools } from './training';
import { resultsTools } from './results';
import { fileTools } from './files';
import { mutationTools } from './mutations';
import { workspaceTools } from './workspace';
import { memoryTools } from './memory';

/**
 * The complete tool surface.
 *
 * Sorted once here, because the list is part of the prompt-cache prefix and a
 * varying order silently costs every cache hit.
 */
export const ALL_TOOLS: AnyToolDescriptor[] = sortTools([
  ...trainingTools,
  ...resultsTools,
  ...fileTools,
  ...mutationTools,
  ...workspaceTools,
  ...memoryTools,
]);

export const TOOLS_BY_NAME = toolsByName(ALL_TOOLS);

export function getTool(name: string): AnyToolDescriptor | undefined {
  return TOOLS_BY_NAME.get(name);
}

export { trainingTools, resultsTools, fileTools, mutationTools, workspaceTools, memoryTools };
