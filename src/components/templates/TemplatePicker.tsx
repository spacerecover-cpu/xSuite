import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Eye, FileText, Settings2, X as XIcon } from 'lucide-react';
import {
  listTemplates,
  recordTemplateUsage,
  type DocumentTemplate,
  type TemplateTypeCode,
} from '../../lib/documentTemplatesService';
import {
  buildTemplateContext,
  type ContextRefs,
} from '../../lib/templateContextService';
import { renderTemplate } from '../../lib/templateEngine';
import { sanitizeHtml, stripHtmlTags } from '../../lib/sanitizeHtml';
import { templateKeys } from '../../lib/queryKeys';
import { useAuth } from '../../contexts/AuthContext';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';

export interface AppliedTemplate {
  templateId: string | null;
  subject?: string;
  body: string;
}

interface TemplatePickerProps {
  typeCode: TemplateTypeCode;
  /** Narrows email templates to one DocumentType (quote, invoice, …). */
  documentType?: string;
  /** Entity ids used to build the variable context (case, quote, invoice, customer). */
  contextRefs: ContextRefs;
  /** Receives the rendered (and channel-appropriate) subject/body on apply. */
  onApply: (applied: AppliedTemplate) => void;
  /** 'plain' strips HTML for textarea/SMS/WhatsApp targets; 'html' sanitizes. */
  channel?: 'plain' | 'html';
  /** Apply the tenant default automatically when the picker mounts. */
  autoApplyDefault?: boolean;
  label?: string;
  disabled?: boolean;
}

/**
 * The one template-selection control mounted on every compose surface
 * (EmailDocumentModal, SendMessageModal, …). Lists active tenant templates for
 * a type, previews them rendered against the real case/customer context, and
 * applies the substituted content via onApply.
 */
export const TemplatePicker: React.FC<TemplatePickerProps> = ({
  typeCode,
  documentType,
  contextRefs,
  onApply,
  channel = 'plain',
  autoApplyDefault = false,
  label = 'Template',
  disabled,
}) => {
  const { profile } = useAuth();
  const [selectedId, setSelectedId] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const autoAppliedRef = useRef(false);

  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: templateKeys.list(typeCode, documentType),
    queryFn: () => listTemplates(typeCode, { documentType }),
    staleTime: 60 * 1000,
  });

  const { data: context } = useQuery({
    queryKey: templateKeys.context(contextRefs as Record<string, unknown>),
    queryFn: () => buildTemplateContext(contextRefs),
    enabled: templates.length > 0,
    staleTime: 60 * 1000,
  });

  const selected: DocumentTemplate | undefined = useMemo(
    () => templates.find((t) => t.id === selectedId),
    [templates, selectedId]
  );

  const renderForChannel = (template: DocumentTemplate): AppliedTemplate => {
    const ctx = context ?? {};
    const renderedBody = renderTemplate(template.content, ctx);
    const body = channel === 'plain' ? stripHtmlTags(renderedBody) : sanitizeHtml(renderedBody);
    const subject = template.subjectLine
      ? renderTemplate(template.subjectLine, ctx)
      : undefined;
    return { templateId: template.id, subject, body };
  };

  const applyTemplate = (template: DocumentTemplate) => {
    onApply(renderForChannel(template));
    void recordTemplateUsage(template.id);
  };

  // Auto-apply the tenant default once per mount, after templates AND context
  // resolve (the modal pre-fills its hardcoded fallback before this fires).
  useEffect(() => {
    if (!autoApplyDefault || autoAppliedRef.current) return;
    if (templates.length === 0 || context === undefined) return;
    autoAppliedRef.current = true;
    const defaultTemplate = templates[0]; // listTemplates orders default-first
    setSelectedId(defaultTemplate.id);
    applyTemplate(defaultTemplate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoApplyDefault, templates, context]);

  const canManage = profile?.role === 'owner' || profile?.role === 'admin';

  if (!templatesLoading && templates.length === 0) {
    if (!canManage) return null;
    return (
      <p className="text-xs text-slate-400">
        No saved templates for this type yet.{' '}
        <Link
          to={`/templates/type/${typeCode}`}
          target="_blank"
          className="text-primary hover:text-primary/80 font-medium"
        >
          Manage templates
        </Link>
      </p>
    );
  }

  const preview = selected ? renderForChannel(selected) : null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Select
            label={label}
            value={selectedId}
            onChange={(e) => {
              const id = e.target.value;
              setSelectedId(id);
              const template = templates.find((t) => t.id === id);
              if (template) applyTemplate(template);
            }}
            disabled={disabled || templatesLoading}
            placeholder={templatesLoading ? 'Loading templates…' : 'Choose a template…'}
            options={templates.map((t) => ({
              value: t.id,
              label: t.isDefault ? `${t.name} (Default)` : t.name,
            }))}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mb-0.5"
          onClick={() => setShowPreview(true)}
          disabled={disabled || !selected}
          title="Preview with this record's data"
        >
          <Eye className="w-4 h-4" />
        </Button>
      </div>

      {canManage && (
        <Link
          to={`/templates/type/${typeCode}`}
          target="_blank"
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-primary transition-colors"
        >
          <Settings2 className="w-3 h-3" />
          Manage templates
        </Link>
      )}

      {showPreview && selected && preview && (
        <div className="border border-slate-200 rounded-lg bg-slate-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <FileText className="w-4 h-4 text-primary" />
              {selected.name}
            </div>
            <button
              type="button"
              onClick={() => setShowPreview(false)}
              className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
              aria-label="Close template preview"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="p-3 space-y-2 max-h-56 overflow-y-auto">
            {preview.subject !== undefined && (
              <p className="text-sm text-slate-700">
                <span className="font-medium">Subject:</span> {preview.subject}
              </p>
            )}
            {channel === 'html' ? (
              <div
                className="prose prose-sm max-w-none text-slate-700"
                dangerouslySetInnerHTML={{ __html: preview.body }}
              />
            ) : (
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{preview.body}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
