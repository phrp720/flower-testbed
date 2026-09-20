"use client";

import { useState } from "react";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Icon,
  Pagination,
} from "@/app/components/ui";

type Checkpoint = {
  id: string;
  round: number;
  filePath: string;
  accuracy: number | null;
  loss: number | null;
  createdAt: string;
};

type Props = {
  checkpoints: Checkpoint[];
  experimentId: string | number;
  experimentStatus?: string;
  totalRounds?: number;
  itemsPerPage?: number;
};

function formatWhen(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CheckpointsList({
  checkpoints,
  experimentId,
  experimentStatus,
  totalRounds,
  itemsPerPage = 6,
}: Props) {
  const [page, setPage] = useState(1);

  const pageCount = Math.ceil(checkpoints.length / itemsPerPage);
  const visible = checkpoints.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  // The archive is built from the files on disk, so it is only offered once
  // the run has stopped writing to them.
  const canDownloadAll =
    checkpoints.length > 0 &&
    (experimentStatus === "completed" || experimentStatus === "failed");

  return (
    <Card padded={false} className="flex flex-col">
      <CardHeader
        title="Checkpoints"
        description={`${checkpoints.length} saved`}
        className="p-5 pb-4"
        actions={
          canDownloadAll ? (
            <a
              href={`/api/experiments/${experimentId}/checkpoints/download`}
              download
              title="Download every checkpoint as a zip"
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[var(--radius)] border border-line-strong bg-surface text-xs font-medium text-ink hover:bg-surface-hover transition-colors"
            >
              <Icon name="checkpoint" size={14} />
              Download all
            </a>
          ) : undefined
        }
      />

      {checkpoints.length === 0 ? (
        <EmptyState
          icon="storage"
          title="No checkpoints yet"
          description="The global model is saved after each round."
        />
      ) : (
        <>
          <ul className="border-t border-line divide-y divide-line">
            {visible.map((checkpoint) => {
              const isFinal = totalRounds != null && checkpoint.round === totalRounds;
              return (
                <li
                  key={checkpoint.id}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-surface-muted transition-colors"
                >
                  <span className="flex items-center justify-center w-9 h-9 rounded-[var(--radius)] bg-surface-muted border border-line text-xs font-medium tabular text-ink shrink-0">
                    {checkpoint.round}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-ink">Round {checkpoint.round}</span>
                      {isFinal && <Badge tone="ok">Final</Badge>}
                    </div>
                    <p className="text-xs text-ink-muted tabular mt-0.5">
                      {checkpoint.accuracy != null
                        ? `${(checkpoint.accuracy * 100).toFixed(1)}% acc`
                        : "no accuracy"}
                      {checkpoint.loss != null && ` · ${checkpoint.loss.toFixed(4)} loss`}
                      {" · "}
                      {formatWhen(checkpoint.createdAt)}
                    </p>
                  </div>

                  <a
                    href={`/api/checkpoints/${checkpoint.filePath}`}
                    download
                    title={`Download round ${checkpoint.round}`}
                    aria-label={`Download round ${checkpoint.round}`}
                    className="flex items-center justify-center w-8 h-8 rounded-[var(--radius)] text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors shrink-0"
                  >
                    <Icon name="download" size={15} />
                  </a>
                </li>
              );
            })}
          </ul>

          {pageCount > 1 && (
            <Pagination
              page={page}
              pageCount={pageCount}
              onChange={setPage}
              className="px-5 py-3 border-t border-line mt-auto"
            />
          )}
        </>
      )}
    </Card>
  );
}
