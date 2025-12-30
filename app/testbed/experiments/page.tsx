"use client";

import { useEffect, useState } from "react";
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
  createdAt: string;
  completedAt: string | null;
  finalAccuracy: number | null;
  finalLoss: number | null;
};

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
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
            <Link
              href="/testbed/experiments/new"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition font-medium"
            >
              + New Experiment
            </Link>
          </div>
        </div>

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
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {experiments.map((exp) => (
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

                    {exp.status === 'completed' && exp.finalAccuracy !== null && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="flex gap-6 text-sm">
                          <span className="text-green-700">
                            Final Accuracy: <strong>{(exp.finalAccuracy * 100).toFixed(2)}%</strong>
                          </span>
                          <span className="text-gray-700">
                            Final Loss: <strong>{exp.finalLoss?.toFixed(4)}</strong>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 ml-4">
                    <Link
                      href={`/testbed/experiments/${exp.id}`}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium px-3 py-1 rounded hover:bg-blue-50"
                    >
                      View
                    </Link>
                    <button
                      onClick={() => handleDeleteClick(exp.id)}
                      className="text-red-600 hover:text-red-800 text-sm font-medium px-3 py-1 rounded hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
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