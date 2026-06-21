import React, { useState } from 'react';
import { Briefcase, Users, UserCheck, TrendingUp, Plus, Search, MoreHorizontal, MapPin, Clock, DollarSign, ChevronRight, Star, Mail, Phone, CreditCard as Edit2, Trash2, ArrowRight, X, Calendar } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { recruitmentKeys } from '../../lib/queryKeys';
import {
  getJobs,
  getCandidates,
  deleteJob,
  deleteCandidate,
  moveCandidateStage,
  getRecruitmentStats,
  CANDIDATE_STAGES,
  type JobWithDetails,
  type CandidateWithJob,
  type CandidateStage,
} from '../../lib/recruitmentService';
import { JobFormModal } from '../../components/recruitment/JobFormModal';
import { CandidateFormModal } from '../../components/recruitment/CandidateFormModal';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import { Skeleton } from '../../components/ui/Skeleton';

const stageLabels: Record<string, string> = {
  applied: 'Applied',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Rejected',
};

const stageColors: Record<string, string> = {
  applied: 'bg-slate-100 border-slate-200',
  screening: 'bg-info-muted border-info/30',
  interview: 'bg-warning-muted border-warning/30',
  offer: 'bg-success-muted border-success/30',
  hired: 'bg-success-muted border-success/30',
  rejected: 'bg-danger-muted border-danger/30',
};

const stageBadgeColors: Record<string, string> = {
  applied: 'bg-slate-100 text-slate-700',
  screening: 'bg-info-muted text-info',
  interview: 'bg-warning-muted text-warning',
  offer: 'bg-success-muted text-success',
  hired: 'bg-success-muted text-success',
  rejected: 'bg-danger-muted text-danger',
};

const jobStatusVariant: Record<string, 'success' | 'default' | 'warning' | 'info'> = {
  open: 'success',
  closed: 'default',
  paused: 'warning',
  draft: 'info',
};

const employmentTypeLabel: Record<string, string> = {
  full_time: 'Full Time',
  part_time: 'Part Time',
  contract: 'Contract',
  internship: 'Internship',
};

function StarRating({ rating }: { rating: number | null }) {
  if (!rating) return null;
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star
          key={n}
          className={`w-3 h-3 ${n <= rating ? 'fill-warning text-warning' : 'text-slate-200'}`}
        />
      ))}
    </div>
  );
}

function CandidateCard({
  candidate,
  onEdit,
  onDelete,
  onMoveStage,
}: {
  candidate: CandidateWithJob;
  onEdit: (c: CandidateWithJob) => void;
  onDelete: (id: string) => void;
  onMoveStage: (id: string, stage: CandidateStage) => void;
}) {
  const currentIndex = CANDIDATE_STAGES.indexOf(candidate.current_stage as CandidateStage);
  const nextStage = CANDIDATE_STAGES[currentIndex + 1];
  const canAdvance = nextStage && candidate.current_stage !== 'hired' && candidate.current_stage !== 'rejected';

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-slate-900 text-sm truncate">
            {candidate.name}
          </h4>
          <StarRating rating={candidate.rating} />
        </div>
        <div className="flex gap-1 ml-2">
          <button
            onClick={() => onEdit(candidate)}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(candidate.id)}
            className="p-1.5 text-slate-400 hover:text-danger hover:bg-danger-muted rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-1.5 mb-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Mail className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{candidate.email}</span>
        </div>
        {candidate.phone && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Phone className="w-3 h-3 flex-shrink-0" />
            <span>{candidate.phone}</span>
          </div>
        )}
        {candidate.applied_date && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Calendar className="w-3 h-3 flex-shrink-0" />
            <span>Applied {new Date(candidate.applied_date).toLocaleDateString()}</span>
          </div>
        )}
      </div>

      {candidate.notes && (
        <p className="text-xs text-slate-500 italic mb-3 line-clamp-2">{candidate.notes}</p>
      )}

      {canAdvance && (
        <button
          onClick={() => onMoveStage(candidate.id, nextStage)}
          className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-primary hover:text-primary/90 bg-primary/10 hover:bg-primary/20 rounded-lg py-1.5 transition-colors"
        >
          Move to {stageLabels[nextStage]}
          <ArrowRight className="w-3 h-3" />
        </button>
      )}

      {candidate.current_stage !== 'rejected' && candidate.current_stage !== 'hired' && (
        <button
          onClick={() => onMoveStage(candidate.id, 'rejected')}
          className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-danger hover:text-danger/90 hover:bg-danger-muted rounded-lg py-1 mt-1 transition-colors"
        >
          <X className="w-3 h-3" />
          Reject
        </button>
      )}
    </div>
  );
}

export const RecruitmentPage: React.FC = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<'jobs' | 'pipeline'>('jobs');
  const [searchTerm, setSearchTerm] = useState('');
  const [pipelineJob, setPipelineJob] = useState<JobWithDetails | null>(null);

  const [showJobModal, setShowJobModal] = useState(false);
  const [editingJob, setEditingJob] = useState<JobWithDetails | null>(null);
  const [showCandidateModal, setShowCandidateModal] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<CandidateWithJob | null>(null);
  const [candidateJob, setCandidateJob] = useState<JobWithDetails | null>(null);

  const { data: stats } = useQuery({
    queryKey: recruitmentKeys.stats(),
    queryFn: getRecruitmentStats,
  });

  const { data: jobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: recruitmentKeys.jobs(),
    queryFn: () => getJobs(),
  });

  const { data: candidates = [], isLoading: candidatesLoading } = useQuery({
    queryKey: recruitmentKeys.candidates(pipelineJob?.id),
    queryFn: () => getCandidates(pipelineJob?.id),
    enabled: activeTab === 'pipeline',
  });

  const deleteJobMutation = useMutation({
    mutationFn: deleteJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recruitmentKeys.all });
      toast.success('Job deleted');
    },
  });

  const deleteCandidateMutation = useMutation({
    mutationFn: deleteCandidate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recruitmentKeys.all });
      toast.success('Candidate removed');
    },
  });

  const moveStageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: CandidateStage }) =>
      moveCandidateStage(id, stage),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recruitmentKeys.all });
    },
  });

  const filteredJobs = jobs.filter(
    j =>
      j.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      j.departments?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const candidatesByStage = CANDIDATE_STAGES.reduce<Record<string, CandidateWithJob[]>>(
    (acc, stage) => {
      acc[stage] = candidates.filter(c => c.current_stage === stage);
      return acc;
    },
    {} as Record<string, CandidateWithJob[]>
  );

  const openCandidateModal = (job: JobWithDetails, candidate?: CandidateWithJob) => {
    setCandidateJob(job);
    setEditingCandidate(candidate || null);
    setShowCandidateModal(true);
  };

  return (
    <div className="p-8 max-w-[1800px] mx-auto">
      <div className="mb-8 flex items-start justify-between">
        <div className="flex items-start gap-6">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg bg-info shadow-info/40">
            <Briefcase className="w-7 h-7 text-info-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 mb-1">Recruitment</h1>
            <p className="text-slate-500 text-sm">Manage job openings and track candidates through the hiring pipeline</p>
          </div>
        </div>
        <Button onClick={() => { setEditingJob(null); setShowJobModal(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Post Job
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Open Positions', value: stats?.openJobs ?? '–', icon: Briefcase, color: 'info', bg: 'bg-info-muted', border: 'border-info/30', icon_bg: 'bg-info', text: 'text-info', num: 'text-info' },
          { label: 'Total Applicants', value: stats?.totalCandidates ?? '–', icon: Users, color: 'slate', bg: 'bg-slate-100', border: 'border-slate-200', icon_bg: 'bg-slate-500', text: 'text-slate-600', num: 'text-slate-900' },
          { label: 'In Interview', value: stats?.interviews ?? '–', icon: TrendingUp, color: 'warning', bg: 'bg-warning-muted', border: 'border-warning/30', icon_bg: 'bg-warning', text: 'text-warning', num: 'text-warning' },
          { label: 'Hired This Period', value: stats?.hired ?? '–', icon: UserCheck, color: 'success', bg: 'bg-success-muted', border: 'border-success/30', icon_bg: 'bg-success', text: 'text-success', num: 'text-success' },
        ].map(card => (
          <div key={card.label} className={`${card.bg} rounded-xl p-4 border ${card.border}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-xs font-medium ${card.text} uppercase tracking-wide`}>{card.label}</p>
                <p className={`text-2xl font-bold ${card.num} mt-1`}>{card.value}</p>
              </div>
              <div className={`w-10 h-10 ${card.icon_bg} rounded-lg flex items-center justify-center`}>
                <card.icon className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-1 mb-6 bg-slate-100 rounded-xl p-1 w-fit">
        {(['jobs', 'pipeline'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab === 'jobs' ? 'Job Listings' : 'Candidate Pipeline'}
          </button>
        ))}
      </div>

      {activeTab === 'jobs' && (
        <>
          <div className="mb-4">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search jobs..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {jobsLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-48 rounded-2xl" />
              ))}
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="text-center py-16">
              <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No job openings yet. Post your first job to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredJobs.map(job => (
                <div
                  key={job.id}
                  className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 text-base truncate">{job.title}</h3>
                      {job.departments && (
                        <p className="text-sm text-slate-500 mt-0.5">{job.departments.name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 ml-3">
                      <Badge variant={jobStatusVariant[job.status || 'open']}>
                        {job.status?.charAt(0).toUpperCase() + (job.status?.slice(1) || '')}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-1.5 mb-4">
                    {job.employment_type && (
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Briefcase className="w-3.5 h-3.5 flex-shrink-0" />
                        {employmentTypeLabel[job.employment_type] || job.employment_type}
                      </div>
                    )}
                    {job.location && (
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                        {job.location}
                      </div>
                    )}
                    {job.salary_range && (
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <DollarSign className="w-3.5 h-3.5 flex-shrink-0" />
                        {job.salary_range}
                      </div>
                    )}
                    {job.closes_at && (
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                        Closes {new Date(job.closes_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Users className="w-4 h-4" />
                      <span>{job.candidate_count || 0} applicant{job.candidate_count !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setPipelineJob(job);
                          setActiveTab('pipeline');
                        }}
                        className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/90 px-2 py-1 hover:bg-primary/10 rounded-lg transition-colors"
                      >
                        Pipeline
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => openCandidateModal(job)}
                        className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-800 px-2 py-1 hover:bg-slate-50 rounded-lg transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add
                      </button>
                      <button
                        onClick={() => { setEditingJob(job); setShowJobModal(true); }}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      <button
                        onClick={async () => {
                          const ok = await confirm({
                            title: 'Delete Job',
                            message: 'Delete this job and all its candidates?',
                            confirmLabel: 'Delete',
                            tone: 'danger',
                          });
                          if (ok) {
                            deleteJobMutation.mutate(job.id);
                          }
                        }}
                        className="p-1.5 text-slate-400 hover:text-danger hover:bg-danger-muted rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'pipeline' && (
        <>
          <div className="flex items-center gap-4 mb-6">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-700">Filter by Job:</label>
              <select
                value={pipelineJob?.id || ''}
                onChange={e => {
                  const job = jobs.find(j => j.id === e.target.value) || null;
                  setPipelineJob(job);
                }}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">All jobs</option>
                {jobs.map(j => (
                  <option key={j.id} value={j.id}>{j.title}</option>
                ))}
              </select>
            </div>
            {pipelineJob && (
              <Button
                onClick={() => openCandidateModal(pipelineJob)}
                size="sm"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add Candidate
              </Button>
            )}
          </div>

          {candidatesLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 overflow-x-auto">
              {CANDIDATE_STAGES.map(stage => (
                <div key={stage} className={`rounded-xl border p-3 ${stageColors[stage]}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${stageBadgeColors[stage]}`}>
                      {stageLabels[stage]}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      {candidatesByStage[stage]?.length || 0}
                    </span>
                  </div>
                  <div className="space-y-2 min-h-[120px]">
                    {(candidatesByStage[stage] || []).map(candidate => (
                      <CandidateCard
                        key={candidate.id}
                        candidate={candidate}
                        onEdit={c => {
                          const job = jobs.find(j => j.id === c.job_id) || pipelineJob || jobs[0];
                          if (job) openCandidateModal(job, c);
                        }}
                        onDelete={async id => {
                          const ok = await confirm({
                            title: 'Remove Candidate',
                            message: 'Remove this candidate?',
                            confirmLabel: 'Remove',
                            tone: 'danger',
                          });
                          if (ok) {
                            deleteCandidateMutation.mutate(id);
                          }
                        }}
                        onMoveStage={(id, s) => moveStageMutation.mutate({ id, stage: s })}
                      />
                    ))}
                    {(candidatesByStage[stage] || []).length === 0 && (
                      <div className="text-center py-4 text-xs text-slate-400">
                        No candidates
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <JobFormModal
        isOpen={showJobModal}
        onClose={() => { setShowJobModal(false); setEditingJob(null); }}
        job={editingJob}
      />

      {candidateJob && (
        <CandidateFormModal
          isOpen={showCandidateModal}
          onClose={() => { setShowCandidateModal(false); setEditingCandidate(null); setCandidateJob(null); }}
          candidate={editingCandidate}
          job={candidateJob}
        />
      )}
    </div>
  );
};
