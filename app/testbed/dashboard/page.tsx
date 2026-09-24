"use client";

import { useMemo } from "react";
import { gpuDetail, gpuSummary } from "./gpu";
import Link from "next/link";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardHeader,
  EmptyState,
  Icon,
  KeyValue,
  KeyValueGrid,
  LinkButton,
  PageHeader,
  Progress,
  SectionLabel,
  Spinner,
  Stat,
  StatusBadge,
  cn,
  type IconName,
} from "@/app/components/ui";
import {
  useExperiments,
  useResources,
  type Experiment,
} from "@/app/hooks/useExperiments";

function ShortcutCard({
  href,
  icon,
  title,
  description,
  external,
}: {
  href: string;
  icon: IconName;
  title: string;
  description: string;
  external?: boolean;
}) {
  const inner = (
    <>
      <span className="flex items-center justify-center w-8 h-8 rounded-[var(--radius)] bg-surface-muted text-ink-muted shrink-0">
        <Icon name={icon} size={16} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block text-xs text-ink-muted mt-0.5">{description}</span>
      </span>
      <Icon
        name={external ? "external" : "forward"}
        size={14}
        className="ml-auto text-ink-subtle shrink-0"
      />
    </>
  );

  const className =
    "flex items-center gap-3 p-4 bg-surface border border-line rounded-[var(--radius)] hover:border-line-strong hover:bg-surface-muted transition-colors";

  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={className}>
      {inner}
    </Link>
  );
}

/**
 * Which problem a run was solving.
 *
 * `customConfig.dataset.kind` is set for the built-in 2D sets; an uploaded
 * module is its own thing and cannot be compared to anything else; everything
 * left is the CIFAR-10 default.
 */
function datasetOf(experiment: Experiment): string {
  return experiment.customConfig?.dataset?.kind ?? (experiment.datasetPath ? "custom" : "cifar10");
}

/**
 * Which aggregation strategy a run actually used.
 *
 * The same precedence the runner applies in create_strategy: an uploaded module
 * wins over a named built-in, which wins over FedAvg. Reading only
 * customConfig.strategy would have reported a run with its own
 * get_strategy() as "fedavg" -- claiming the platform had never been pushed
 * past the default by the very runs that did.
 */
function strategyOf(experiment: Experiment): string {
  if (experiment.algorithmPath) return "custom";
  return experiment.customConfig?.strategy?.name ?? "fedavg";
}

function tally(items: Experiment[], key: (item: Experiment) => string) {
  const counts = items.reduce<Record<string, number>>((acc, item) => {
    const k = key(item);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * What the platform can do, against what has been tried.
*/
const SUPPORTED = {
  strategies: ["fedavg", "fedprox", "fedadam", "fedadagrad", "fedyogi"],
  partitioning: ["iid", "dirichlet", "shard", "pathological"],
};

/** One colour per dataset series, reused in order. */
const SERIES = ["var(--ink)", "#2563eb", "#ea580c", "#16a34a", "#9333ea", "#0891b2"];

/**
 * One row per option the platform supports, used or not.
*/
function Coverage({
  label,
  used,
  supported,
  className,
}: {
  label: string;
  used: Array<[string, number]>;
  supported: string[];
  className?: string;
}) {
  const counts = new Map(used);
  const total = used.reduce((sum, [, count]) => sum + count, 0);

  // Supported options first, in their declared order, then anything used that
  // is not a built-in -- an uploaded module, which has no slot to sit in.
  const extras = used.map(([name]) => name).filter((name) => !supported.includes(name));
  const rows = [...supported, ...extras];

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <SectionLabel>{label}</SectionLabel>
        <span className="text-xs text-ink-subtle tabular">
          {counts.size} of {rows.length} used
        </span>
      </div>

      <div className="space-y-1">
        {rows.map((name) => {
          const count = counts.get(name) ?? 0;
          return (
            <div key={name} className="flex items-center gap-2.5">
              <span
                className={cn(
                  "w-24 shrink-0 truncate text-xs",
                  count > 0 ? "text-ink" : "text-ink-subtle"
                )}
                title={name}
              >
                {name}
              </span>
              <Progress value={total ? count / total : 0} className="flex-1" />
              <span
                className={cn(
                  "w-6 text-right text-xs tabular",
                  count > 0 ? "text-ink font-medium" : "text-ink-subtle"
                )}
              >
                {count > 0 ? count : "\u2013"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: experiments = [], isLoading } = useExperiments();
  const { data: resources } = useResources();

  const summary = useMemo(() => {
    const total = experiments.length;
    const running = experiments.filter((e) => e.status === "running").length;
    const completed = experiments.filter((e) => e.status === "completed").length;
    const failed = experiments.filter((e) => e.status === "failed").length;

    const scored = experiments.filter(
      (e) => e.status === "completed" && e.finalAccuracy != null
    );
    const meanAccuracy = scored.length
      ? scored.reduce((sum, e) => sum + (e.finalAccuracy ?? 0), 0) / scored.length
      : 0;

    const byFramework = experiments.reduce<Record<string, number>>((acc, exp) => {
      acc[exp.framework] = (acc[exp.framework] ?? 0) + 1;
      return acc;
    }, {});

    /**
     * One series per dataset, because accuracy across datasets is not a trend.
    */
    const ordered = [...scored].reverse().slice(-24);

    const trend = ordered.map((exp, index) => ({
      index,
      name: exp.name,
      clients: exp.numClients,
      rounds: exp.numRounds,
      [datasetOf(exp)]: (exp.finalAccuracy ?? 0) * 100,
    }));

    const datasets = [...new Set(ordered.map(datasetOf))];

    /** What has actually been explored, against what the platform supports. */
    const coverage = {
      strategies: tally(experiments, strategyOf),
      partitioning: tally(experiments, (e) => e.customConfig?.partitioner?.kind ?? "iid"),
    };

    const durations = experiments
      .filter((e) => e.startedAt && e.completedAt)
      .map(
        (e) =>
          (new Date(e.completedAt as string).getTime() -
            new Date(e.startedAt as string).getTime()) /
          1000
      )
      .sort((a, b) => a - b);

    return {
      total,
      running,
      completed,
      failed,
      meanAccuracy,
      scoredCount: scored.length,
      successRate: total ? completed / total : 0,
      totalRounds: experiments.reduce((sum, e) => sum + e.numRounds, 0),
      totalClients: experiments.reduce((sum, e) => sum + e.numClients, 0),
      trend,
      datasets,
      coverage,
      medianDuration: durations.length ? durations[Math.floor(durations.length / 2)] : null,
      slowestDuration: durations.length ? durations[durations.length - 1] : null,
      frameworks: Object.entries(byFramework).map(([name, count]) => ({ name, count })),
    };
  }, [experiments]);

  if (isLoading) {
    return (
      <Card className="flex justify-center py-20">
        <Spinner size={18} label="Loading dashboard" />
      </Card>
    );
  }

  const recent = experiments.slice(0, 5);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Everything running, and everything that has run."
        actions={
          <LinkButton href="/testbed/experiments/new" variant="primary" icon="add">
            New experiment
          </LinkButton>
        }
      />

      {/* One card holding four numbers, divided by hairlines: they are one
          summary, not four unrelated panels. */}
      <Card className="mb-5" padded={false}>
        <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-line">
          <div className="p-5">
            <Stat label="Experiments" value={summary.total} icon="metrics" />
          </div>
          <div className="p-5">
            <Stat
              label="Running"
              value={summary.running}
              icon="energy"
              tone={summary.running > 0 ? "warn" : undefined}
            />
          </div>
          <div className="p-5">
            <Stat label="Completed" value={summary.completed} icon="success" tone="ok" />
          </div>
          <div className="p-5">
            <Stat
              label="Failed"
              value={summary.failed}
              icon="error"
              tone={summary.failed > 0 ? "danger" : undefined}
            />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <Card>
          <CardHeader
            title="Performance"
            description="Across every completed run."
            className="mb-5"
          />

          <div className="space-y-4">
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-xs text-ink-muted">Mean final accuracy</span>
                <span className="text-sm font-semibold text-ink tabular">
                  {(summary.meanAccuracy * 100).toFixed(1)}%
                </span>
              </div>
              <Progress value={summary.meanAccuracy} />
              <p className="text-xs text-ink-subtle mt-1.5">
                {summary.scoredCount} run{summary.scoredCount === 1 ? "" : "s"} with a
                recorded accuracy
              </p>
            </div>

            <div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-xs text-ink-muted">Completion rate</span>
                <span className="text-sm font-semibold text-ink tabular">
                  {(summary.successRate * 100).toFixed(0)}%
                </span>
              </div>
              <Progress value={summary.successRate} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 mt-4 border-t border-line">
            <div>
              <SectionLabel>Rounds scheduled</SectionLabel>
              <p className="text-lg font-semibold text-ink tabular mt-1">
                {summary.totalRounds.toLocaleString()}
              </p>
            </div>
            <div>
              <SectionLabel>Clients configured</SectionLabel>
              <p className="text-lg font-semibold text-ink tabular mt-1">
                {summary.totalClients.toLocaleString()}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Accuracy by dataset"
            description="Final accuracy of each completed run, oldest to newest, one line per problem."
            className="mb-4"
          />
          {summary.trend.length < 2 ? (
            <div className="h-[220px] flex items-center justify-center text-xs text-ink-subtle">
              {summary.trend.length === 0
                ? "No completed runs yet"
                : "One completed run so far -- a trend needs at least two"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={summary.trend} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="index" hide />
                <YAxis
                  stroke="var(--ink-subtle)"
                  fontSize={11}
                  domain={[0, 100]}
                  tickFormatter={(value: number) => `${value}%`}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={{ stroke: "var(--line-strong)" }}
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--line)",
                    borderRadius: "var(--radius)",
                    fontSize: 12,
                  }}
                  formatter={(value?: number, name?: string) => [
                    value != null ? `${value.toFixed(1)}%` : "-",
                    name ?? "accuracy",
                  ]}
                  labelFormatter={() => ""}
                />
                {/* connectNulls, because a dataset's runs are rarely
                    consecutive: without it each series would be a scatter of
                    disconnected dots rather than its own trajectory. */}
                {summary.datasets.map((dataset, index) => (
                  <Line
                    key={dataset}
                    type="monotone"
                    dataKey={dataset}
                    name={dataset}
                    stroke={SERIES[index % SERIES.length]}
                    strokeWidth={1.75}
                    dot={{ r: 2.5, strokeWidth: 0, fill: SERIES[index % SERIES.length] }}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}

          {/* The legend replaces the framework tally, which only ever said
              "pytorch" and is now stated once in Configuration instead. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-4 mt-4 border-t border-line">
            <SectionLabel>Datasets</SectionLabel>
            {summary.datasets.map((dataset, index) => (
              <span key={dataset} className="flex items-center gap-1.5 text-xs text-ink-muted">
                <span
                  className="w-2.5 h-0.5 rounded-full"
                  style={{ background: SERIES[index % SERIES.length] }}
                />
                {dataset}
              </span>
            ))}
            {summary.datasets.length === 0 && (
              <span className="text-xs text-ink-subtle">none</span>
            )}
          </div>
        </Card>
      </div>

      <Card className="mb-5">
        {!resources ? (
          <div className="h-8 flex items-center">
            <Spinner size={14} label="Reading machine resources" />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-10 gap-y-4">
            <div className="min-w-0">
              <SectionLabel>Capacity</SectionLabel>
             <div className="flex items-center gap-2 mt-1">
                <span
                  className={cn(
                    "text-xl font-semibold tabular leading-none",
                    resources.concurrency.canCreate ? "text-ok" : "text-warn"
                  )}
                >
                  {resources.concurrency.available ?? "\u221e"}
                </span>
                <span className="text-xs text-ink-muted leading-none">
                  {resources.concurrency.max == null
                    ? "no concurrency limit set"
                    : `of ${resources.concurrency.max} slots free`}
                </span>
              </div>
            </div>

            <div className="flex-1 min-w-[18rem]">
              <KeyValueGrid>
                <KeyValue label="Running now" value={resources.concurrency.active} mono />
                <KeyValue label="CPUs" value={resources.cpu.count} mono />
                <KeyValue label="Ray CPUs" value={resources.cpu.ray_count} mono />
                <KeyValue label="GPU" value={gpuSummary(resources)} title={gpuDetail(resources)} />
              </KeyValueGrid>
            </div>
          </div>
        )}
      </Card>

      <Card className="mb-5">
        <CardHeader
          title="What you have explored"
          description="Across every run, not just the completed ones."
          className="mb-5"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
          <Coverage
            label="Aggregation strategy"
            used={summary.coverage.strategies}
            supported={SUPPORTED.strategies}
          />
          <Coverage
            label="Partitioning"
            used={summary.coverage.partitioning}
            supported={SUPPORTED.partitioning}
          />
        </div>

        {summary.medianDuration != null && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-4 mt-5 border-t border-line">
            <SectionLabel>Run time</SectionLabel>
            <span className="text-xs text-ink-muted tabular">
              median{" "}
              <span className="text-ink font-medium">
                {formatDuration(summary.medianDuration)}
              </span>
            </span>
            <span className="text-xs text-ink-muted tabular">
              slowest{" "}
              <span className="text-ink font-medium">
                {formatDuration(summary.slowestDuration ?? 0)}
              </span>
            </span>
          </div>
        )}
      </Card>

      <Card padded={false} className="mb-5">
        <CardHeader
          title="Recent experiments"
          actions={
            recent.length > 0 ? (
              <LinkButton href="/testbed/experiments" size="sm" variant="ghost" icon="forward" iconAfter>
                View all
              </LinkButton>
            ) : undefined
          }
          className="p-5 pb-4"
        />

        {recent.length === 0 ? (
          <EmptyState
            icon="experiments"
            title="No experiments yet"
            description="Your five most recent runs will appear here."
            action={
              <LinkButton href="/testbed/experiments/new" variant="primary" icon="add">
                Create your first experiment
              </LinkButton>
            }
          />
        ) : (
          <ul className="border-t border-line divide-y divide-line">
            {recent.map((exp) => (
              <li key={exp.id}>
                <Link
                  href={`/testbed/experiments/${exp.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-surface-muted transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5 mb-1">
                      <span className="text-sm font-medium text-ink truncate">{exp.name}</span>
                      <StatusBadge status={exp.status} />
                    </div>
                    <p className="text-xs text-ink-muted tabular">
                      {exp.framework} · {exp.numClients} clients · {exp.numRounds} rounds ·{" "}
                      {new Date(exp.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Icon name="forward" size={14} className="text-ink-subtle shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ShortcutCard
          href="/testbed/experiments/new"
          icon="add"
          title="New experiment"
          description="Configure and launch a run"
        />
        <ShortcutCard
          href="/testbed/chat"
          icon="sparkle"
          title="Chat with the agent"
          description="Set up runs, read results, write code"
        />
        <ShortcutCard
          href="https://flower.ai/docs"
          icon="docs"
          title="Flower docs"
          description="Framework reference"
          external
        />
      </div>
    </>
  );
}
