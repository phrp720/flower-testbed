"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Dialog from "@/app/components/Dialog";
import {
  Button,
  Card,
  EmptyState,
  Icon,
  LinkButton,
  PageHeader,
  Pagination,
  Select,
  StatusBadge,
  Spinner,
  CONTROL,
} from "@/app/components/ui";
import { useDeleteExperiment, useExperiments } from "@/app/hooks/useExperiments";

const PER_PAGE = 10;

export default function ExperimentsPage() {
  const { data: experiments = [], isLoading } = useExperiments();
  const deleteExperiment = useDeleteExperiment();

  const [statusFilter, setStatusFilter] = useState("all");
  const [frameworkFilter, setFrameworkFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const isDeleting = deleteExperiment.isPending;

  const filtered = useMemo(
    () =>
      experiments.filter((exp) => {
        const byStatus = statusFilter === "all" || exp.status === statusFilter;
        const byFramework = frameworkFilter === "all" || exp.framework === frameworkFilter;
        const byName = exp.name.toLowerCase().includes(search.toLowerCase());
        return byStatus && byFramework && byName;
      }),
    [experiments, statusFilter, frameworkFilter, search]
  );

  const pageCount = Math.ceil(filtered.length / PER_PAGE);
  const visible = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // A filter that shortens the list can strand the reader on a page that no
  // longer exists, so narrowing always returns them to the first one.
  useEffect(() => setPage(1), [statusFilter, frameworkFilter, search]);

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setFrameworkFilter("all");
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

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
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
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
          wrapperClassName="sm:w-40"
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </Select>
        <Select
          value={frameworkFilter}
          onChange={(e) => setFrameworkFilter(e.target.value)}
          aria-label="Filter by framework"
          wrapperClassName="sm:w-40"
        >
          <option value="all">All frameworks</option>
          <option value="pytorch">PyTorch</option>
          <option value="tensorflow" disabled>TensorFlow</option>
        </Select>
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
