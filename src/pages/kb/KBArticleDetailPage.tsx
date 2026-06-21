import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, Star, Eye, Clock, Tag, User, History, ChevronRight, ChevronDown, CreditCard as Edit3, RotateCcw, Calendar } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { sanitizeHtml } from '../../lib/sanitizeHtml';
import { ArticleEditorModal } from '../../components/kb/ArticleEditorModal';
import {
  getKBArticleById,
  getKBArticleVersions,
  updateKBArticle,
  incrementViewCount,
  type KBArticleVersion,
} from '../../lib/kbService';
import { kbKeys } from '../../lib/queryKeys';
import { formatDate } from '../../lib/format';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';

const STATUS_COLORS: Record<string, string> = {
  published: 'bg-success-muted text-success',
  draft: 'bg-warning-muted text-warning',
  archived: 'bg-gray-100 text-gray-500',
};

function VersionItem({
  version,
  isLatest,
  onRestore,
}: {
  version: KBArticleVersion;
  isLatest: boolean;
  onRestore: (v: KBArticleVersion) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden mb-2">
      <div
        className="flex items-center justify-between px-3 py-2.5 bg-white cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isLatest ? 'bg-primary text-primary-foreground' : 'bg-gray-100 text-gray-600'}`}>
            {version.version_number}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-500">{formatDate(version.created_at || '')}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {!isLatest && (
            <button
              onClick={(e) => { e.stopPropagation(); onRestore(version); }}
              className="p-1 text-gray-400 hover:text-primary hover:bg-primary/10 rounded transition-colors"
              title="Restore this version"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
          {isLatest && <span className="text-xs text-primary font-medium">Current</span>}
          {expanded ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
        </div>
      </div>
      {expanded && (
        <div className="px-3 py-2.5 border-t border-gray-100 bg-gray-50">
          <div className="text-xs font-medium text-gray-700 mb-1">{version.title}</div>
          <div
            className="text-xs text-gray-500 line-clamp-4 prose-sm"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(version.content?.substring(0, 300) + (version.content && version.content.length > 300 ? '...' : '') || '') }}
          />
        </div>
      )}
    </div>
  );
}

export const KBArticleDetailPage: React.FC = () => {
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);

  const { data: article, isLoading } = useQuery({
    queryKey: kbKeys.article(id!),
    queryFn: () => getKBArticleById(id!),
    enabled: !!id,
  });

  const { data: versions = [] } = useQuery({
    queryKey: kbKeys.versions(id!),
    queryFn: () => getKBArticleVersions(id!),
    enabled: !!id && isVersionHistoryOpen,
  });

  useEffect(() => {
    if (id) {
      incrementViewCount(id);
    }
  }, [id]);

  const restoreMutation = useMutation({
    mutationFn: (version: KBArticleVersion) =>
      updateKBArticle(id!, {
        title: version.title ?? undefined,
        content: version.content ?? undefined,
        author_id: profile!.id,
        change_notes: `Restored from version ${version.version_number}`,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kbKeys.all });
      toast.success('Version restored successfully');
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to restore version'),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3 animate-pulse" />
          <p className="text-sm text-gray-400">Loading article...</p>
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-gray-700 mb-2">Article not found</h2>
          <Button variant="secondary" size="sm" onClick={() => navigate('/procedures')}>
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
            Back to KB Center
          </Button>
        </div>
      </div>
    );
  }

  const catColor = article.kb_categories?.color || '#64748b';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/procedures')}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            KB Center
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsVersionHistoryOpen(!isVersionHistoryOpen)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                isVersionHistoryOpen
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              History
              {article.version && article.version > 1 && (
                <span className="ml-1 bg-primary/10 text-primary text-xs px-1.5 py-0.5 rounded-full">
                  v{article.version}
                </span>
              )}
            </button>
            <Button variant="secondary" size="sm" onClick={() => setIsEditorOpen(true)}>
              <Edit3 className="w-3.5 h-3.5 mr-1.5" />
              Edit
            </Button>
          </div>
        </div>
      </div>

      <div className="flex">
        <div className="flex-1 max-w-4xl px-8 py-8">
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {article.is_featured && (
                <span className="inline-flex items-center gap-1 text-xs font-medium bg-warning-muted text-warning px-2.5 py-1 rounded-full">
                  <Star className="w-3 h-3 fill-warning text-warning" />
                  Featured
                </span>
              )}
              {article.kb_categories && (
                <span
                  className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: catColor + '20', color: catColor }}
                >
                  {article.kb_categories.name}
                </span>
              )}
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[article.status || 'draft'] || STATUS_COLORS.draft}`}>
                {article.status || 'draft'}
              </span>
            </div>

            <h1 className="text-2xl font-bold text-gray-900 leading-tight mb-4">{article.title}</h1>

            <div className="flex items-center gap-4 text-sm text-gray-500 flex-wrap">
              {article.profiles?.full_name && (
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  {article.profiles.full_name}
                </span>
              )}
              {article.published_at && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  Published {formatDate(article.published_at)}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Updated {formatDate(article.updated_at || article.created_at || '')}
              </span>
              <span className="flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                {article.view_count || 0} views
              </span>
            </div>
          </div>

          {article.excerpt && (
            <div className="bg-info-muted border-l-4 text-sm text-info px-4 py-3 rounded-r-lg mb-6 leading-relaxed" style={{ borderColor: catColor }}>
              {article.excerpt}
            </div>
          )}

          {article.tags && article.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-6">
              {article.tags.map((tag) => (
                <span key={tag.id} className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">
                  <Tag className="w-3 h-3" />
                  {tag.name}
                </span>
              ))}
            </div>
          )}

          <div
            className="prose prose-sm max-w-none text-gray-800 leading-relaxed"
            style={{
              fontFamily: 'inherit',
            }}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(article.content || '') }}
          />
        </div>

        {isVersionHistoryOpen && (
          <div className="w-72 flex-shrink-0 border-l border-gray-200 bg-white px-4 py-5">
            <div className="flex items-center gap-2 mb-4">
              <History className="w-4 h-4 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-700">Version History</h3>
            </div>
            {versions.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">No version history yet</p>
            ) : (
              <div>
                {versions.map((version, idx) => (
                  <VersionItem
                    key={version.id}
                    version={version}
                    isLatest={idx === 0}
                    onRestore={(v) => restoreMutation.mutate(v)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <ArticleEditorModal
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        article={article}
      />
    </div>
  );
};
