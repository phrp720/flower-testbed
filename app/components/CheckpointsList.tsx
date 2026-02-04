"use client";

import { useState } from "react";
import { Download, HardDrive, Clock, FileDown, ChevronLeft, ChevronRight, Flag } from "lucide-react";

type Checkpoint = {
  id: number;
  round: number;
  filePath: string;
  accuracy: number | null;
  loss: number | null;
  createdAt: string;
};

type CheckpointsListProps = {
  checkpoints: Checkpoint[];
  totalRounds?: number;
  itemsPerPage?: number;
};

export default function CheckpointsList({ checkpoints, totalRounds, itemsPerPage = 6 }: CheckpointsListProps) {
  const [page, setPage] = useState(1);
  const totalPages = Math.ceil(checkpoints.length / itemsPerPage);

  const paginatedCheckpoints = checkpoints.slice(
    (page - 1) * itemsPerPage,
    page * itemsPerPage
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getAccuracyColor = (accuracy: number | null) => {
    if (accuracy === null) return 'text-gray-400';
    const pct = accuracy * 100;
    if (pct >= 80) return 'text-green-600';
    if (pct >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getAccuracyBg = (accuracy: number | null) => {
    if (accuracy === null) return 'bg-gray-100';
    const pct = accuracy * 100;
    if (pct >= 80) return 'bg-green-50 border-green-200';
    if (pct >= 60) return 'bg-yellow-50 border-yellow-200';
    return 'bg-red-50 border-red-200';
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 h-[520px] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-gray-50 rounded-lg">
            <HardDrive className="w-5 h-5 text-gray-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Model Checkpoints</h2>
            <p className="text-xs text-gray-500">{checkpoints.length} checkpoints saved</p>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto min-h-0 p-2">
        {checkpoints.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <HardDrive className="w-12 h-12 text-gray-300 mb-2" />
            <p className="text-sm">No checkpoints saved yet</p>
            <p className="text-xs text-gray-400">Checkpoints will appear here after each round</p>
          </div>
        ) : (
          <div className="space-y-2">
            {paginatedCheckpoints.map((cp) => {
              // Only mark as final if this checkpoint's round equals the total rounds
              const isFinal = totalRounds !== undefined && cp.round === totalRounds;
              return (
                <div
                  key={cp.id}
                  className={`relative flex items-center gap-3 p-3 rounded-lg border transition-all hover:shadow-sm ${
                    isFinal
                      ? 'bg-green-50 border-green-200 hover:border-green-300'
                      : 'bg-gray-50 border-gray-100 hover:border-gray-200'
                  }`}
                >
                  {/* Round Badge */}
                  <div className={`flex-shrink-0 w-12 h-12 rounded-lg flex flex-col items-center justify-center ${
                    isFinal ? 'bg-green-100 border border-green-200' : 'bg-white border border-gray-200'
                  }`}>
                    <span className="text-[10px] text-gray-500 uppercase font-medium">Round</span>
                    <span className={`text-lg font-bold ${isFinal ? 'text-green-700' : 'text-gray-700'}`}>
                      {cp.round}
                    </span>
                  </div>

                  {/* Metrics */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {isFinal && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold text-green-700 bg-green-100 rounded">
                          <Flag className="w-3 h-3" />
                          FINAL
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-[10px] text-gray-400">
                        <Clock className="w-3 h-3" />
                        {formatDate(cp.createdAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className={`px-2 py-1 rounded text-xs font-medium border ${getAccuracyBg(cp.accuracy)}`}>
                        <span className="text-gray-500">Acc: </span>
                        <span className={getAccuracyColor(cp.accuracy)}>
                          {cp.accuracy ? `${(cp.accuracy * 100).toFixed(2)}%` : '—'}
                        </span>
                      </div>
                      <div className="px-2 py-1 rounded text-xs font-medium bg-gray-100 border border-gray-200">
                        <span className="text-gray-500">Loss: </span>
                        <span className="text-gray-700">{cp.loss?.toFixed(4) || '—'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Download Button */}
                  <a
                    href={`/api/checkpoints/${cp.filePath}`}
                    download
                    className={`flex-shrink-0 p-2.5 rounded-lg transition-all ${
                      isFinal
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                    }`}
                    title={isFinal ? "Download Final Model" : "Download Checkpoint"}
                  >
                    <Download className="w-5 h-5" />
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50">
          <span className="text-xs text-gray-500">
            Showing {(page - 1) * itemsPerPage + 1}-{Math.min(page * itemsPerPage, checkpoints.length)} of {checkpoints.length}
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
                        ? 'bg-gray-800 text-white'
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