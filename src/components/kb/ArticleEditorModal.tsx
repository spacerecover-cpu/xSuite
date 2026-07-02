import React, { useId, useRef, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Star, X, Tag, Plus } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { FormField } from '../ui/FormField';
import { RichTextEditor } from '../ui/RichTextEditor';
import {
  getKBCategories,
  getKBTags,
  createKBArticle,
  updateKBArticle,
  createKBTag,
  type KBArticleWithDetails,
  type KBTag,
} from '../../lib/kbService';
import { kbKeys } from '../../lib/queryKeys';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';

interface ArticleEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  article?: KBArticleWithDetails | null;
}

export const ArticleEditorModal: React.FC<ArticleEditorModalProps> = ({ isOpen, onClose, article }) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [isFeatured, setIsFeatured] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [changeNotes, setChangeNotes] = useState('');
  const [newTagInput, setNewTagInput] = useState('');
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const categoryId_a11y = useId();

  const { data: categories = [] } = useQuery({ queryKey: kbKeys.categories(), queryFn: getKBCategories, enabled: isOpen });
  const { data: allTags = [] } = useQuery({ queryKey: kbKeys.tags(), queryFn: getKBTags, enabled: isOpen });

  useEffect(() => {
    if (article) {
      setTitle(article.title || '');
      setContent(article.content || '');
      setExcerpt(article.excerpt || '');
      setCategoryId(article.category_id || '');
      setStatus((article.status as 'draft' | 'published') || 'draft');
      setIsFeatured(article.is_featured || false);
      setSelectedTagIds((article.tags || []).map((t) => t.id));
      setChangeNotes('');
    } else {
      setTitle('');
      setContent('');
      setExcerpt('');
      setCategoryId('');
      setStatus('draft');
      setIsFeatured(false);
      setSelectedTagIds([]);
      setChangeNotes('');
    }
  }, [article, isOpen]);

  const createMutation = useMutation({
    mutationFn: (params: { saveStatus: 'draft' | 'published' }) =>
      createKBArticle({
        title,
        content,
        excerpt,
        category_id: categoryId || null,
        status: params.saveStatus,
        is_featured: isFeatured,
        author_id: profile!.id,
        tag_ids: selectedTagIds,
        change_notes: changeNotes || 'Initial version',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kbKeys.all });
      toast.success('Article created successfully');
      onClose();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to create article'),
  });

  const updateMutation = useMutation({
    mutationFn: (params: { saveStatus: 'draft' | 'published' }) =>
      updateKBArticle(article!.id, {
        title,
        content,
        excerpt,
        category_id: categoryId || null,
        status: params.saveStatus,
        is_featured: isFeatured,
        author_id: profile!.id,
        tag_ids: selectedTagIds,
        change_notes: changeNotes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kbKeys.all });
      toast.success('Article updated successfully');
      onClose();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to update article'),
  });

  const createTagMutation = useMutation({
    mutationFn: createKBTag,
    onSuccess: (newTag: KBTag) => {
      queryClient.invalidateQueries({ queryKey: kbKeys.tags() });
      setSelectedTagIds((prev) => [...prev, newTag.id]);
      setNewTagInput('');
      setIsCreatingTag(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to create tag'),
  });

  const handleSave = (saveStatus: 'draft' | 'published') => {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (!content.trim()) {
      toast.error('Content is required');
      return;
    }
    if (article) {
      updateMutation.mutate({ saveStatus });
    } else {
      createMutation.mutate({ saveStatus });
    }
  };

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const handleCreateTag = () => {
    const trimmed = newTagInput.trim();
    if (!trimmed) return;
    createTagMutation.mutate(trimmed);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={article ? 'Edit Article' : 'New Article'}
      icon={BookOpen}
      maxWidth="7xl"
      size="large"
      closeOnBackdrop={false}
      initialFocusRef={titleRef}
    >
      <div className="flex h-[80vh] overflow-hidden -mx-6 -mb-6">
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          <FormField label="Title" required>
            {(c) => (
              <Input
                {...c}
                ref={titleRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. HDD Head Replacement SOP – Seagate Barracuda"
              />
            )}
          </FormField>

          <FormField label="Excerpt" hint="Short description shown on article cards">
            {(c) => (
              <textarea
                {...c}
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                rows={2}
                placeholder="Brief summary of this article..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            )}
          </FormField>

          <FormField label="Content" required>
            {(c) => (
              <RichTextEditor
                {...c}
                value={content}
                onChange={setContent}
                placeholder="Write your article content here..."
                minHeight="380px"
              />
            )}
          </FormField>

          {article && (
            <FormField label="Change Notes" hint="Describe what changed in this version">
              {(c) => (
                <Input
                  {...c}
                  value={changeNotes}
                  onChange={(e) => setChangeNotes(e.target.value)}
                  placeholder="e.g. Updated torque specs for WD drives"
                />
              )}
            </FormField>
          )}
        </div>

        <div className="w-72 border-l border-slate-200 overflow-y-auto px-5 py-4 space-y-5 bg-slate-50">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Status</label>
            <div className="flex rounded-lg overflow-hidden border border-slate-200">
              {(['draft', 'published'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`flex-1 py-2 text-sm font-medium capitalize transition-colors ${
                    status === s
                      ? s === 'published'
                        ? 'bg-success text-success-foreground'
                        : 'bg-warning text-warning-foreground'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor={categoryId_a11y} className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Category</label>
            <select
              id={categoryId_a11y}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
            >
              <option value="">No category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Tags</label>
              <button
                onClick={() => setIsCreatingTag(!isCreatingTag)}
                className="text-primary hover:text-primary/80"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            {isCreatingTag && (
              <div className="flex gap-1 mb-2">
                <input
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
                  placeholder="New tag name..."
                  className="flex-1 px-2 py-1 border border-slate-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  autoFocus
                />
                <button
                  onClick={handleCreateTag}
                  disabled={createTagMutation.isPending}
                  className="px-2 py-1 bg-primary text-primary-foreground rounded text-xs hover:bg-primary/90 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((tag) => {
                const selected = selectedTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                      selected
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <Tag className="w-2.5 h-2.5" />
                    {tag.name}
                    {selected && <X className="w-2.5 h-2.5" />}
                  </button>
                );
              })}
              {allTags.length === 0 && (
                <p className="text-xs text-slate-400">No tags yet. Create one above.</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Options</label>
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <div
                onClick={() => setIsFeatured(!isFeatured)}
                className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors ${
                  isFeatured ? 'bg-warning border-warning' : 'border-slate-300 group-hover:border-warning/60'
                }`}
              >
                {isFeatured && <Star className="w-3 h-3 text-white fill-white" />}
              </div>
              <span className="text-sm text-slate-700">Featured article</span>
            </label>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-slate-200 mt-0 px-6 pb-4">
        <Button variant="secondary" onClick={onClose} disabled={isPending}>Cancel</Button>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => handleSave('draft')}
            disabled={isPending}
          >
            Save as Draft
          </Button>
          <Button
            variant="primary"
            onClick={() => handleSave('published')}
            disabled={isPending}
          >
            {isPending ? 'Saving...' : article?.status === 'published' ? 'Update' : 'Publish'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
