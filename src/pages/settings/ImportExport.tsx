import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Upload,
  Download,
  Database,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import { PageHeader } from '../../components/shared/PageHeader';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { statusToBadgeVariant } from '../../lib/ui/variants';
import { ENTITY_CONFIGS, EntityType, getJobs, getEntityCount } from '../../lib/importExportService';
import { ExportWizard } from '../../components/importExport/ExportWizard';
import { ImportWizard } from '../../components/importExport/ImportWizard';
import { logger } from '../../lib/logger';

export const ImportExport: React.FC = () => {
  const [selectedEntity, setSelectedEntity] = useState<EntityType | null>(null);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [showExportWizard, setShowExportWizard] = useState(false);

  // Fetch recent jobs
  const { data: recentJobs, isLoading: loadingJobs } = useQuery({
    queryKey: ['import_export_jobs_recent'],
    queryFn: async () => {
      const { data, error } = await getJobs();
      if (error) {
        // Table might not exist yet - return empty array
        logger.error('Import/Export tables not found. Please apply migrations.');
        return [];
      }
      return data?.slice(0, 10) || [];
    },
  });

  // Fetch entity counts
  const { data: entityCounts } = useQuery({
    queryKey: ['entity_counts'],
    queryFn: async () => {
      const counts: Record<string, number> = {};
      for (const entityType of Object.keys(ENTITY_CONFIGS) as EntityType[]) {
        try {
          counts[entityType] = await getEntityCount(entityType);
        } catch (error) {
          // Table might not exist yet
          counts[entityType] = 0;
        }
      }
      return counts;
    },
  });

  const handleEntitySelect = (entityType: EntityType, action: 'import' | 'export') => {
    setSelectedEntity(entityType);
    if (action === 'import') {
      setShowImportWizard(true);
    } else {
      setShowExportWizard(true);
    }
  };

  const handleCloseWizard = () => {
    setShowImportWizard(false);
    setShowExportWizard(false);
    setSelectedEntity(null);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-success" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-danger" />;
      case 'processing':
        return <Clock className="w-4 h-4 text-info animate-pulse" />;
      default:
        return <AlertCircle className="w-4 h-4 text-warning" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <PageHeader
        title="Import / Export"
        description="Migrate data from your legacy ERP system or export current data"
        icon={Database}
      />

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-info-muted flex items-center justify-center">
              <Upload className="w-6 h-6 text-info" />
            </div>
            <div>
              <p className="text-sm text-slate-600">Total Imports</p>
              <p className="text-2xl font-bold text-slate-900">
                {recentJobs?.filter((j) => j.job_type === 'import').length || 0}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-success-muted flex items-center justify-center">
              <Download className="w-6 h-6 text-success" />
            </div>
            <div>
              <p className="text-sm text-slate-600">Total Exports</p>
              <p className="text-2xl font-bold text-slate-900">
                {recentJobs?.filter((j) => j.job_type === 'export').length || 0}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center">
              <FileText className="w-6 h-6 text-accent-foreground" />
            </div>
            <div>
              <p className="text-sm text-slate-600">Total Records</p>
              <p className="text-2xl font-bold text-slate-900">
                {Object.values(entityCounts || {}).reduce((sum, count) => sum + count, 0).toLocaleString()}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Entity Selection Grid */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Select Entity Type</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {(Object.keys(ENTITY_CONFIGS) as EntityType[]).map((entityType) => {
            const config = ENTITY_CONFIGS[entityType];
            const count = entityCounts?.[entityType] || 0;

            return (
              <Card
                key={entityType}
                className="p-5 hover:shadow-lg transition-all duration-200 border-2 border-transparent hover:border-primary/30"
              >
                <div className="flex items-start justify-between mb-4">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: config.color + '20' }}
                  >
                    <div className="text-2xl" style={{ color: config.color }}>
                      {config.icon === 'Briefcase' && '💼'}
                      {config.icon === 'FileText' && '📄'}
                      {config.icon === 'CreditCard' && '💳'}
                      {config.icon === 'Receipt' && '🧾'}
                      {config.icon === 'TrendingUp' && '📈'}
                      {config.icon === 'ArrowRightLeft' && '🔄'}
                      {config.icon === 'Users' && '👥'}
                      {config.icon === 'FileSignature' && '📝'}
                      {config.icon === 'Building2' && '🏢'}
                      {config.icon === 'Truck' && '🚚'}
                      {config.icon === 'ShoppingCart' && '🛒'}
                      {config.icon === 'Package' && '📦'}
                      {config.icon === 'Boxes' && '📦'}
                      {config.icon === 'Laptop' && '💻'}
                      {config.icon === 'HardDrive' && '💾'}
                      {config.icon === 'UserCircle' && '👤'}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-600">Records</p>
                    <p className="text-lg font-bold" style={{ color: config.color }}>
                      {count.toLocaleString()}
                    </p>
                  </div>
                </div>

                <h3 className="text-base font-semibold text-slate-900 mb-3">{config.label}</h3>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleEntitySelect(entityType, 'import')}
                    className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    <Upload className="w-4 h-4 mr-1" />
                    Import
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleEntitySelect(entityType, 'export')}
                    className="flex-1 bg-success hover:bg-success/90 text-success-foreground"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Export
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Activity</h2>
        <Card>
          {loadingJobs ? (
            <div className="p-8 text-center">
              <div className="inline-block w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin"></div>
              <p className="text-slate-500 mt-3">Loading activity...</p>
            </div>
          ) : recentJobs && recentJobs.length > 0 ? (
            <div className="divide-y divide-slate-200">
              {recentJobs.map((job) => (
                <div key={job.id} className="p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex items-center gap-2">
                        {job.job_type === 'import' ? (
                          <Upload className="w-5 h-5 text-info" />
                        ) : (
                          <Download className="w-5 h-5 text-success" />
                        )}
                        {getStatusIcon(job.status)}
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <p className="font-medium text-slate-900">
                            {job.job_type === 'import' ? 'Import' : 'Export'}{' '}
                            {ENTITY_CONFIGS[job.entity_type as EntityType]?.label}
                          </p>
                          <Badge variant={statusToBadgeVariant(job.status)} size="sm">
                            {job.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-slate-600">
                          <span>{job.file_name}</span>
                          <span>•</span>
                          <span>
                            {job.success_count} success, {job.error_count} errors
                          </span>
                          <span>•</span>
                          <span>{new Date(job.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    <Button variant="ghost" size="sm">
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>

                  {job.status === 'processing' && job.total_records > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-sm text-slate-600 mb-1">
                        <span>
                          {job.processed_records} / {job.total_records} records
                        </span>
                        <span>{Math.round((job.processed_records / job.total_records) * 100)}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${(job.processed_records / job.total_records) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center">
              <Database className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No import/export activity yet</p>
              <p className="text-sm text-slate-400 mt-2">Start by selecting an entity type above</p>
            </div>
          )}
        </Card>
      </div>

      {/* Wizards */}
      {showImportWizard && selectedEntity && (
        <ImportWizard entityType={selectedEntity} onClose={handleCloseWizard} />
      )}

      {showExportWizard && selectedEntity && (
        <ExportWizard entityType={selectedEntity} onClose={handleCloseWizard} />
      )}
    </div>
  );
};
