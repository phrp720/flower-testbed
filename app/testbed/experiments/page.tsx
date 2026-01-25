"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, Eye, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import Dialog from "@/app/components/Dialog";
import Navigation from "@/app/components/Navigation";
import Footer from "@/app/components/Footer";

type Experiment = {
  id: number;
  name: string;
  description: string | null;
  framework: string;
  status: string;
  numClients: number;
  numRounds: number;
  createdAt: string;
  completedAt: string | null;
  finalAccuracy: number | null;
  finalLoss: number | null;
};

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'info' | 'error' | 'success' | 'warning';
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
  });
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchExperiments();
  }, []);

  const fetchExperiments = async () => {
    try {
      const response = await fetch('/api/experiments');
      if (!response.ok) throw new Error('Failed to fetch experiments');

      const data = await response.json();
      setExperiments(data.experiments);
    } catch (error) {
      console.error('Error fetching experiments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (id: number) => {
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    if (deleteId === null) return;

    try {
      const response = await fetch(`/api/experiments/${deleteId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete experiment');

      // Refresh list
      fetchExperiments();
      setDeleteId(null);
    } catch (error) {
      console.error('Error deleting experiment:', error);
      setDialog({
        isOpen: true,
        title: 'Error',
        message: 'Failed to delete experiment. Please try again.',
        type: 'error',
      });
      setDeleteId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-gray-100 text-gray-800',
      running: 'bg-blue-100 text-blue-800 animate-pulse',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
    };
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${colors[status] || colors.pending}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const filteredExperiments = experiments.filter((exp) => {
    const matchesStatus = statusFilter === 'all' || exp.status === statusFilter;
    const matchesPlatform = platformFilter === 'all' || exp.framework === platformFilter;
    const matchesSearch = exp.name.toLowerCase().includes(searchQuery.toLowerCase());
                          // || exp.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesPlatform && matchesSearch;
  });

  const totalPages = Math.ceil(filteredExperiments.length / itemsPerPage);
  const paginatedExperiments = filteredExperiments.slice(
    (page - 1) * itemsPerPage,
    page * itemsPerPage
  );

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, platformFilter, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading experiments...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <Navigation />
          <div className="flex items-center justify-between mt-4">
            <h2 className="text-2xl font-bold text-gray-900">Experiments</h2>
          </div>
        </div>

        {/* Search and Filter */}
        {(
          <div className="mb-6 flex flex-col sm:flex-row gap-4">
            {/* Search Bar */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search experiments..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Status Filter */}
            <div className="sm:w-48">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIiIGhlaWdodD0iOCIgdmlld0JveD0iMCAwIDEyIDgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTEgMS41TDYgNi41TDExIDEuNSIgc3Ryb2tlPSIjNjY2IiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9zdmc+')] bg-[right_0.75rem_center] bg-no-repeat"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="running">Running</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            {/* Platform Filter */}
            <div className="sm:w-48">
              <select
                value={platformFilter}
                onChange={(e) => setPlatformFilter(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIiIGhlaWdodD0iOCIgdmlld0JveD0iMCAwIDEyIDgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTEgMS41TDYgNi41TDExIDEuNSIgc3Ryb2tlPSIjNjY2IiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9zdmc+')] bg-[right_0.75rem_center] bg-no-repeat"
              >
                <option value="all">All Platforms</option>
                <option value="pytorch">PyTorch</option>
                <option value="tensorflow">TensorFlow</option>
                <option value="sklearn">scikit-learn</option>
                <option value="huggingface">Hugging Face</option>
                <option value="jax">JAX</option>
                <option value="mlx">MLX</option>
                <option value="numpy">NumPy</option>
                <option value="xgboost">XGBoost</option>
                <option value="flowertune">FlowerTune</option>
                <option value="flower-baseline">Flower Baseline</option>
              </select>
            </div>
          </div>
        )}

        {/* Experiments List */}
        {experiments.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-500 mb-4">No experiments yet</p>
              <Link
                  href="/testbed/experiments/new"
                  className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-medium"
              >
                  Create Your First Experiment
              </Link>
          </div>
        ) : filteredExperiments.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-500 mb-4">No experiments match your filters</p>
            <button
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
                setPlatformFilter('all');
              }}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {paginatedExperiments.map((exp) => (
              <div
                key={exp.id}
                className="bg-white rounded-lg shadow hover:shadow-lg transition p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Link
                        href={`/testbed/experiments/${exp.id}`}
                        className="text-xl font-semibold text-gray-900 hover:text-blue-600"
                      >
                        {exp.name}
                      </Link>
                      {getStatusBadge(exp.status)}
                    </div>

                    {exp.description && (
                      <p className="text-gray-600 text-sm mb-3">{exp.description}</p>
                    )}

                    <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                      <span>Framework: <strong>{exp.framework}</strong></span>
                      <span>Clients: <strong>{exp.numClients}</strong></span>
                      <span>Rounds: <strong>{exp.numRounds}</strong></span>
                      <span>Created: <strong>{new Date(exp.createdAt).toLocaleDateString()}</strong></span>
                    </div>
                  </div>

                  <div className="flex gap-1 ml-4">
                    <Link
                      href={`/testbed/experiments/${exp.id}`}
                      className="p-2 text-blue-600 hover:text-blue-800 rounded-lg hover:bg-blue-50 transition-colors"
                      title="View experiment"
                    >
                      <Eye className="w-5 h-5" />
                    </Link>
                    <button
                      onClick={() => handleDeleteClick(exp.id)}
                      className="p-2 text-red-600 hover:text-red-800 rounded-lg hover:bg-red-50 transition-colors"
                      title="Delete experiment"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {filteredExperiments.length > itemsPerPage && (
          <div className="flex items-center justify-between mt-6 bg-white rounded-lg shadow px-4 py-3">
            <span className="text-sm text-gray-600">
              Showing {(page - 1) * itemsPerPage + 1}-{Math.min(page * itemsPerPage, filteredExperiments.length)} of {filteredExperiments.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-1 px-2">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (page <= 3) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`w-9 h-9 text-sm font-medium rounded-lg transition-colors ${
                        page === pageNum
                          ? 'bg-blue-600 text-white'
                          : 'hover:bg-gray-100 text-gray-600'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        <Footer />
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        title="Delete Experiment"
        message="Are you sure you want to delete this experiment? This action cannot be undone."
        type="confirm"
        onConfirm={confirmDelete}
        confirmText="Delete"
        cancelText="Cancel"
      />

      {/* Error Dialog */}
      <Dialog
        isOpen={dialog.isOpen}
        onClose={() => setDialog({ ...dialog, isOpen: false })}
        title={dialog.title}
        message={dialog.message}
        type={dialog.type}
      />
    </div>
  );
}