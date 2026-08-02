import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArticleEditorModal } from './ArticleEditorModal';
import type { KBArticleWithDetails } from '../../lib/kbService';

// --- Mocks ------------------------------------------------------------------

vi.mock('../../lib/kbService', () => ({
  getKBCategories: vi.fn(async () => []),
  getKBTags: vi.fn(async () => []),
  createKBArticle: vi.fn(),
  updateKBArticle: vi.fn(),
  createKBTag: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'user-1', tenant_id: 'tenant-1' } }),
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() }),
}));

const TITLE_PLACEHOLDER = 'e.g. HDD Head Replacement SOP – Seagate Barracuda';

function makeArticle(overrides: Partial<KBArticleWithDetails> = {}): KBArticleWithDetails {
  return {
    id: 'article-1',
    title: 'Saved Title',
    content: '<p>Saved content</p>',
    excerpt: 'Saved excerpt',
    category_id: null,
    status: 'draft',
    is_featured: false,
    tags: [],
    ...overrides,
  } as KBArticleWithDetails;
}

function renderModal(article: KBArticleWithDetails | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <ArticleEditorModal isOpen onClose={() => {}} article={article} />
    </QueryClientProvider>,
  );
  const rerenderWith = (next: KBArticleWithDetails | null) =>
    view.rerender(
      <QueryClientProvider client={client}>
        <ArticleEditorModal isOpen onClose={() => {}} article={next} />
      </QueryClientProvider>,
    );
  return { ...view, rerenderWith };
}

// ---------------------------------------------------------------------------

describe('ArticleEditorModal seeding', () => {
  it('keeps unsaved edits when the article query refetches (new object, same id)', () => {
    const { rerenderWith } = renderModal(makeArticle());

    const titleInput = screen.getByPlaceholderText(TITLE_PLACEHOLDER) as HTMLInputElement;
    expect(titleInput.value).toBe('Saved Title');

    fireEvent.change(titleInput, { target: { value: 'My unsaved draft' } });
    expect(titleInput.value).toBe('My unsaved draft');

    // A background refetch (window focus, cache invalidation) hands down a brand new
    // object with identical data. The editor must NOT re-seed from it.
    rerenderWith(makeArticle());

    expect((screen.getByPlaceholderText(TITLE_PLACEHOLDER) as HTMLInputElement).value).toBe(
      'My unsaved draft',
    );
  });

  it('re-seeds when a different article is opened', () => {
    const { rerenderWith } = renderModal(makeArticle());

    const titleInput = screen.getByPlaceholderText(TITLE_PLACEHOLDER) as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'My unsaved draft' } });

    rerenderWith(makeArticle({ id: 'article-2', title: 'Another Article' }));

    expect((screen.getByPlaceholderText(TITLE_PLACEHOLDER) as HTMLInputElement).value).toBe(
      'Another Article',
    );
  });
});
