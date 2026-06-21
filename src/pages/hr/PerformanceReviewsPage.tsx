import React, { useState } from 'react';
import { TrendingUp, Users, CheckCircle, Clock, Star, Plus, Search, Filter, CreditCard as Edit2, Trash2, Send, CheckCheck } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { performanceKeys } from '../../lib/queryKeys';
import {
  getReviews,
  getPerformanceStats,
  deleteReview,
  submitReview,
  completeReview,
  type ReviewWithDetails,
  REVIEW_STATUSES,
} from '../../lib/performanceService';
import { ReviewFormModal } from '../../components/performance/ReviewFormModal';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import { Skeleton } from '../../components/ui/Skeleton';

const statusBadgeVariant: Record<string, 'default' | 'info' | 'success' | 'warning'> = {
  draft: 'default',
  submitted: 'info',
  completed: 'success',
};

const statusLabel: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  completed: 'Completed',
};

function StarDisplay({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-xs text-slate-400">No rating</span>;
  const color =
    rating <= 2 ? 'text-danger fill-danger' : rating === 3 ? 'text-warning fill-warning' : 'text-success fill-success';
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <Star key={n} className={`w-4 h-4 ${n <= rating ? color : 'text-slate-200'}`} />
      ))}
      <span className="text-xs font-medium text-slate-500 ml-1">{rating}/5</span>
    </div>
  );
}

function ReviewCard({
  review,
  onEdit,
  onDelete,
  onSubmit,
  onComplete,
}: {
  review: ReviewWithDetails;
  onEdit: (r: ReviewWithDetails) => void;
  onDelete: (id: string) => void;
  onSubmit: (id: string) => void;
  onComplete: (id: string) => void;
}) {
  const emp = review.employee as (ReviewWithDetails['employee'] & { departments?: { name: string } | null; positions?: { title: string } | null }) | null;
  const empName = emp ? `${emp.first_name} ${emp.last_name}` : 'Unknown';
  const deptName = (emp as { departments?: { name: string } | null } | null)?.departments?.name;
  const posTitle = (emp as { positions?: { title: string } | null } | null)?.positions?.title;
  const reviewerName = review.reviewer?.full_name || 'Unknown Reviewer';

  const period = review.review_period || '';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
            {empName[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">{empName}</h3>
            {(deptName || posTitle) && (
              <p className="text-xs text-slate-500 mt-0.5">
                {posTitle}{deptName ? ` · ${deptName}` : ''}
              </p>
            )}
          </div>
        </div>
        <Badge variant={statusBadgeVariant[review.status || 'draft']}>
          {statusLabel[review.status || 'draft']}
        </Badge>
      </div>

      <div className="mb-3">
        <StarDisplay rating={review.overall_rating} />
      </div>

      <div className="text-xs text-slate-500 mb-3 space-y-1">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Period: {period || '—'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Users className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Reviewer: {reviewerName}</span>
        </div>
      </div>

      {review.strengths && (
        <div className="mb-2">
          <p className="text-xs font-medium text-slate-600 mb-1">Strengths</p>
          <p className="text-xs text-slate-500 line-clamp-2">{review.strengths}</p>
        </div>
      )}

      {review.improvements && (
        <div className="mb-3">
          <p className="text-xs font-medium text-slate-600 mb-1">Areas for Improvement</p>
          <p className="text-xs text-slate-500 line-clamp-2">{review.improvements}</p>
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <div className="flex gap-1">
          {review.status === 'draft' && (
            <button
              onClick={() => onSubmit(review.id)}
              className="flex items-center gap-1 text-xs font-medium text-info hover:bg-info-muted px-2 py-1 rounded-lg transition-colors"
            >
              <Send className="w-3 h-3" />
              Submit
            </button>
          )}
          {review.status === 'submitted' && (
            <button
              onClick={() => onComplete(review.id)}
              className="flex items-center gap-1 text-xs font-medium text-success hover:bg-success-muted px-2 py-1 rounded-lg transition-colors"
            >
              <CheckCheck className="w-3 h-3" />
              Complete
            </button>
          )}
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => onEdit(review)}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(review.id)}
            className="p-1.5 text-slate-400 hover:text-danger hover:bg-danger-muted rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export const PerformanceReviewsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingReview, setEditingReview] = useState<ReviewWithDetails | null>(null);

  const filters = {
    status: statusFilter || undefined,
  };

  const { data: stats } = useQuery({
    queryKey: performanceKeys.stats(),
    queryFn: getPerformanceStats,
  });

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: performanceKeys.reviews(filters),
    queryFn: () => getReviews(filters),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteReview,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: performanceKeys.all });
      toast.success('Review deleted');
    },
  });

  const submitMutation = useMutation({
    mutationFn: submitReview,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: performanceKeys.all });
      toast.success('Review submitted');
    },
  });

  const completeMutation = useMutation({
    mutationFn: completeReview,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: performanceKeys.all });
      toast.success('Review completed');
    },
  });

  const filteredReviews = reviews.filter(r => {
    if (!searchTerm) return true;
    const emp = r.employee as (ReviewWithDetails['employee'] & { departments?: { name: string } | null; positions?: { title: string } | null }) | null;
    const name = emp ? `${emp.first_name} ${emp.last_name}`.toLowerCase() : '';
    return name.includes(searchTerm.toLowerCase());
  });

  const avgRating = stats?.averageRating;

  return (
    <div className="p-8 max-w-[1800px] mx-auto">
      <div className="mb-8 flex items-start justify-between">
        <div className="flex items-start gap-6">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg bg-warning shadow-warning/40">
            <TrendingUp className="w-7 h-7 text-warning-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 mb-1">Performance Reviews</h1>
            <p className="text-slate-500 text-sm">
              Track and manage employee performance evaluations
            </p>
          </div>
        </div>
        <Button onClick={() => { setEditingReview(null); setShowModal(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          New Review
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {[
          { label: 'Total Reviews', value: stats?.total ?? '–', icon: TrendingUp, bg: 'from-slate-50 to-slate-100', border: 'border-slate-200', icon_bg: 'bg-slate-500', text: 'text-slate-600', num: 'text-slate-900' },
          { label: 'Draft', value: stats?.draft ?? '–', icon: Clock, bg: 'from-gray-50 to-gray-100', border: 'border-gray-200', icon_bg: 'bg-gray-400', text: 'text-gray-600', num: 'text-gray-900' },
          { label: 'Submitted', value: stats?.submitted ?? '–', icon: Send, bg: 'bg-info-muted', border: 'border-info/30', icon_bg: 'bg-info', text: 'text-info', num: 'text-info' },
          { label: 'Completed', value: stats?.completed ?? '–', icon: CheckCircle, bg: 'bg-success-muted', border: 'border-success/30', icon_bg: 'bg-success', text: 'text-success', num: 'text-success' },
          { label: 'Avg. Rating', value: avgRating ? `${avgRating}/5` : '–', icon: Star, bg: 'bg-warning-muted', border: 'border-warning/30', icon_bg: 'bg-warning', text: 'text-warning', num: 'text-warning' },
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

      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by employee name..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All statuses</option>
            {REVIEW_STATUSES.map(s => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      ) : filteredReviews.length === 0 ? (
        <div className="text-center py-16">
          <TrendingUp className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 mb-3">
            {statusFilter || searchTerm
              ? 'No reviews match your filters.'
              : 'No performance reviews yet. Create the first one.'}
          </p>
          {!statusFilter && !searchTerm && (
            <Button onClick={() => { setEditingReview(null); setShowModal(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              Create First Review
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredReviews.map(review => (
            <ReviewCard
              key={review.id}
              review={review}
              onEdit={r => { setEditingReview(r); setShowModal(true); }}
              onDelete={async id => {
                const ok = await confirm({
                  title: 'Delete Review',
                  message: 'Delete this review?',
                  confirmLabel: 'Delete',
                  tone: 'danger',
                });
                if (ok) {
                  deleteMutation.mutate(id);
                }
              }}
              onSubmit={id => submitMutation.mutate(id)}
              onComplete={id => completeMutation.mutate(id)}
            />
          ))}
        </div>
      )}

      <ReviewFormModal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditingReview(null); }}
        review={editingReview}
      />
    </div>
  );
};
