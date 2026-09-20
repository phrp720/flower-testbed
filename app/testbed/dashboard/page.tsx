"use client";

import { useMemo } from "react";
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
  LinkButton,
  PageHeader,
  Progress,
  SectionLabel,
  Spinner,
  Stat,
  StatusBadge,
  type IconName,
} from "@/app/components/ui";
import { useExperiments } from "@/app/hooks/useExperiments";

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

export default function DashboardPage() {
  const { data: experiments = [], isLoading } = useExperiments();

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

    // Oldest to newest, so the line reads left to right as time. The list
    // arrives newest first, which would otherwise plot the trend backwards.
    const trend = [...scored]
      .reverse()
      .slice(-12)
      .map((exp) => ({
        name: exp.name,
        accuracy: (exp.finalAccuracy ?? 0) * 100,
        clients: exp.numClients,
        rounds: exp.numRounds,
      }));

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
            title="Accuracy over time"
            description="Final accuracy of each completed run, oldest to newest."
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
                <XAxis dataKey="name" hide />
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
                  formatter={(value?: number) => [
                    value != null ? `${value.toFixed(1)}%` : "-",
                    "accuracy",
                  ]}
                  labelFormatter={(label: string) => label}
                />
                <Line
                  type="monotone"
                  dataKey="accuracy"
                  stroke="var(--ink)"
                  strokeWidth={1.75}
                  dot={{ r: 2.5, strokeWidth: 0, fill: "var(--ink)" }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-4 mt-4 border-t border-line">
            <SectionLabel>Frameworks</SectionLabel>
            {summary.frameworks.map((entry) => (
              <span key={entry.name} className="text-xs text-ink-muted tabular">
                {entry.name} <span className="text-ink font-medium">{entry.count}</span>
              </span>
            ))}
            {summary.frameworks.length === 0 && (
              <span className="text-xs text-ink-subtle">none</span>
            )}
          </div>
        </Card>
      </div>

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
