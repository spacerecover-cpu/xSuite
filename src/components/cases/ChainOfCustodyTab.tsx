import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Shield,
  Search,
  Filter,
  Download,
  Clock,
  User,
  FileText,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  Eye,
  DollarSign,
  ArrowRightLeft,
  Activity,
  Lock,
  Fingerprint,
  Upload,
  Trash2,
  X,
  HardDrive,
  AlertCircle,
} from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import {
  getChainOfCustody,
  ActionCategory,
  ChainOfCustodyEntry,
  getCategoryColor,
  formatActionType,
} from '../../lib/chainOfCustodyService';
import { formatDateTime } from '../../lib/format';
import {
  exportToCSV,
  exportToJSON,
} from '../../lib/chainOfCustodyExport';
import { generateChainOfCustody } from '../../lib/pdf/pdfService';

interface ChainOfCustodyTabProps {
  caseId: string;
  caseNumber: string;
}

const getActionTypeIcon = (actionType: string): React.ElementType => {
  if (actionType.includes('QUOTE')) return FileText;
  if (actionType.includes('INVOICE')) return DollarSign;
  if (actionType.includes('REPORT')) return FileText;
  if (actionType.includes('FILE_DOWNLOADED')) return Download;
  if (actionType.includes('FILE_UPLOADED') || actionType.includes('ATTACHMENT_UPLOADED')) return Upload;
  if (actionType.includes('FILE_DELETED')) return Trash2;
  if (actionType.includes('FILE_VIEWED')) return Eye;
  if (actionType.includes('PORTAL')) return User;
  if (actionType.includes('DEVICE_CHECKED_OUT')) return ArrowRightLeft;
  if (actionType.includes('DEVICE_RETURNED')) return CheckCircle2;
  if (actionType.includes('CLONE')) return HardDrive;
  if (actionType.includes('PAYMENT')) return DollarSign;
  if (actionType.includes('APPROVED')) return CheckCircle2;
  if (actionType.includes('REJECTED')) return X;
  if (actionType.includes('STATUS_CHANGED')) return Activity;
  if (actionType.includes('PRIORITY_CHANGED')) return AlertCircle;
  if (actionType.includes('ENGINEER_ASSIGNED')) return User;
  if (actionType.includes('CUSTOMER_CHANGED') || actionType.includes('COMPANY_CHANGED')) return AlertTriangle;

  return Activity;
};

export const ChainOfCustodyTab: React.FC<ChainOfCustodyTabProps> = ({ caseId, caseNumber }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<ActionCategory[]>([]);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  const { data: custodyData = [], isLoading } = useQuery({
    queryKey: ['chain_of_custody', caseId],
    queryFn: () => getChainOfCustody(caseId),
    refetchInterval: 30000,
  });

  const allCategories: ActionCategory[] = [
    'creation',
    'modification',
    'access',
    'transfer',
    'verification',
    'communication',
    'evidence_handling',
    'financial',
    'critical_event',
  ];

  const filteredData = useMemo(() => {
    let filtered = custodyData;

    if (selectedCategories.length > 0) {
      filtered = filtered.filter((entry) => selectedCategories.includes(entry.action_category));
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (entry) =>
          entry.action_description.toLowerCase().includes(term) ||
          entry.action_type.toLowerCase().includes(term) ||
          entry.actor_name.toLowerCase().includes(term) ||
          (entry.evidence_reference && entry.evidence_reference.toLowerCase().includes(term))
      );
    }

    return filtered;
  }, [custodyData, selectedCategories, searchTerm]);

  const toggleCategory = (category: ActionCategory) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  const toggleExpanded = (entryId: string) => {
    setExpandedEntries((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(entryId)) {
        newSet.delete(entryId);
      } else {
        newSet.add(entryId);
      }
      return newSet;
    });
  };

  const [showExportMenu, setShowExportMenu] = useState(false);

  const handleExport = (format: 'pdf' | 'csv' | 'json') => {
    const dataToExport = filteredData.length > 0 ? filteredData : custodyData;

    switch (format) {
      case 'pdf':
        generateChainOfCustody(caseId, caseNumber, {
          includeMetadata: true,
          includeHashes: true,
          includeSignatures: true,
        });
        break;
      case 'csv':
        exportToCSV(dataToExport, caseNumber);
        break;
      case 'json':
        exportToJSON(dataToExport, caseNumber);
        break;
    }

    setShowExportMenu(false);
  };

  const renderEntryDetails = (entry: ChainOfCustodyEntry) => {
    const isExpanded = expandedEntries.has(entry.id);
    if (!isExpanded) return null;

    return (
      <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
        <div className="grid grid-cols-2 gap-4 text-xs">
          {entry.actor_ip_address && (
            <div>
              <span className="font-semibold text-slate-600">IP Address:</span>
              <p className="text-slate-800 mt-0.5 font-mono">{entry.actor_ip_address}</p>
            </div>
          )}
          {entry.location_facility && (
            <div>
              <span className="font-semibold text-slate-600">Location:</span>
              <p className="text-slate-800 mt-0.5">{entry.location_facility}</p>
            </div>
          )}
          {entry.evidence_reference && (
            <div>
              <span className="font-semibold text-slate-600">Evidence Reference:</span>
              <p className="text-slate-800 mt-0.5 font-mono">{entry.evidence_reference}</p>
            </div>
          )}
          {entry.hash_value && (
            <div>
              <span className="font-semibold text-slate-600">Hash Value ({entry.hash_algorithm}):</span>
              <p className="text-slate-800 mt-0.5 font-mono text-xs break-all">{entry.hash_value}</p>
            </div>
          )}
        </div>

        {entry.before_values && Object.keys(entry.before_values).length > 0 && (
          <div>
            <span className="font-semibold text-slate-600 text-xs">Before Values:</span>
            <div className="mt-1 bg-danger-muted border border-danger/30 rounded p-2">
              <pre className="text-xs text-danger whitespace-pre-wrap">
                {JSON.stringify(entry.before_values, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {entry.after_values && Object.keys(entry.after_values).length > 0 && (
          <div>
            <span className="font-semibold text-slate-600 text-xs">After Values:</span>
            <div className="mt-1 bg-success-muted border border-success/30 rounded p-2">
              <pre className="text-xs text-success whitespace-pre-wrap">
                {JSON.stringify(entry.after_values, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {entry.metadata && Object.keys(entry.metadata).length > 0 && (
          <div>
            <span className="font-semibold text-slate-600 text-xs">Additional Metadata:</span>
            <div className="mt-1 bg-slate-50 border border-slate-200 rounded p-2">
              <pre className="text-xs text-slate-700 whitespace-pre-wrap">
                {JSON.stringify(entry.metadata, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {entry.digital_signature && (
          <div className="flex items-center gap-2 text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded p-2">
            <Lock className="w-4 h-4 flex-shrink-0" />
            <span className="font-semibold">Digitally Signed</span>
            <span className="text-slate-500">•</span>
            <span className="font-mono text-xs">{entry.digital_signature.substring(0, 16)}...</span>
          </div>
        )}

        {entry.witness_name && (
          <div className="flex items-center gap-2 text-xs text-info bg-info-muted border border-info/30 rounded p-2">
            <User className="w-4 h-4 flex-shrink-0" />
            <span className="font-semibold">Witnessed by:</span>
            <span>{entry.witness_name}</span>
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <div className="p-6 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading Chain of Custody records...</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Forensic Chain of Custody</h2>
                <p className="text-sm text-slate-600">
                  Case {caseNumber} • {filteredData.length} entries recorded
                </p>
              </div>
            </div>
            <div className="relative">
              <Button onClick={() => setShowExportMenu(!showExportMenu)} variant="ghost" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export Report
              </Button>
              {showExportMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-10">
                  <button
                    onClick={() => handleExport('pdf')}
                    className="w-full text-left px-4 py-2 hover:bg-slate-50 rounded-t-lg text-sm"
                  >
                    Export as PDF
                  </button>
                  <button
                    onClick={() => handleExport('csv')}
                    className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm"
                  >
                    Export as CSV
                  </button>
                  <button
                    onClick={() => handleExport('json')}
                    className="w-full text-left px-4 py-2 hover:bg-slate-50 rounded-b-lg text-sm"
                  >
                    Export as JSON
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                type="text"
                placeholder="Search by action, actor, or evidence reference..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              onClick={() => setShowFilters(!showFilters)}
              variant="ghost"
              size="sm"
              className={showFilters ? 'bg-primary/10 border-primary/40' : ''}
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters
              {selectedCategories.length > 0 && (
                <Badge className="ml-2 bg-primary">{selectedCategories.length}</Badge>
              )}
            </Button>
          </div>

          {showFilters && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Filter by Action Category</h3>
              <div className="flex flex-wrap gap-2">
                {allCategories.map((category) => (
                  <button
                    key={category}
                    onClick={() => toggleCategory(category)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      selectedCategories.includes(category)
                        ? getCategoryColor(category)
                        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {formatActionType(category)}
                  </button>
                ))}
              </div>
              {selectedCategories.length > 0 && (
                <button
                  onClick={() => setSelectedCategories([])}
                  className="mt-3 text-xs text-primary hover:text-primary/80 font-medium"
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </div>

        <div className="p-6">
          {filteredData.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <h3 className="text-lg font-semibold text-slate-700 mb-2">
                No Chain of Custody Entries Found
              </h3>
              <p className="text-sm text-slate-500">
                {searchTerm || selectedCategories.length > 0
                  ? 'Try adjusting your search or filters'
                  : 'Chain of Custody entries will appear here as actions are performed'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredData.map((entry, idx) => {
                const ActionIcon = getActionTypeIcon(entry.action_type);
                const isExpanded = expandedEntries.has(entry.id);
                const isLast = idx === filteredData.length - 1;

                return (
                  <div key={entry.id} className="relative">
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            getCategoryColor(entry.action_category).split(' ')[0]
                          } border-2`}
                        >
                          <ActionIcon className="w-5 h-5" />
                        </div>
                        {!isLast && <div className="w-0.5 h-full bg-slate-200 mt-2" />}
                      </div>

                      <div className="flex-1 pb-6">
                        <div
                          className="bg-white border border-slate-200 rounded-lg hover:shadow-md transition-shadow cursor-pointer"
                          onClick={() => toggleExpanded(entry.id)}
                        >
                          <div className="flex items-center justify-between gap-4 p-4">
                            {/* Left section: Badge and Entry Number */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Badge className={getCategoryColor(entry.action_category)}>
                                {formatActionType(entry.action_category)}
                              </Badge>
                              <span className="text-xs font-mono text-slate-500">
                                #{entry.entry_number.toString().padStart(4, '0')}
                              </span>
                            </div>

                            {/* Middle section: Action and Description */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h3 className="text-sm font-semibold text-slate-900 truncate">
                                  {formatActionType(entry.action_type)}
                                </h3>
                                {entry.hash_value && (
                                  <div className="flex items-center gap-1 text-xs text-teal-600 flex-shrink-0">
                                    <Fingerprint className="w-3 h-3" />
                                    <span>Verified</span>
                                  </div>
                                )}
                              </div>
                              <p className="text-sm text-slate-600 truncate">{entry.action_description}</p>
                            </div>

                            {/* Right section: Actor and Time */}
                            <div className="flex items-center gap-6 text-xs text-slate-500 flex-shrink-0">
                              <div className="flex items-center gap-1.5">
                                <User className="w-3.5 h-3.5" />
                                <span className="font-medium">{entry.actor_name}</span>
                                {entry.actor_role && (
                                  <>
                                    <span>•</span>
                                    <span className="capitalize">{entry.actor_role}</span>
                                  </>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5" />
                                <span className="whitespace-nowrap">{formatDateTime(entry.occurred_at)}</span>
                              </div>
                            </div>

                            {/* Expand button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpanded(entry.id);
                              }}
                              className="p-1 hover:bg-slate-100 rounded transition-colors flex-shrink-0"
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-5 h-5 text-slate-400" />
                              ) : (
                                <ChevronDown className="w-5 h-5 text-slate-400" />
                              )}
                            </button>
                          </div>

                          {renderEntryDetails(entry)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="p-4 bg-slate-50 border-t border-slate-200">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="text-xs text-slate-600">
              <p className="font-semibold text-slate-700 mb-1">Legal Notice</p>
              <p>
                This Chain of Custody record is maintained for forensic and legal purposes. All entries are
                immutable and cryptographically secured. Unauthorized modification or tampering with evidence
                may result in legal consequences. For questions about evidence handling procedures, contact
                your system administrator.
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

const Info: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);
