import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Search, Plus, FolderOpen, Star, Eye, Clock, Tag, ChevronRight, FileText, Layers, CheckCircle, CreditCard as Edit3, Filter } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { KpiRow } from '../../components/templates/KpiRow';
import { PageHeaderSlot } from '../../components/layout/PageHeaderSlot';
import { ArticleEditorModal } from '../../components/kb/ArticleEditorModal';
import { CategoryManagerModal } from '../../components/kb/CategoryManagerModal';
import {
  getKBArticles,
  getKBCategories,
  getKBStats,
  type KBArticleWithDetails,
} from '../../lib/kbService';
import { kbKeys } from '../../lib/queryKeys';
import { formatDate } from '../../lib/format';
import { useAuth } from '../../contexts/AuthContext';

const STATUS_TABS = [
  { key: 'all', label: 'All Articles' },
  { key: 'published', label: 'Published' },
  { key: 'draft', label: 'Drafts' },
  { key: 'featured', label: 'Featured' },
];

const STATUS_COLORS: Record<string, string> = {
  published: 'bg-success-muted text-success',
  draft: 'bg-warning-muted text-warning',
  archived: 'bg-slate-100 text-slate-500',
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
}

function getCategoryColor(color?: string | null): string {
  return color || '#64748b';
}

function ArticleCard({ article, onEdit, onClick }: { article: KBArticleWithDetails; onEdit: (a: KBArticleWithDetails) => void; onClick: (id: string) => void }) {
  const excerpt = article.excerpt || stripHtml(article.content || '').substring(0, 140);
  const catColor = getCategoryColor(article.kb_categories?.color);

  return (
    <div
      onClick={() => onClick(article.id)}
      className="group bg-white rounded-xl border border-slate-200 hover:border-primary/40 hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden"
    >
      <div className="h-1 w-full" style={{ backgroundColor: catColor }} />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              {article.is_featured && (
                <Star className="w-3.5 h-3.5 text-warning fill-warning flex-shrink-0" />
              )}
              {article.kb_categories && (
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: catColor + '20', color: catColor }}
                >
                  {article.kb_categories.name}
                </span>
              )}
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[article.status || 'draft'] || STATUS_COLORS.draft}`}>
                {article.status || 'draft'}
              </span>
            </div>
            <h3 className="text-sm font-semibold text-slate-900 group-hover:text-primary transition-colors leading-snug line-clamp-2">
              {article.title}
            </h3>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(article); }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
        </div>

        {excerpt && (
          <p className="text-xs text-slate-500 line-clamp-2 mb-3 leading-relaxed">{excerpt}</p>
        )}

        {article.tags && article.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {article.tags.slice(0, 3).map((tag) => (
              <span key={tag.id} className="inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                <Tag className="w-2.5 h-2.5" />
                {tag.name}
              </span>
            ))}
            {article.tags.length > 3 && (
              <span className="text-xs text-slate-400">+{article.tags.length - 3}</span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Eye className="w-3 h-3" />
              {article.view_count || 0}
            </span>
            {article.profiles?.full_name && (
              <span className="truncate max-w-[100px]">{article.profiles.full_name}</span>
            )}
          </div>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDate(article.updated_at || article.created_at || '')}
          </span>
        </div>
      </div>
    </div>
  );
}

export const KBCenterPage: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<KBArticleWithDetails | null>(null);

  const articleFilters = useMemo(() => {
    const f: Record<string, unknown> = {};
    if (searchTerm) f.search = searchTerm;
    if (selectedCategoryId) f.category_id = selectedCategoryId;
    if (activeTab === 'published') f.status = 'published';
    else if (activeTab === 'draft') f.status = 'draft';
    else if (activeTab === 'featured') f.is_featured = true;
    return f;
  }, [searchTerm, selectedCategoryId, activeTab]);

  const { data: articles = [], isLoading } = useQuery({
    queryKey: kbKeys.articles(articleFilters),
    queryFn: () => getKBArticles(articleFilters as any),
  });

  const { data: categories = [] } = useQuery({
    queryKey: kbKeys.categories(),
    queryFn: getKBCategories,
  });

  const { data: stats } = useQuery({
    queryKey: kbKeys.stats(),
    queryFn: getKBStats,
  });

  const featuredArticles = useMemo(
    () => articles.filter((a) => a.is_featured && a.status === 'published').slice(0, 4),
    [articles]
  );

  const handleOpenEditor = (article?: KBArticleWithDetails) => {
    setEditingArticle(article || null);
    setIsEditorOpen(true);
  };

  const handleCloseEditor = () => {
    setIsEditorOpen(false);
    setEditingArticle(null);
  };

  const isAdmin = profile?.role === 'admin';

  return (
    <div className="min-h-screen bg-slate-50">
      <PageHeaderSlot
        title="KB Center"
        icon={BookOpen}
        actions={
          <>
            {isAdmin && (
              <Button variant="secondary" size="sm" onClick={() => setIsCategoryManagerOpen(true)}>
                <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
                Categories
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={() => handleOpenEditor()}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              New Article
            </Button>
          </>
        }
      />
      <div className="bg-white border-b border-slate-200">
        <div className="px-6 py-5">
          {stats && (
            <KpiRow
              stats={[
                { tone: 'primary', label: 'Total Articles', value: stats.total, icon: FileText },
                { tone: 'info', label: 'Published', value: stats.published, icon: CheckCircle },
                { tone: 'cat-2', label: 'Drafts', value: stats.drafts, icon: Edit3 },
                { tone: 'cat-5', label: 'Categories', value: stats.categories, icon: Layers },
              ]}
            />
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search articles by title, content, or excerpt..."
              className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
            />
          </div>
        </div>

        <div className="px-6 flex gap-1 overflow-x-auto">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex">
        <div className="w-56 flex-shrink-0 border-r border-slate-200 bg-white min-h-[calc(100vh-200px)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Categories</span>
          </div>
          <div className="space-y-0.5">
            <button
              onClick={() => setSelectedCategoryId(null)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                selectedCategoryId === null
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>All Categories</span>
              {stats && <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{stats.total}</span>}
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryId(cat.id === selectedCategoryId ? null : cat.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedCategoryId === cat.id
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: getCategoryColor(cat.color) }}
                  />
                  <span className="truncate">{cat.name}</span>
                </div>
                {(cat.article_count ?? 0) > 0 && (
                  <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full flex-shrink-0">
                    {cat.article_count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 p-6">
          {activeTab === 'all' && featuredArticles.length > 0 && !searchTerm && !selectedCategoryId && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Star className="w-4 h-4 text-warning fill-warning" />
                <h2 className="text-sm font-semibold text-slate-700">Featured</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {featuredArticles.map((article) => (
                  <div
                    key={article.id}
                    onClick={() => navigate(`/procedures/${article.id}`)}
                    className="flex items-center gap-3 bg-warning-muted border border-warning/20 rounded-xl p-3.5 cursor-pointer hover:bg-warning/20 hover:border-warning/30 transition-colors group"
                  >
                    <div className="p-2 bg-warning/20 rounded-lg group-hover:bg-warning/30 transition-colors flex-shrink-0">
                      <Star className="w-3.5 h-3.5 text-warning fill-warning" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 group-hover:text-warning transition-colors truncate">{article.title}</div>
                      {article.kb_categories && (
                        <div className="text-xs text-slate-500 mt-0.5">{article.kb_categories.name}</div>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-warning flex-shrink-0 transition-colors" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-3 gap-4">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-slate-200 h-48 animate-pulse" />
              ))}
            </div>
          ) : articles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <BookOpen className="w-7 h-7 text-slate-400" />
              </div>
              <h3 className="text-base font-semibold text-slate-700 mb-1">
                {searchTerm ? 'No articles found' : 'No articles yet'}
              </h3>
              <p className="text-sm text-slate-500 mb-4 max-w-xs">
                {searchTerm
                  ? 'Try different keywords or clear the search filter.'
                  : 'Start building your knowledge base with SOPs, guides, and procedures.'}
              </p>
              {!searchTerm && (
                <Button variant="primary" size="sm" onClick={() => handleOpenEditor()}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Write First Article
                </Button>
              )}
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-slate-500">
                  {articles.length} article{articles.length !== 1 ? 's' : ''}
                  {selectedCategoryId && categories.find((c) => c.id === selectedCategoryId) && (
                    <> in <span className="font-medium text-slate-700">{categories.find((c) => c.id === selectedCategoryId)?.name}</span></>
                  )}
                  {searchTerm && <> matching <span className="font-medium text-slate-700">"{searchTerm}"</span></>}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {articles.map((article) => (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    onEdit={handleOpenEditor}
                    onClick={(id) => navigate(`/procedures/${id}`)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <ArticleEditorModal
        isOpen={isEditorOpen}
        onClose={handleCloseEditor}
        article={editingArticle}
      />

      <CategoryManagerModal
        isOpen={isCategoryManagerOpen}
        onClose={() => setIsCategoryManagerOpen(false)}
      />
    </div>
  );
};
