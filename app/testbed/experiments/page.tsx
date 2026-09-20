"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Dialog from "@/app/components/Dialog";
import {
  Button,
  Card,
  ChipToggleGroup,
  EmptyState,
  Icon,
  LinkButton,
  PageHeader,
  Pagination,
  StatusBadge,
  Spinner,
  CONTROL,
} from "@/app/components/ui";
import { useDeleteExperiment, useExperiments } from "@/app/hooks/useExperiments";

const PER_PAGE = 10;

/** The statuses the runner can write, in the order a run moves through them. */
const STATUSES = ["pending", "running", "completed", "failed"] as const;

export default function ExperimentsPage() {
  const { data: experiments = [], isLoading } = useExperiments();
  const deleteExperiment = useDeleteExperiment();

  // Empty means no status filter, which is what an untouched filter bar should do.
  const [statuses, setStatuses] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const isDeleting = deleteExperiment.isPending;

  const filtered = useMemo(
    () =>
      experiments.filter((exp) => {
        const byStatus = statuses.length === 0 || statuses.includes(exp.status);
        const byName = exp.name.toLowerCase().includes(search.toLowerCase());
        return byStatus && byName;
      }),
    [experiments, statuses, search]
  );

  const statusOptions = useMemo(() => {
    const counts = experiments.reduce<Record<string, number>>((acc, exp) => {
      acc[exp.status] = (acc[exp.status] ?? 0) + 1;
      return acc;
    }, {});

    return STATUSES.map((status) => ({
      value: status,
      label: status[0].toUpperCase() + status.slice(1),
      count: counts[status] ?? 0,
    }));
  }, [experiments]);

  const pageCount = Math.ceil(filtered.length / PER_PAGE);
  const visible = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // A filter that shortens the list can strand the reader on a page that no
  // longer exists, so narrowing always returns them to the first one.
  useEffect(() => setPage(1), [statuses, search]);

  const clearFilters = () => {
    setSearch("");
    setStatuses([]);
  };

  const confirmDelete = () => {
    if (!deleteId) return;
    // The mutation invalidates the experiment cache on success, so the list
    // refreshes itself -- and so does the dashboard, which shares the key.
    deleteExperiment.mutate(deleteId, {
      onSuccess: () => setDeleteId(null),
      onError: (err) =>
        setError(err instanceof Error ? err.message : "Failed to delete experiment."),
    });
  };

  return (
    <>
      <PageHeader
        title="Experiments"
        description="Every federated learning run, newest first."
        actions={
          <LinkButton href="/testbed/experiments/new" variant="primary" icon="add">
            New experiment
          </LinkButton>
        }
      />

      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-5">
        <div className="relative lg:max-w-sm lg:flex-1">
          <Icon
            name="search"
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle pointer-events-none"
          />
          <input
            type="search"
            placeholder="Search by name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${CONTROL} h-9 pl-9 pr-3`}
          />
        </div>

        <ChipToggleGroup
          label="Filter by status"
          options={statusOptions}
          selected={statuses}
          onChange={setStatuses}
        />

        {(statuses.length > 0 || search) && (
          <Button size="sm" variant="ghost" onClick={clearFilters} className="lg:ml-auto">
            Clear
          </Button>
        )}
      </div>

      {isLoading ? (
        <Card className="flex justify-center py-16">
          <Spinner size={18} label="Loading experiments" />
        </Card>
      ) : experiments.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon="experiments"
            title="No experiments yet"
            description="Configure a federation, pick a dataset, and watch it train round by round."
            action={
              <LinkButton href="/testbed/experiments/new" variant="primary" icon="add">
                Create your first experiment
              </LinkButton>
            }
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon="search"
            title="Nothing matches those filters"
            description={`${experiments.length} experiments are hidden by the current search and filters.`}
            action={<Button onClick={clearFilters}>Clear filters</Button>}
          />
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            {visible.map((exp) => (
              <Card
                key={exp.id}
                padded={false}
                className="group hover:border-line-strong transition-colors"
              >
                <div className="flex items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <Link
                        href={`/testbed/experiments/${exp.id}`}
                        title={exp.name}
                        className="text-sm font-medium text-ink truncate hover:underline underline-offset-2"
                      >
                        {exp.name}
                      </Link>
                      <StatusBadge status={exp.status} />
                    </div>
                    {/* Configuration reads as one quiet line: it is context for
                        the name, not four separate facts to weigh. */}
                    <p className="text-xs text-ink-muted tabular">
                      {exp.framework} · {exp.numClients} clients · {exp.numRounds} rounds ·{" "}
                      {new Date(exp.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Always visible. Revealing these on hover kept the list
                      quiet but made the only way to open or delete a run
                      something you had to discover, and left them unreachable
                      on touch. Muted colour does the quietening instead. */}
                  <div className="flex items-center gap-1 shrink-0">
                    <LinkButton
                      href={`/testbed/experiments/${exp.id}`}
                      size="sm"
                      variant="ghost"
                      icon="view"
                      title="Open experiment"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="delete"
                      title="Delete experiment"
                      className="hover:text-danger hover:bg-danger-surface"
                      loading={isDeleting && deleteId === exp.id}
                      onClick={() => setDeleteId(exp.id)}
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <Pagination
            page={page}
            pageCount={pageCount}
            onChange={setPage}
            className="mt-4"
          />
        </>
      )}

      <Dialog
        isOpen={deleteId !== null}
        onClose={() => {
          if (!isDeleting) setDeleteId(null);
        }}
        title="Delete experiment"
        message="This removes the experiment, its metrics and its checkpoints. It cannot be undone."
        type="confirm"
        onConfirm={confirmDelete}
        confirmText="Delete"
        isLoading={isDeleting}
        loadingText="Deleting"
      />

      <Dialog
        isOpen={error !== null}
        onClose={() => setError(null)}
        title="Could not delete"
        message={error ?? ""}
        type="error"
      />
    </>
  );
}
