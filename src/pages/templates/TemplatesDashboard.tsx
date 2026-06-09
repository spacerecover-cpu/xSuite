import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Mail,
  MessageSquare,
  FileCheck,
  Shield,
  Plus,
  Search,
  LayoutGrid,
  List as ListIcon,
  Sparkles,
  ArrowLeft,
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { seedTemplates } from '../../lib/seedService';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { SeedingResultsDisplay } from '../../components/settings/SeedingResultsDisplay';
import { logger } from '../../lib/logger';

interface TemplateCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  template_count: number;
}

interface TemplateType {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  template_count: number;
}

export const TemplatesDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<TemplateCategory[]>([]);
  const [templateTypes, setTemplateTypes] = useState<TemplateType[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isLoading, setIsLoading] = useState(true);
  const [seedingResults, setSeedingResults] = useState<any>(null);
  const [showSeedingResults, setShowSeedingResults] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const { data: categoriesData } = await supabase
        .from('master_template_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      const { data: typesData } = await supabase
        .from('master_template_types')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      const { data: templatesData } = await supabase
        .from('document_templates')
        .select('id, template_type_id, category_id')
        .eq('is_active', true);

      const typeCounts: Record<string, number> = {};
      const categoryCounts: Record<string, number> = {};
      templatesData?.forEach((t) => {
        if (t.template_type_id) {
          typeCounts[t.template_type_id] = (typeCounts[t.template_type_id] || 0) + 1;
        }
        if (t.category_id) {
          categoryCounts[t.category_id] = (categoryCounts[t.category_id] || 0) + 1;
        }
      });

      const enrichedTypes: TemplateType[] = typesData?.map(type => ({
        id: type.id,
        name: type.name,
        code: type.code,
        description: type.description,
        template_count: typeCounts[type.id] || 0,
      })) || [];

      const enrichedCategories: TemplateCategory[] = categoriesData?.map(cat => ({
        id: cat.id,
        name: cat.name,
        description: '',
        icon: 'FileText',
        color: '#3b82f6',
        template_count: categoryCounts[cat.id] || 0,
      })) || [];

      setCategories(enrichedCategories);
      setTemplateTypes(enrichedTypes);
    } catch (error) {
      logger.error('Error loading templates:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSeedTemplates = async () => {
    setIsSeeding(true);
    try {
      const result = await seedTemplates();
      setSeedingResults(result);
      setShowSeedingResults(true);

      if (result.success) {
        await loadData();
      }
    } catch (error) {
      logger.error('Error seeding templates:', error);
    } finally {
      setIsSeeding(false);
    }
  };

  const getIconComponent = (iconName: string) => {
    const icons: Record<string, any> = {
      FileText,
      Mail,
      MessageSquare,
      FileCheck,
      Shield,
    };
    return icons[iconName] || FileText;
  };

  const filteredTypes = templateTypes.filter(type => {
    const matchesSearch = type.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         type.description?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const totalTemplates = templateTypes.reduce((sum, type) => sum + type.template_count, 0);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/settings')}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Templates</h1>
          <p className="mt-1 text-slate-600">Manage document and communication templates</p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={handleSeedTemplates}
            disabled={isSeeding}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {isSeeding ? 'Seeding...' : 'Seed Sample Templates'}
          </Button>
          <Button onClick={() => navigate('/templates/new')}>
            <Plus className="w-4 h-4 mr-2" />
            New Template
          </Button>
        </div>
      </div>

      {showSeedingResults && seedingResults && (
        <SeedingResultsDisplay
          details={seedingResults.details}
          message={seedingResults.message}
          onClose={() => setShowSeedingResults(false)}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Total Templates</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{totalTemplates}</p>
            </div>
            <div className="w-12 h-12 bg-cat-7/10 rounded-lg flex items-center justify-center">
              <FileText className="w-6 h-6 text-cat-7" />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Categories</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{categories.length}</p>
            </div>
            <div className="w-12 h-12 bg-cat-3/10 rounded-lg flex items-center justify-center">
              <LayoutGrid className="w-6 h-6 text-cat-3" />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Template Types</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{templateTypes.length}</p>
            </div>
            <div className="w-12 h-12 bg-accent rounded-lg flex items-center justify-center">
              <ListIcon className="w-6 h-6 text-accent-foreground" />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Active</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{totalTemplates}</p>
            </div>
            <div className="w-12 h-12 bg-cat-2/10 rounded-lg flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-cat-2" />
            </div>
          </div>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
            <Input
              type="text"
              placeholder="Search templates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <select
            value={selectedCategory || ''}
            onChange={(e) => setSelectedCategory(e.target.value || null)}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          <div className="flex border border-slate-300 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-2 ${viewMode === 'grid' ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-2 border-l border-slate-300 ${viewMode === 'list' ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <ListIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Template Categories</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((category) => {
              const Icon = getIconComponent(category.icon);
              return (
                <Card
                  key={category.id}
                  className="p-6 cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => setSelectedCategory(category.id)}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div
                      className="w-12 h-12 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${category.color}20` }}
                    >
                      <Icon className="w-6 h-6" style={{ color: category.color }} />
                    </div>
                    <Badge variant="secondary">{category.template_count}</Badge>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">{category.name}</h3>
                  <p className="text-sm text-slate-600">{category.description}</p>
                </Card>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">
              {selectedCategory ? 'Filtered ' : 'All '}Template Types
            </h2>
            {selectedCategory && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedCategory(null)}
              >
                Clear Filter
              </Button>
            )}
          </div>

          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTypes.map((type) => (
                <Card
                  key={type.id}
                  className="p-6 cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => navigate(`/templates/type/${type.code}`)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-lg font-semibold text-slate-900">{type.name}</h3>
                    <Badge variant={type.template_count > 0 ? 'success' : 'secondary'}>
                      {type.template_count}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-600 mb-4">{type.description}</p>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Code: {type.code}</span>
                    {type.template_count === 0 && (
                      <span className="text-warning">No templates</span>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTypes.map((type) => (
                <Card
                  key={type.id}
                  className="p-4 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => navigate(`/templates/type/${type.code}`)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-slate-900">{type.name}</h3>
                        <Badge variant={type.template_count > 0 ? 'success' : 'secondary'}>
                          {type.template_count}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-600 mt-1">{type.description}</p>
                    </div>
                    <div className="text-sm text-slate-500">
                      {type.code}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {filteredTypes.length === 0 && (
            <Card className="p-12 text-center">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No templates found</h3>
              <p className="text-slate-600 mb-4">
                {searchTerm
                  ? 'Try adjusting your search terms'
                  : 'Get started by creating your first template'}
              </p>
              <Button onClick={() => navigate('/templates/new')}>
                <Plus className="w-4 h-4 mr-2" />
                Create Template
              </Button>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
