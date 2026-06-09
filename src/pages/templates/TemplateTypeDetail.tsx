import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Edit,
  Copy,
  Trash2,
  Eye,
  Star,
  Calendar,
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { formatDate } from '../../lib/format';
import { sanitizeHtml } from '../../lib/sanitizeHtml';
import { LineItemTemplateFormModal } from '../../components/templates/LineItemTemplateFormModal';
import { logger } from '../../lib/logger';
import { useAuth } from '../../contexts/AuthContext';
import type { Database } from '../../types/database.types';

type DocumentTemplateInsert = Database['public']['Tables']['document_templates']['Insert'];
type DocumentTemplateUpdate = Database['public']['Tables']['document_templates']['Update'];

interface Template {
  id: string;
  name: string;
  description: string | null;
  content: string | null;
  is_default: boolean | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
  template_type_id: string | null;
  category_id: string | null;
}

interface TemplateType {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
}

export const TemplateTypeDetail: React.FC = () => {
  const { typeCode } = useParams<{ typeCode: string }>();
  const navigate = useNavigate();
  const [templateType, setTemplateType] = useState<TemplateType | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { profile } = useAuth();

  useEffect(() => {
    if (typeCode) {
      loadData();
    }
  }, [typeCode]);

  const loadData = async () => {
    if (!typeCode) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const { data: typeData } = await supabase
        .from('master_template_types')
        .select('id, name, code, description')
        .eq('code', typeCode)
        .maybeSingle();

      if (typeData) {
        setTemplateType({
          id: typeData.id,
          name: typeData.name,
          code: typeData.code,
          description: typeData.description,
        });

        const { data: templatesData } = await supabase
          .from('document_templates')
          .select('id, name, description, content, is_default, is_active, created_at, updated_at, template_type_id, category_id')
          .eq('template_type_id', typeData.id)
          .eq('is_active', true)
          .order('is_default', { ascending: false })
          .order('name');

        setTemplates(templatesData ?? []);
      }
    } catch (error) {
      logger.error('Error loading templates:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!selectedTemplate) return;

    try {
      const { error } = await supabase
        .from('document_templates')
        .update({ is_active: false })
        .eq('id', selectedTemplate.id);

      if (!error) {
        setShowDeleteConfirm(false);
        setSelectedTemplate(null);
        await loadData();
      }
    } catch (error) {
      logger.error('Error deleting template:', error);
    }
  };

  const handleDuplicateTemplate = async (template: Template) => {
    try {
      if (!templateType?.id || !profile?.tenant_id) return;
      const insertPayload: DocumentTemplateInsert = {
        template_type_id: templateType.id,
        tenant_id: profile.tenant_id,
        name: `${template.name} (Copy)`,
        description: template.description,
        content: template.content,
        category_id: template.category_id,
        is_default: false,
        is_active: true,
      };
      const { error } = await supabase
        .from('document_templates')
        .insert(insertPayload);

      if (!error) {
        await loadData();
      }
    } catch (error) {
      logger.error('Error duplicating template:', error);
    }
  };

  const handleSaveTemplate = async (templateData: Record<string, unknown>) => {
    try {
      if (selectedTemplate) {
        const updatePayload = templateData as DocumentTemplateUpdate;
        const { error } = await supabase
          .from('document_templates')
          .update(updatePayload)
          .eq('id', selectedTemplate.id);

        if (error) throw error;
      } else {
        if (!profile?.tenant_id) throw new Error('No active tenant');
        const insertPayload = {
          ...(templateData as Omit<DocumentTemplateInsert, 'tenant_id'>),
          tenant_id: profile.tenant_id,
        } as DocumentTemplateInsert;
        const { error } = await supabase
          .from('document_templates')
          .insert(insertPayload);

        if (error) throw error;
      }

      await loadData();
      setShowFormModal(false);
      setSelectedTemplate(null);
    } catch (error) {
      throw error;
    }
  };

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

  if (!templateType) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Template type not found</h2>
        <Button onClick={() => navigate('/templates')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Templates
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/templates')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{templateType.name}</h1>
            <p className="mt-1 text-slate-600">{templateType.description}</p>
          </div>
        </div>
        <Button onClick={() => {
          setSelectedTemplate(null);
          setShowFormModal(true);
        }}>
          <Plus className="w-4 h-4 mr-2" />
          New Template
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Total Templates</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{templates.length}</p>
            </div>
            <div className="w-12 h-12 bg-cat-7/10 rounded-lg flex items-center justify-center">
              <Copy className="w-6 h-6 text-cat-7" />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Default Template</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {templates.filter(t => t.is_default).length}
              </p>
            </div>
            <div className="w-12 h-12 bg-cat-4/10 rounded-lg flex items-center justify-center">
              <Star className="w-6 h-6 text-cat-4" />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">Last Updated</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {templates.length > 0 ? formatDate(templates[0].updated_at) : '—'}
              </p>
            </div>
            <div className="w-12 h-12 bg-cat-3/10 rounded-lg flex items-center justify-center">
              <Calendar className="w-6 h-6 text-cat-3" />
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-3">
        {templates.map((template) => (
          <Card key={template.id} className="p-6 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-semibold text-slate-900">{template.name}</h3>
                  {template.is_default && (
                    <Badge variant="warning">
                      <Star className="w-3 h-3 mr-1" />
                      Default
                    </Badge>
                  )}
                </div>

                {template.description && (
                  <p className="text-sm text-slate-600 mb-3">{template.description}</p>
                )}

                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span>Created {formatDate(template.created_at)}</span>
                  <span>Updated {formatDate(template.updated_at)}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedTemplate(template);
                    setShowPreview(true);
                  }}
                >
                  <Eye className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedTemplate(template);
                    setShowFormModal(true);
                  }}
                >
                  <Edit className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDuplicateTemplate(template)}
                >
                  <Copy className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedTemplate(template);
                    setShowDeleteConfirm(true);
                  }}
                >
                  <Trash2 className="w-4 h-4 text-danger" />
                </Button>
              </div>
            </div>
          </Card>
        ))}

        {templates.length === 0 && (
          <Card className="p-12 text-center">
            <Copy className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No templates yet</h3>
            <p className="text-slate-600 mb-4">
              Create your first {templateType.name.toLowerCase()} template
            </p>
            <Button onClick={() => {
              setSelectedTemplate(null);
              setShowFormModal(true);
            }}>
              <Plus className="w-4 h-4 mr-2" />
              Create Template
            </Button>
          </Card>
        )}
      </div>

      {showPreview && selectedTemplate && (
        <Modal
          isOpen={showPreview}
          onClose={() => setShowPreview(false)}
          title={selectedTemplate.name}
        >
          <div className="prose max-w-none">
            <div
              className="border border-slate-200 rounded-lg p-4 prose max-w-none"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedTemplate.content || '') }}
            />
          </div>
        </Modal>
      )}

      {showDeleteConfirm && selectedTemplate && (
        <Modal
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          title="Delete Template"
        >
          <div className="space-y-4">
            <p className="text-slate-700">
              Are you sure you want to delete the template "{selectedTemplate.name}"?
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleDeleteTemplate}
              >
                Delete Template
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {showFormModal && templateType && (
        <LineItemTemplateFormModal
          isOpen={showFormModal}
          onClose={() => {
            setShowFormModal(false);
            setSelectedTemplate(null);
          }}
          onSave={handleSaveTemplate}
          initialData={selectedTemplate ? { ...selectedTemplate } : undefined}
          templateTypeId={templateType.id}
          isLineItemType={false}
        />
      )}
    </div>
  );
};
