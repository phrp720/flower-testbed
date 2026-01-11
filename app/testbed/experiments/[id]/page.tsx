"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  clientFraction: number;
  localEpochs: number;
  learningRate: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  finalAccuracy: number | null;
  finalLoss: number | null;
  errorMessage: string | null;
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

type StreamUpdate = {
  experiment: {
    id: number;
    name: string;
    status: string;
    currentRound: number;
    totalRounds: number;
  };
  metrics: {
    round: number;
    trainLoss: number;
    trainAccuracy: number;
    evalLoss: number;
    evalAccuracy: number;
  } | null;
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
  const [currentMetrics, setCurrentMetrics] = useState<StreamUpdate['metrics'] | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
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

      if (data.metrics) {
        setCurrentMetrics(data.metrics);
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
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
      running: 'bg-blue-100 text-blue-800',
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
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-6">
          <Navigation />
          <div className="flex items-center justify-between mt-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{experiment.name}</h2>
              {experiment.description && (
                <p className="text-gray-600 mt-1 text-sm">{experiment.description}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              {getStatusBadge(experiment.status)}
              <button
                onClick={handleDeleteClick}
                className="bg-red-600 text-white hover:bg-red-700 px-4 py-2 rounded-lg text-sm font-medium transition"
              >
                Delete
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
                className="bg-blue-600 h-3 rounded-full transition-all duration-500"
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
            <h2 className="text-lg font-semibold mb-4 text-green-900">Final Results</h2>
            <div className="grid grid-cols-2 gap-4">
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
          {/* Metrics Table */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Metrics by Round</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left">Round</th>
                    <th className="px-4 py-2 text-left">Train Loss</th>
                    <th className="px-4 py-2 text-left">Eval Acc</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                        No metrics yet
                      </td>
                    </tr>
                  ) : (
                    metrics.map((m) => (
                      <tr key={m.id} className="border-t">
                        <td className="px-4 py-2">{m.round}</td>
                        <td className="px-4 py-2">{m.trainLoss?.toFixed(4) || '—'}</td>
                        <td className="px-4 py-2">
                          {m.evalAccuracy ? (m.evalAccuracy * 100).toFixed(2) + '%' : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Checkpoints */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Model Checkpoints</h2>
            <div className="space-y-2">
              {checkpoints.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No checkpoints yet</p>
              ) : (
                checkpoints.map((cp) => (
                  <div key={cp.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <div>
                      <p className="font-medium">Round {cp.round}</p>
                      <p className="text-xs text-gray-600">
                        Acc: {cp.accuracy ? (cp.accuracy * 100).toFixed(2) + '%' : '—'} |
                        Loss: {cp.loss?.toFixed(4) || '—'}
                      </p>
                    </div>
                    <a
                      href={`/${cp.filePath}`}
                      download
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      Download
                    </a>
                  </div>
                ))
              )}
            </div>
          </div>
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
    </div>
  );
}