import { supabase } from './supabaseClient';
import type { Database } from '../types/database.types';
import { sanitizeFilterValue } from './postgrestSanitizer';

type KBArticle = Database['public']['Tables']['kb_articles']['Row'];
type KBArticleInsert = Database['public']['Tables']['kb_articles']['Insert'];
type KBArticleUpdate = Database['public']['Tables']['kb_articles']['Update'];
type KBCategory = Database['public']['Tables']['kb_categories']['Row'];
type KBCategoryInsert = Database['public']['Tables']['kb_categories']['Insert'];
type KBCategoryUpdate = Database['public']['Tables']['kb_categories']['Update'];
type KBTag = Database['public']['Tables']['kb_tags']['Row'];
type KBArticleVersion = Database['public']['Tables']['kb_article_versions']['Row'];

export type { KBArticle, KBCategory, KBTag, KBArticleVersion };

export interface KBArticleWithDetails extends KBArticle {
  kb_categories?: Pick<KBCategory, 'id' | 'name' | 'slug' | 'color' | 'icon'> | null;
  profiles?: { id: string; full_name: string | null } | null;
  tags?: KBTag[];
}

export interface KBCategoryWithCount extends KBCategory {
  article_count?: number;
}

export interface KBFilters {
  search?: string;
  category_id?: string | null;
  status?: string;
  is_featured?: boolean;
  tag_id?: string;
}

export interface KBStats {
  total: number;
  published: number;
  drafts: number;
  categories: number;
  featured: number;
}

function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .substring(0, 80);
}

export async function getKBCategories(): Promise<KBCategoryWithCount[]> {
  const { data: categories, error } = await supabase
    .from('kb_categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;

  const { data: articleCounts } = await supabase
    .from('kb_articles')
    .select('category_id')
    .eq('status', 'published');

  const countMap: Record<string, number> = {};
  if (articleCounts) {
    for (const a of articleCounts) {
      if (a.category_id) {
        countMap[a.category_id] = (countMap[a.category_id] || 0) + 1;
      }
    }
  }

  return (categories || []).map((c) => ({
    ...c,
    article_count: countMap[c.id] || 0,
  }));
}

export async function getAllKBCategories(): Promise<KBCategory[]> {
  const { data, error } = await supabase
    .from('kb_categories')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createKBCategory(input: { name: string; description?: string; parent_id?: string | null; color?: string; icon?: string; sort_order?: number }): Promise<KBCategory> {
  const slug = generateSlug(input.name);
  const payload = {
    name: input.name,
    slug,
    description: input.description || null,
    parent_id: input.parent_id || null,
    color: input.color || null,
    icon: input.icon || null,
    sort_order: input.sort_order ?? 0,
    is_active: true,
  } as KBCategoryInsert;
  const { data, error } = await supabase.from('kb_categories').insert(payload).select().maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Failed to create category');
  return data;
}

export async function updateKBCategory(id: string, input: Partial<{ name: string; description: string; parent_id: string | null; color: string; icon: string; sort_order: number; is_active: boolean }>): Promise<KBCategory> {
  const update: KBCategoryUpdate = { ...input, updated_at: new Date().toISOString() };
  if (input.name) update.slug = generateSlug(input.name);
  const { data, error } = await supabase.from('kb_categories').update(update).eq('id', id).select().maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Failed to update category');
  return data;
}

export async function deleteKBCategory(id: string): Promise<void> {
  const { error } = await supabase.from('kb_categories').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function getKBArticles(filters?: KBFilters): Promise<KBArticleWithDetails[]> {
  let query = supabase
    .from('kb_articles')
    .select(`
      *,
      kb_categories ( id, name, slug, color, icon ),
      profiles!kb_articles_author_profile_fkey ( id, full_name )
    `)
    .order('updated_at', { ascending: false });

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  if (filters?.category_id) {
    query = query.eq('category_id', filters.category_id);
  }

  if (filters?.is_featured === true) {
    query = query.eq('is_featured', true);
  }

  if (filters?.search) {
    const s = sanitizeFilterValue(filters.search);
    query = query.or(`title.ilike.%${s}%,excerpt.ilike.%${s}%,content.ilike.%${s}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  const articles = (data || []) as KBArticleWithDetails[];

  if (articles.length === 0) return articles;

  const articleIds = articles.map((a) => a.id);
  const { data: tagLinks } = await supabase
    .from('kb_article_tags')
    .select('article_id, kb_tags ( id, name, slug )')
    .in('article_id', articleIds)
    .is('deleted_at', null);

  if (tagLinks) {
    const tagMap: Record<string, KBTag[]> = {};
    for (const link of tagLinks as any[]) {
      if (link.kb_tags) {
        if (!tagMap[link.article_id]) tagMap[link.article_id] = [];
        tagMap[link.article_id].push(link.kb_tags);
      }
    }
    for (const article of articles) {
      article.tags = tagMap[article.id] || [];
    }
  }

  if (filters?.tag_id) {
    return articles.filter((a) => a.tags?.some((t) => t.id === filters.tag_id));
  }

  return articles;
}

export async function getKBArticleById(id: string): Promise<KBArticleWithDetails | null> {
  const { data, error } = await supabase
    .from('kb_articles')
    .select(`
      *,
      kb_categories ( id, name, slug, color, icon ),
      profiles!kb_articles_author_profile_fkey ( id, full_name )
    `)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const article = data as KBArticleWithDetails;

  const { data: tagLinks } = await supabase
    .from('kb_article_tags')
    .select('article_id, kb_tags ( id, name, slug )')
    .eq('article_id', id)
    .is('deleted_at', null);

  article.tags = tagLinks ? (tagLinks as any[]).map((l) => l.kb_tags).filter(Boolean) : [];

  return article;
}

export async function createKBArticle(input: {
  title: string;
  content: string;
  excerpt?: string;
  category_id?: string | null;
  status?: string;
  is_featured?: boolean;
  author_id: string;
  tag_ids?: string[];
  change_notes?: string;
}): Promise<KBArticle> {
  const slug = generateSlug(input.title) + '-' + Date.now();
  const payload = {
    title: input.title,
    slug,
    content: input.content,
    excerpt: input.excerpt || null,
    category_id: input.category_id || null,
    status: input.status || 'draft',
    is_featured: input.is_featured || false,
    author_id: input.author_id,
    version: 1,
    view_count: 0,
    published_at: input.status === 'published' ? new Date().toISOString() : null,
  } as KBArticleInsert;

  const { data, error } = await supabase.from('kb_articles').insert(payload).select().maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Failed to create article');

  const { error: versionError } = await supabase.from('kb_article_versions').insert({
    article_id: data.id,
    version_number: 1,
    title: data.title,
    content: data.content,
    created_by: input.author_id,
    change_notes: input.change_notes || 'Initial version',
  } as never);
  if (versionError) throw versionError;

  if (input.tag_ids && input.tag_ids.length > 0) {
    await supabase.from('kb_article_tags').insert(
      input.tag_ids.map((tag_id) => ({ article_id: data.id, tag_id })) as never
    );
  }

  return data;
}

export async function updateKBArticle(
  id: string,
  input: {
    title?: string;
    content?: string;
    excerpt?: string;
    category_id?: string | null;
    status?: string;
    is_featured?: boolean;
    author_id: string;
    tag_ids?: string[];
    change_notes?: string;
  }
): Promise<KBArticle> {
  const current = await supabase.from('kb_articles').select('version, title, content, published_at').eq('id', id).maybeSingle();
  if (current.error) throw current.error;

  const currentVersion = current.data?.version || 1;
  const newVersion = currentVersion + 1;

  const update: KBArticleUpdate = {
    updated_at: new Date().toISOString(),
    version: newVersion,
  };

  if (input.title !== undefined) update.title = input.title;
  if (input.content !== undefined) update.content = input.content;
  if (input.excerpt !== undefined) update.excerpt = input.excerpt;
  if (input.category_id !== undefined) update.category_id = input.category_id;
  if (input.is_featured !== undefined) update.is_featured = input.is_featured;
  if (input.status !== undefined) {
    update.status = input.status;
    if (input.status === 'published' && !current.data?.published_at) {
      update.published_at = new Date().toISOString();
    }
  }

  const { data, error } = await supabase.from('kb_articles').update(update).eq('id', id).select().maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Failed to update article');

  const { error: versionError } = await supabase.from('kb_article_versions').insert({
    article_id: id,
    version_number: newVersion,
    title: data.title,
    content: data.content,
    created_by: input.author_id,
    change_notes: input.change_notes || '',
  } as never);
  if (versionError) throw versionError;

  if (input.tag_ids !== undefined) {
    const { data: existingLinks } = await supabase
      .from('kb_article_tags')
      .select('id, tag_id')
      .eq('article_id', id)
      .is('deleted_at', null);

    const existing = (existingLinks || []) as { id: string; tag_id: string }[];
    const desired = new Set(input.tag_ids);
    const activeTagIds = new Set(existing.map((l) => l.tag_id));

    const removeIds = existing.filter((l) => !desired.has(l.tag_id)).map((l) => l.id);
    if (removeIds.length > 0) {
      await supabase.from('kb_article_tags').update({ deleted_at: new Date().toISOString() } as never).in('id', removeIds);
    }

    const addTagIds = input.tag_ids.filter((tag_id) => !activeTagIds.has(tag_id));
    if (addTagIds.length > 0) {
      await supabase.from('kb_article_tags').insert(
        addTagIds.map((tag_id) => ({ article_id: id, tag_id })) as never
      );
    }
  }

  return data;
}

export async function deleteKBArticle(id: string): Promise<void> {
  const { error } = await supabase
    .from('kb_articles')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function incrementViewCount(id: string): Promise<void> {
  const { data } = await supabase
    .from('kb_articles')
    .select('view_count')
    .eq('id', id)
    .maybeSingle();

  if (data) {
    await supabase
      .from('kb_articles')
      .update({ view_count: (data.view_count || 0) + 1 })
      .eq('id', id);
  }
}

export async function getKBTags(): Promise<KBTag[]> {
  const { data, error } = await supabase.from('kb_tags').select('*').order('name', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createKBTag(name: string): Promise<KBTag> {
  const slug = generateSlug(name);
  const { data, error } = await supabase.from('kb_tags').insert({ name, slug } as never).select().maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Failed to create tag');
  return data;
}

export async function getKBArticleVersions(articleId: string): Promise<KBArticleVersion[]> {
  const { data, error } = await supabase
    .from('kb_article_versions')
    .select('*')
    .eq('article_id', articleId)
    .order('version_number', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getKBStats(): Promise<KBStats> {
  const { data, error } = await supabase.from('kb_articles').select('status, is_featured');
  if (error) throw error;

  const articles = data || [];
  const total = articles.length;
  const published = articles.filter((a) => a.status === 'published').length;
  const drafts = articles.filter((a) => a.status === 'draft').length;
  const featured = articles.filter((a) => a.is_featured).length;

  const { data: cats } = await supabase.from('kb_categories').select('id').eq('is_active', true);

  return {
    total,
    published,
    drafts,
    categories: cats?.length || 0,
    featured,
  };
}
