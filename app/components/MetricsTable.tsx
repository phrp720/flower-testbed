"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp, Minus, BarChart3 } from "lucide-react";

type Metric = {
  id: number;
  round: number;
  trainLoss: number | null;
  trainAccuracy: number | null;
  evalLoss: number | null;
  evalAccuracy: number | null;
  createdAt: string;
};

type MetricsTableProps = {
  metrics: Metric[];
  itemsPerPage?: number;
};

export default function MetricsTable({ metrics, itemsPerPage = 5 }: MetricsTableProps) {
  const [page, setPage] = useState(1);
  const totalPages = Math.ceil(metrics.length / itemsPerPage);

  const paginatedMetrics = metrics.slice(
    (page - 1) * itemsPerPage,
    page * itemsPerPage
  );

  const getTrend = (current: number | null, index: number, field: 'trainLoss' | 'evalAccuracy') => {
    if (current === null || index === 0) return null;
    const prevMetric = metrics[index - 1];
    const prev = prevMetric?.[field];
    if (prev === null || prev === undefined) return null;

    // For loss, down is good. For accuracy, up is good.
    if (field === 'trainLoss') {
      if (current < prev) return 'good';
      if (current > prev) return 'bad';
    } else {
      if (current > prev) return 'good';
      if (current < prev) return 'bad';
    }
    return 'neutral';
  };

  const TrendIcon = ({ trend }: { trend: 'good' | 'bad' | 'neutral' | null }) => {
    if (!trend) return null;
    if (trend === 'good') return <TrendingUp className="w-3 h-3 text-green-500" />;
    if (trend === 'bad') return <TrendingDown className="w-3 h-3 text-red-500" />;
    return <Minus className="w-3 h-3 text-gray-400" />;
  };

  const AccuracyBar = ({ value }: { value: number | null }) => {
    if (value === null) return <span className="text-gray-400">—</span>;
    const percentage = value * 100;
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-gray-200 rounded-full h-2 min-w-[60px]">
          <div
            className={`h-2 rounded-full transition-all ${
              percentage >= 80 ? 'bg-green-500' : percentage >= 50 ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            style={{ width: `${Math.min(100, percentage)}%` }}
          />
        </div>
        <span className="text-xs font-medium w-14 text-right">{percentage.toFixed(1)}%</span>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 h-[420px] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-50 rounded-lg">
            <BarChart3 className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Metrics by Round</h2>
            <p className="text-xs text-gray-500">{metrics.length} rounds recorded</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto min-h-0">
        {metrics.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <BarChart3 className="w-12 h-12 text-gray-300 mb-2" />
            <p className="text-sm">No metrics recorded yet</p>
            <p className="text-xs text-gray-400">Metrics will appear here once training begins</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Round
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Train Loss
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Train Acc
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Eval Acc
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedMetrics.map((m, idx) => {
                const globalIdx = (page - 1) * itemsPerPage + idx;
                return (
                  <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-semibold text-sm">
                        {m.round}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <span className={`font-mono ${m.trainLoss !== null ? 'text-gray-900' : 'text-gray-400'}`}>
                          {m.trainLoss?.toFixed(4) || '—'}
                        </span>
                        <TrendIcon trend={getTrend(m.trainLoss, globalIdx, 'trainLoss')} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <AccuracyBar value={m.trainAccuracy} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <AccuracyBar value={m.evalAccuracy} />
                        <TrendIcon trend={getTrend(m.evalAccuracy, globalIdx, 'evalAccuracy')} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50">
          <span className="text-xs text-gray-500">
            Showing {(page - 1) * itemsPerPage + 1}-{Math.min(page * itemsPerPage, metrics.length)} of {metrics.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
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
                    className={`w-8 h-8 text-xs font-medium rounded-lg transition-colors ${
                      page === pageNum
                        ? 'bg-blue-600 text-white'
                        : 'hover:bg-gray-200 text-gray-600'
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
              className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}