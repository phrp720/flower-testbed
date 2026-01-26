"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, Zap, CheckCircle2, AlertCircle, ChevronRight, Plus, ClipboardList, BookOpen } from "lucide-react";
import Navigation from "@/app/components/Navigation";
import Footer from "@/app/components/Footer";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

type Experiment = {
  id: number;
  name: string;
  status: string;
  framework: string;
  numClients: number;
  numRounds: number;
  createdAt: string;
  finalAccuracy: number | null;
  finalLoss: number | null;
};

export default function DashboardPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);

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

  // Calculate stats
  const totalExperiments = experiments.length;
  const runningExperiments = experiments.filter(e => e.status === 'running').length;
  const completedExperiments = experiments.filter(e => e.status === 'completed').length;
  const failedExperiments = experiments.filter(e => e.status === 'failed').length;

  const recentExperiments = experiments.slice(-5).reverse();


  // Prepare chart data
  const accuracyTrendData = experiments
    .filter(e => e.status === 'completed' && e.finalAccuracy !== null)
    .slice(-10)
    .map((exp, idx) => ({
      name: `Exp ${idx + 1}`,
      accuracy: exp.finalAccuracy ? (exp.finalAccuracy * 100) : 0,
      loss: exp.finalLoss || 0,
    }));

  // Framework distribution data
  const frameworkCounts = experiments.reduce((acc, exp) => {
    acc[exp.framework] = (acc[exp.framework] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const frameworkColors = [
    '#3b82f6', // blue
    '#8b5cf6', // purple
    '#10b981', // green
    '#f59e0b', // amber
    '#ef4444', // red
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#84cc16', // lime
    '#f97316', // orange
    '#6366f1', // indigo
  ];

  const frameworkData = Object.entries(frameworkCounts).map(([name, value], index) => ({
    name,
    experiments: value,
    fill: frameworkColors[index % frameworkColors.length],
  }));

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-gray-100 text-gray-800',
      running: 'bg-blue-200 text-blue-800 animate-pulse',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || colors.pending}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
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
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
              <p className="text-gray-600 text-sm mt-1">Overview of your federated learning experiments</p>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Experiments</p>
                <p className="text-3xl font-bold text-gray-900">{totalExperiments}</p>
              </div>
              <div className="bg-gray-100 p-3 rounded-lg">
                <BarChart3 className="w-6 h-6 text-gray-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Running</p>
                <p className="text-3xl font-bold text-gray-800">{runningExperiments}</p>
              </div>
              <div className="bg-yellow-100 p-3 rounded-lg">
                <Zap className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Completed</p>
                <p className="text-3xl font-bold text-gray-600">{completedExperiments}</p>
              </div>
              <div className="bg-green-100 p-3 rounded-lg">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Failed</p>
                <p className="text-3xl font-bold text-gray-600">{failedExperiments}</p>
              </div>
              <div className="bg-red-100 p-3 rounded-lg">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Analytics Charts */}
        {(
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Framework Distribution Chart */}
            {(
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Framework Distribution</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={frameworkData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" stroke="#6b7280" />
                    <YAxis stroke="#6b7280" allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                    />
                    <Bar dataKey="experiments" name="experiments" maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Average Performance Metrics */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Performance Summary</h2>
              <div className="space-y-4">
                {(() => {
                  const completedWithAccuracy = experiments.filter(e => e.status === 'completed' && e.finalAccuracy !== null);
                  const avgAccuracy = completedWithAccuracy.length > 0
                    ? (completedWithAccuracy.reduce((sum, e) => sum + (e.finalAccuracy || 0), 0) / completedWithAccuracy.length) * 100
                    : 0;
                  const getBarColor = (pct: number) => {
                    if (pct >= 70) return 'bg-green-500';
                    if (pct >= 40) return 'bg-yellow-500';
                    return 'bg-red-500';
                  };
                  return (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-600">Average Accuracy</span>
                        <span className="text-lg font-bold text-black-600">
                          {avgAccuracy.toFixed(2)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`${getBarColor(avgAccuracy)} h-2 rounded-full`}
                          style={{ width: `${avgAccuracy}%` }}
                        />
                      </div>
                    </div>
                  );
                })()}

                {(() => {
                  const successRate = totalExperiments > 0 ? (completedExperiments / totalExperiments) * 100 : 0;
                  const getBarColor = (pct: number) => {
                    if (pct >= 70) return 'bg-green-500';
                    if (pct >= 40) return 'bg-yellow-500';
                    return 'bg-red-500';
                  };
                  return (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-600">Success Rate</span>
                        <span className="text-lg font-bold text-gray-800">
                          {successRate.toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`${getBarColor(successRate)} h-2 rounded-full`}
                          style={{ width: `${successRate}%` }}
                        />
                      </div>
                    </div>
                  );
                })()}

                <div className="pt-4 border-t">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Total Rounds</p>
                      <p className="text-xl font-bold text-gray-900">
                        {experiments.reduce((sum, e) => sum + e.numRounds, 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">Total Clients</p>
                      <p className="text-xl font-bold text-gray-900">
                        {experiments.reduce((sum, e) => sum + e.numClients, 0)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Recent Experiments */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Recent Experiments</h2>
            </div>
          </div>

          {recentExperiments.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-500 mb-4">No experiments yet</p>
              <Link
                href="/testbed/experiments/new"
                className="inline-block bg-gray-800 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition font-medium"
              >
                Create Your First Experiment
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {recentExperiments.map((exp) => (
                <Link
                  key={exp.id}
                  href={`/testbed/experiments/${exp.id}`}
                  className="block p-6 hover:bg-gray-50 transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900 hover:text-gray-600">
                          {exp.name}
                        </h3>
                        {getStatusBadge(exp.status)}
                      </div>
                      <div className="flex gap-4 text-sm text-gray-600">
                        <span>Framework: <strong>{exp.framework}</strong></span>
                        <span>Clients: <strong>{exp.numClients}</strong></span>
                        <span>Rounds: <strong>{exp.numRounds}</strong></span>
                        <span>{new Date(exp.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <Link
            href="/testbed/experiments/new"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition"
          >
            <div className="flex items-center gap-4">
              <div className="bg-gray-100 p-3 rounded-lg">
                <Plus className="w-6 h-6 text-gray-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">New Experiment</h3>
                <p className="text-sm text-gray-600">Create and run a new FL experiment</p>
              </div>
            </div>
          </Link>

          <Link
            href="/testbed/experiments"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition"
          >
            <div className="flex items-center gap-4">
              <div className="bg-gray-100 p-3 rounded-lg">
                <ClipboardList className="w-6 h-6 text-gray-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Execution History</h3>
                <p className="text-sm text-gray-600">Browse all experiments</p>
              </div>
            </div>
          </Link>

          <a
            href="https://flower.ai/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition"
          >
            <div className="flex items-center gap-4">
              <div className="bg-gray-100 p-3 rounded-lg">
                <BookOpen className="w-6 h-6 text-gray-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Documentation</h3>
                <p className="text-sm text-gray-600">Learn about Flower FL</p>
              </div>
            </div>
          </a>
        </div>

        <Footer />
      </div>
    </div>
  );
}