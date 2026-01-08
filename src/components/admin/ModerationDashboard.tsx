import React, { useState, useEffect } from 'react';
import { moderationApi, UserReport, ReportAction } from '../../services/moderationApi';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  reviewed: 'bg-blue-100 text-blue-800',
  action_taken: 'bg-red-100 text-red-800',
  dismissed: 'bg-gray-100 text-gray-800',
};

const TYPE_LABELS: Record<string, string> = {
  spam: 'Spam',
  harassment: 'Harassment',
  inappropriate: 'Inappropriate Content',
  other: 'Other',
};

const CONTEXT_LABELS: Record<string, string> = {
  dm: 'Direct Message',
  invitation: 'Invitation',
  profile: 'Profile',
  photo: 'Photo',
};

export const ModerationDashboard: React.FC = () => {
  const [reports, setReports] = useState<UserReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [selectedReport, setSelectedReport] = useState<UserReport | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadReports();
  }, [statusFilter]);

  const loadReports = async () => {
    setLoading(true);
    setError(null);
    const result = await moderationApi.getReports(statusFilter || undefined);
    if (result.success && result.data) {
      setReports(result.data.reports || []);
    } else {
      setError(result.error || 'Failed to load reports');
    }
    setLoading(false);
  };

  const handleAction = async (reportId: string, action: ReportAction) => {
    if (!confirm(`Are you sure you want to ${action} this report?`)) return;

    setActionLoading(true);
    const result = await moderationApi.reviewReport(reportId, action);
    if (result.success) {
      await loadReports();
      setSelectedReport(null);
    } else {
      alert(result.error || 'Failed to process action');
    }
    setActionLoading(false);
  };

  const getInitials = (name?: string) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Moderation Dashboard</h2>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Reports</option>
          <option value="pending">Pending</option>
          <option value="reviewed">Reviewed</option>
          <option value="action_taken">Action Taken</option>
          <option value="dismissed">Dismissed</option>
        </select>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Reports List */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h3 className="text-lg font-semibold">Reports ({reports.length})</h3>
          </div>
          <div className="divide-y max-h-[600px] overflow-y-auto">
            {reports.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No reports found</div>
            ) : (
              reports.map(report => (
                <div
                  key={report.id}
                  className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                    selectedReport?.id === report.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                  }`}
                  onClick={() => setSelectedReport(report)}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-red-600 font-medium text-sm">
                        {getInitials(report.reported_user?.full_name)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 truncate">
                          {report.reported_user?.full_name || 'Unknown User'}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[report.status]}`}>
                          {report.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        {TYPE_LABELS[report.report_type]} • {CONTEXT_LABELS[report.report_context]}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Reported by {report.reporter?.full_name} • {new Date(report.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Report Details */}
        <ReportDetails
          report={selectedReport}
          actionLoading={actionLoading}
          onAction={handleAction}
          getInitials={getInitials}
        />
      </div>
    </div>
  );
};

interface ReportDetailsProps {
  report: UserReport | null;
  actionLoading: boolean;
  onAction: (reportId: string, action: ReportAction) => void;
  getInitials: (name?: string) => string;
}

const ReportDetails: React.FC<ReportDetailsProps> = ({ report, actionLoading, onAction, getInitials }) => {
  if (!report) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
        Select a report to view details
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b">
        <h3 className="text-lg font-semibold">Report Details</h3>
      </div>
      <div className="p-6 space-y-6">
        {/* Reported User */}
        <div>
          <h4 className="text-sm font-medium text-gray-500 mb-2">Reported User</h4>
          <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg">
            <div className="w-12 h-12 rounded-full bg-red-200 flex items-center justify-center">
              <span className="text-red-700 font-bold">{getInitials(report.reported_user?.full_name)}</span>
            </div>
            <div>
              <p className="font-medium">{report.reported_user?.full_name}</p>
              <p className="text-sm text-gray-500">{report.reported_user?.email}</p>
            </div>
          </div>
        </div>

        {/* Reporter */}
        <div>
          <h4 className="text-sm font-medium text-gray-500 mb-2">Reported By</h4>
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
              <span className="text-gray-600 font-medium text-sm">{getInitials(report.reporter?.full_name)}</span>
            </div>
            <div>
              <p className="font-medium text-sm">{report.reporter?.full_name}</p>
              <p className="text-xs text-gray-500">{report.reporter?.email}</p>
            </div>
          </div>
        </div>

        {/* Report Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm font-medium text-gray-500 mb-1">Type</h4>
            <p className="text-sm">{TYPE_LABELS[report.report_type]}</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-500 mb-1">Context</h4>
            <p className="text-sm">{CONTEXT_LABELS[report.report_context]}</p>
          </div>
        </div>

        {/* Description */}
        {report.description && (
          <div>
            <h4 className="text-sm font-medium text-gray-500 mb-1">Description</h4>
            <p className="text-sm bg-gray-50 p-3 rounded-lg">{report.description}</p>
          </div>
        )}

        {/* Actions */}
        {report.status === 'pending' && (
          <div className="border-t pt-4">
            <h4 className="text-sm font-medium text-gray-500 mb-3">Take Action</h4>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => onAction(report.id, 'dismiss')}
                disabled={actionLoading}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md font-medium transition-colors disabled:opacity-50"
              >
                Dismiss
              </button>
              <button
                onClick={() => onAction(report.id, 'warn')}
                disabled={actionLoading}
                className="px-4 py-2 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 rounded-md font-medium transition-colors disabled:opacity-50"
              >
                Warn User
              </button>
              <button
                onClick={() => onAction(report.id, 'suspend')}
                disabled={actionLoading}
                className="px-4 py-2 bg-orange-100 hover:bg-orange-200 text-orange-800 rounded-md font-medium transition-colors disabled:opacity-50"
              >
                Suspend
              </button>
              <button
                onClick={() => onAction(report.id, 'ban')}
                disabled={actionLoading}
                className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-800 rounded-md font-medium transition-colors disabled:opacity-50"
              >
                Ban User
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
