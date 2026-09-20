"use client";

import { useState } from "react";
import {
  Card,
  CardHeader,
  cn,
  EmptyState,
  Icon,
  Pagination,
  Progress,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/app/components/ui";

type Metric = {
  id: string;
  round: number;
  trainLoss: number | null;
  trainAccuracy: number | null;
  evalLoss: number | null;
  evalAccuracy: number | null;
  createdAt: string;
};

type Direction = "better" | "worse" | "flat" | null;

/**
 * Whether a value moved the right way since the previous round.
 *
 * Loss improving means going down and accuracy improving means going up, so
 * the comparison is inverted for loss rather than the reader being asked to
 * remember which arrow is good in which column.
 */
function direction(
  metrics: Metric[],
  index: number,
  field: "trainLoss" | "evalAccuracy"
): Direction {
  if (index === 0) return null;
  const current = metrics[index]?.[field];
  const previous = metrics[index - 1]?.[field];
  if (current == null || previous == null) return null;
  if (current === previous) return "flat";

  const improved = field === "trainLoss" ? current < previous : current > previous;
  return improved ? "better" : "worse";
}

/**
 * The trend marker, which always occupies its slot.
 *
 * Round one has no previous round to compare against, so it has no arrow -- and
 * when the marker collapsed to nothing, that row's figure sat 20px right of
 * every row below it. A column of numbers that shifts as you read down it is
 * harder to scan than one with a blank where an arrow would be.
 */
function Trend({ value }: { value: Direction }) {
  return (
    <span className="inline-flex w-3 shrink-0 justify-center" aria-hidden={!value}>
      {value && (
        <Icon
          name={value === "flat" ? "flat" : value === "better" ? "up" : "down"}
          size={12}
          className={
            value === "flat"
              ? "text-ink-subtle"
              : value === "better"
                ? "text-ok"
                : "text-danger"
          }
        />
      )}
    </span>
  );
}

/**
 * A header for a column whose cells end in a trend marker.
 *
 * Reserves the same trailing slot the cells do, so the label sits over the
 * figures rather than over the arrows.
 */
function TrendSlotLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {children}
      <span className="w-3" aria-hidden />
    </span>
  );
}

function Accuracy({ value }: { value: number | null }) {
  // The bar and the figure keep their widths with nothing to show, so a round
  // missing this metric does not pull the column out of line either.
  return (
    <span className="flex items-center gap-2 justify-end">
      {value == null ? <span className="w-14" /> : <Progress value={value} className="w-14 h-1" />}
      <span
        className={cn(
          "tabular font-mono text-[13px] w-12 text-right",
          value == null && "text-ink-subtle"
        )}
      >
        {value == null ? "—" : `${(value * 100).toFixed(1)}%`}
      </span>
    </span>
  );
}

export default function MetricsTable({
  metrics,
  itemsPerPage = 8,
}: {
  metrics: Metric[];
  itemsPerPage?: number;
}) {
  const [page, setPage] = useState(1);

  const pageCount = Math.ceil(metrics.length / itemsPerPage);
  const visible = metrics.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  return (
    <Card padded={false} className="flex flex-col">
      <CardHeader
        title="Metrics by round"
        description={`${metrics.length} round${metrics.length === 1 ? "" : "s"} recorded`}
        className="p-5 pb-4"
      />

      {metrics.length === 0 ? (
        <EmptyState
          icon="metrics"
          title="No metrics yet"
          description="Rounds appear here as the federation reports them."
        />
      ) : (
        <>
          <div className="border-t border-line">
            <Table>
              <THead>
                <TH className="w-16">Round</TH>
                <TH align="right">
                  <TrendSlotLabel>Train loss</TrendSlotLabel>
                </TH>
                <TH align="right">Train acc</TH>
                <TH align="right">
                  <TrendSlotLabel>Eval acc</TrendSlotLabel>
                </TH>
              </THead>
              <TBody>
                {visible.map((metric, index) => {
                  const absolute = (page - 1) * itemsPerPage + index;
                  return (
                    <TR key={metric.id}>
                      <TD numeric className="text-ink-muted">
                        {metric.round}
                      </TD>
                      <TD align="right">
                        <span className="inline-flex items-center gap-1.5 justify-end">
                          <span className="tabular font-mono text-[13px] w-14 text-right">
                            {metric.trainLoss?.toFixed(4) ?? "—"}
                          </span>
                          <Trend value={direction(metrics, absolute, "trainLoss")} />
                        </span>
                      </TD>
                      <TD align="right">
                        <Accuracy value={metric.trainAccuracy} />
                      </TD>
                      <TD align="right">
                        <span className="inline-flex items-center gap-1.5 justify-end">
                          <Accuracy value={metric.evalAccuracy} />
                          <Trend value={direction(metrics, absolute, "evalAccuracy")} />
                        </span>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>

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
