"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Download, ChevronLeft, Trash2, Terminal, X } from "lucide-react";
import Dialog from "@/app/components/Dialog";
import Navigation from "@/app/components/Navigation";
import Footer from "@/app/components/Footer";
import MetricsTable from "@/app/components/MetricsTable";
import CheckpointsList from "@/app/components/CheckpointsList";

type Experiment = {
  id: number;
  name: string;
  description: string | null;
  framework: string;
  status: string;
  numClients: number;
  numRounds: number;
  clientFraction: number;
  localEpochs: number;
  learningRate: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  finalAccuracy: number | null;
  finalLoss: number | null;
  errorMessage: string | null;
  logs: string | null;
};

type Metric = {
  id: number;
  round: number;
  trainLoss: number | null;
  trainAccuracy: number | null;
  evalLoss: number | null;
  evalAccuracy: number | null;
  createdAt: string;
};

type Checkpoint = {
  id: number;
  round: number;
  filePath: string;
  accuracy: number | null;
  loss: number | null;
  createdAt: string;
};

type LatestMetrics = {
  round: number;
  trainLoss: number;
  trainAccuracy: number;
  evalLoss: number;
  evalAccuracy: number;
};

type StreamUpdate = {
  experiment: {
    id: number;
    name: string;
    status: string;
    currentRound: number;
    totalRounds: number;
  };
  metrics: Metric[];
  checkpoints: Checkpoint[];
  latestMetrics: LatestMetrics | null;
  status?: string;
  final?: boolean;
};

export default function ExperimentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMetrics, setCurrentMetrics] = useState<LatestMetrics | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
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

  // Fetch initial data
  useEffect(() => {
    fetchExperimentData();
  }, [id]);

  // Set up SSE for real-time updates
  useEffect(() => {
    if (!experiment || (experiment.status !== 'running' && experiment.status !== 'pending')) {
      return;
    }

    const eventSource = new EventSource(`/api/experiments/${id}/stream`);

    eventSource.onmessage = (event) => {
      const data: StreamUpdate = JSON.parse(event.data);

      if (data.final) {
        // Experiment completed, refresh data
        fetchExperimentData();
        eventSource.close();
        return;
      }

      // Update metrics array
      if (data.metrics && data.metrics.length > 0) {
        setMetrics(data.metrics);
      }

      // Update checkpoints array
      if (data.checkpoints && data.checkpoints.length > 0) {
        setCheckpoints(data.checkpoints);
      }

      // Update current metrics for progress display
      if (data.latestMetrics) {
        setCurrentMetrics(data.latestMetrics);
      }

      // Update experiment status
      if (data.experiment) {
        setExperiment((prev) => prev ? { ...prev, status: data.experiment.status } : null);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [experiment?.status, id]);

  const fetchExperimentData = async () => {
    try {
      const response = await fetch(`/api/experiments/${id}`);
      if (!response.ok) throw new Error('Failed to fetch experiment');

      const data = await response.json();
      setExperiment(data.experiment);
      setMetrics(data.metrics);
      setCheckpoints(data.checkpoints);
    } catch (error) {
      console.error('Error fetching experiment:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading experiment...</p>
        </div>
      </div>
    );
  }

  if (!experiment) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Experiment not found</h1>
          <Link
            href="/testbed/experiments"
            className="bg-white text-gray-600 hover:bg-gray-50 border border-gray-200 px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 transition shadow-sm hover:shadow"
          >
            <span>← Back to Experiments</span>
          </Link>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-gray-100 text-gray-800',
      running: 'bg-gray-200 text-gray-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
    };
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${colors[status] || colors.pending}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const currentRound = currentMetrics?.round || metrics[metrics.length - 1]?.round || 0;
  const progress = (currentRound / experiment.numRounds) * 100;

  const handleDeleteClick = () => {
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    try {
      const response = await fetch(`/api/experiments/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete experiment');
      }

      router.push('/testbed/experiments');
    } catch (error) {
      console.error('Error deleting experiment:', error);
      setDialog({
        isOpen: true,
        title: 'Error',
        message: 'Failed to delete experiment. Please try again.',
        type: 'error',
      });
      setShowDeleteDialog(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="mb-6">
          <Navigation />
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-3">
              <Link
                href="/testbed/experiments"
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                title="Back to Experiments"
              >
                <ChevronLeft className="w-6 h-6" />
              </Link>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{experiment.name}</h2>
                {experiment.description && (
                  <p className="text-gray-600 mt-1 text-sm">{experiment.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Status:</span>
                {getStatusBadge(experiment.status)}
                {experiment.logs && (experiment.status === 'completed' || experiment.status === 'failed') && (
                  <button
                    onClick={() => setShowLogs(true)}
                    className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                    title="View Execution Logs"
                  >
                    <Terminal className="w-5 h-5" />
                  </button>
                )}
              </div>
              <button
                onClick={handleDeleteClick}
                className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                title="Delete Experiment"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Progress Bar (for running experiments) */}
        {experiment.status === 'running' && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold">Progress</h2>
              <span className="text-sm text-gray-600">
                Round {currentRound} / {experiment.numRounds}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-gray-700 h-3 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            {currentMetrics && (
              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Train Loss:</span>
                  <span className="ml-2 font-semibold">{currentMetrics.trainLoss?.toFixed(4)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Train Accuracy:</span>
                  <span className="ml-2 font-semibold">{(currentMetrics.trainAccuracy! * 100).toFixed(2)}%</span>
                </div>
                <div>
                  <span className="text-gray-600">Eval Loss:</span>
                  <span className="ml-2 font-semibold">{currentMetrics.evalLoss?.toFixed(4)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Eval Accuracy:</span>
                  <span className="ml-2 font-semibold">{(currentMetrics.evalAccuracy! * 100).toFixed(2)}%</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Configuration */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Configuration</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Framework:</span>
              <p className="font-semibold">{experiment.framework}</p>
            </div>
            <div>
              <span className="text-gray-600">Clients:</span>
              <p className="font-semibold">{experiment.numClients}</p>
            </div>
            <div>
              <span className="text-gray-600">Rounds:</span>
              <p className="font-semibold">{experiment.numRounds}</p>
            </div>
            <div>
              <span className="text-gray-600">Client Fraction:</span>
              <p className="font-semibold">{(experiment.clientFraction * 100).toFixed(0)}%</p>
            </div>
            <div>
              <span className="text-gray-600">Local Epochs:</span>
              <p className="font-semibold">{experiment.localEpochs}</p>
            </div>
            <div>
              <span className="text-gray-600">Learning Rate:</span>
              <p className="font-semibold">{experiment.learningRate}</p>
            </div>
            <div>
              <span className="text-gray-600">Created:</span>
              <p className="font-semibold">{new Date(experiment.createdAt).toLocaleString()}</p>
            </div>
            {experiment.completedAt && (
              <div>
                <span className="text-gray-600">Completed:</span>
                <p className="font-semibold">{new Date(experiment.completedAt).toLocaleString()}</p>
              </div>
            )}
          </div>
        </div>

        {/* Final Results */}
        {experiment.status === 'completed' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-green-900 mb-4">Final Results</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <span className="text-green-700">Final Accuracy:</span>
                <p className="text-2xl font-bold text-green-900">
                  {experiment.finalAccuracy ? (experiment.finalAccuracy * 100).toFixed(2) : '—'}%
                </p>
              </div>
              <div>
                <span className="text-green-700">Final Loss:</span>
                <p className="text-2xl font-bold text-green-900">
                  {experiment.finalLoss?.toFixed(4) || '—'}
                </p>
              </div>
              <div>
                <span className="text-green-700">Duration:</span>
                <p className="text-2xl font-bold text-green-900">
                  {experiment.startedAt && experiment.completedAt
                    ? (() => {
                        const ms = new Date(experiment.completedAt).getTime() - new Date(experiment.startedAt).getTime();
                        const seconds = Math.floor(ms / 1000);
                        const minutes = Math.floor(seconds / 60);
                        const hours = Math.floor(minutes / 60);
                        if (hours > 0) return `${hours}h ${minutes % 60}m`;
                        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
                        return `${seconds}s`;
                      })()
                    : '—'}
                </p>
              </div>
              {checkpoints.length > 0 && (
                <div>
                  <span className="text-green-700">Final Model:</span>
                  <p>
                    <a
                        href={`/api/checkpoints/${checkpoints[checkpoints.length - 1]?.filePath.replace('checkpoints-data/', '')}`}
                        download
                        className="mt-1 inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </a>
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error Message */}
        {experiment.status === 'failed' && experiment.errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold mb-2 text-red-900">Error</h2>
            <p className="text-red-700">{experiment.errorMessage}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <MetricsTable metrics={metrics} />
          <CheckpointsList checkpoints={checkpoints} totalRounds={experiment.numRounds} />
        </div>

        <Footer />
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
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

      {/* Logs Modal */}
      {showLogs && experiment.logs && (
        <div
          className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowLogs(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-200 rounded-lg">
                  <Terminal className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Execution Logs</h2>
                  <p className="text-xs text-gray-500">{experiment.name}</p>
                </div>
              </div>
              <button
                onClick={() => setShowLogs(false)}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-4 bg-gray-100">
              <pre className="bg-white border border-gray-200 rounded-lg p-4 text-gray-800 text-sm font-mono leading-relaxed whitespace-pre-wrap shadow-sm">
                {experiment.logs}
              </pre>
            </div>
            {/* Modal Footer */}
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
              <span className="text-sm text-gray-500">
                {experiment.logs.split('\n').length} lines
              </span>
              <button
                onClick={() => setShowLogs(false)}
                className="px-4 py-2 text-sm font-medium text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}