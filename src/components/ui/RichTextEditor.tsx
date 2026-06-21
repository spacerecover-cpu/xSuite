import React, { useRef, useEffect, useState, useId, forwardRef, useImperativeHandle } from 'react';
import { useTranslation } from 'react-i18next';
import { cva } from 'class-variance-authority';
import { sanitizeHtml } from '../../lib/sanitizeHtml';
import { cn } from '../../lib/utils';
import { STATUS_TONE_MUTED } from '../../lib/ui/variants';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Palette,
  Highlighter,
  List,
  ListOrdered,
  Undo,
  Redo,
  Eraser,
  Code,
  Zap,
  AlertTriangle,
  Link2,
  Image as ImageIcon,
  Table as TableIcon,
} from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
  label?: string;
  helpText?: string;
  /** Forwarded onto the editable region so a wrapping FormField can associate its label/hint/error. */
  id?: string;
  'aria-invalid'?: React.AriaAttributes['aria-invalid'];
  'aria-describedby'?: string;
  'aria-labelledby'?: string;
}

export const toolbarButtonVariants = cva(
  'p-2 hover:bg-slate-200 rounded transition-colors',
  {
    variants: {
      active: {
        true: 'bg-slate-200',
        false: '',
      },
    },
    defaultVariants: {
      active: false,
    },
  },
);

const PRESET_COLORS = [
  { name: 'Red (Warning)', value: '#ef4444' },
  { name: 'Orange (Caution)', value: '#f97316' },
  { name: 'Black', value: '#000000' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#10b981' },
];

const PRESET_HIGHLIGHTS = [
  { name: 'Yellow', value: '#fef08a' },
  { name: 'Red', value: '#fecaca' },
  { name: 'Green', value: '#bbf7d0' },
  { name: 'Blue', value: '#bfdbfe' },
  { name: 'None', value: 'transparent' },
];

export interface RichTextEditorHandle {
  /** Insert plain text (e.g. a {{variable}} token) at the caret. */
  insertAtCursor: (text: string) => void;
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(({
  value,
  onChange,
  placeholder,
  minHeight = '200px',
  label,
  helpText,
  id,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  'aria-labelledby': ariaLabelledBy,
}, ref) => {
  const { t } = useTranslation();
  const editorRef = useRef<HTMLDivElement>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [isSourceMode, setIsSourceMode] = useState(false);
  const [sourceValue, setSourceValue] = useState('');

  const reactId = useId();
  const colorPopoverId = `${reactId}-color`;
  const highlightPopoverId = `${reactId}-highlight`;

  const resolvedPlaceholder = placeholder ?? t('ui.richText.placeholder');

  useEffect(() => {
    if (editorRef.current && !isSourceMode) {
      const sanitized = sanitizeHtml(value || '');
      if (editorRef.current.innerHTML !== sanitized) {
        editorRef.current.innerHTML = sanitized;
      }
    }
  }, [value, isSourceMode]);

  const handleInput = () => {
    if (editorRef.current) {
      const newValue = sanitizeHtml(editorRef.current.innerHTML);
      if (newValue !== value) {
        onChange(newValue);
      }
    }
  };

  // Keep a live ref to handleInput so the imperative insertAtCursor (built once via
  // useImperativeHandle with []) never calls a stale closure over value/onChange.
  const handleInputRef = useRef(handleInput);
  handleInputRef.current = handleInput;
  // Live source-mode flag for the imperative handle (also built once with []).
  const isSourceModeRef = useRef(isSourceMode);
  isSourceModeRef.current = isSourceMode;

  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput();
  };

  useImperativeHandle(ref, () => ({
    insertAtCursor: (text: string) => {
      // In HTML source mode the contentEditable region is unmounted; append to the
      // source textarea instead so the token isn't silently dropped.
      if (isSourceModeRef.current) {
        setSourceValue((prev) => prev + text);
        return;
      }
      editorRef.current?.focus();
      document.execCommand('insertText', false, text);
      handleInputRef.current();
    },
  }), []);

  const insertLink = () => {
    const url = window.prompt(t('ui.richText.linkPrompt', 'Link URL (https://…)'));
    if (url) execCommand('createLink', url);
  };
  const insertImage = () => {
    const url = window.prompt(t('ui.richText.imagePrompt', 'Image URL (https://…)'));
    if (url) execCommand('insertImage', url);
  };
  const insertTable = () => {
    const html =
      '<table><tbody>' +
      '<tr><td>&nbsp;</td><td>&nbsp;</td></tr>' +
      '<tr><td>&nbsp;</td><td>&nbsp;</td></tr>' +
      '</tbody></table><p><br></p>';
    execCommand('insertHTML', html);
  };

  const applyTextColor = (color: string) => {
    execCommand('foreColor', color);
    setShowColorPicker(false);
  };

  const applyHighlight = (color: string) => {
    execCommand('backColor', color);
    setShowHighlightPicker(false);
  };

  const applyQuickFormat = (type: 'warning' | 'important') => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    if (type === 'warning') {
      execCommand('bold');
      execCommand('foreColor', '#ef4444');
    } else if (type === 'important') {
      execCommand('bold');
      execCommand('backColor', '#fef08a');
    }
  };

  const toggleSourceMode = () => {
    if (!isSourceMode) {
      setSourceValue(value || '');
      setIsSourceMode(true);
    } else {
      onChange(sanitizeHtml(sourceValue));
      setIsSourceMode(false);
    }
  };

  const formatButtons = [
    { icon: Bold, command: 'bold', title: 'Bold (Ctrl+B)', label: t('ui.richText.bold') },
    { icon: Italic, command: 'italic', title: 'Italic (Ctrl+I)', label: t('ui.richText.italic') },
    { icon: Underline, command: 'underline', title: 'Underline (Ctrl+U)', label: t('ui.richText.underline') },
    { icon: Strikethrough, command: 'strikeThrough', title: 'Strikethrough', label: t('ui.richText.strikethrough') },
  ];

  const listButtons = [
    { icon: List, command: 'insertUnorderedList', title: 'Bullet List', label: t('ui.richText.bulletList') },
    { icon: ListOrdered, command: 'insertOrderedList', title: 'Numbered List', label: t('ui.richText.numberedList') },
  ];

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}

      <div className="border border-slate-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary focus-within:border-primary">
        <div
          role="toolbar"
          aria-label={t('ui.richText.toolbar')}
          aria-controls={id}
          className="bg-slate-50 border-b border-slate-300 p-2 flex flex-wrap gap-1 items-center"
        >
          {formatButtons.map(({ icon: Icon, command, title, label: buttonLabel }) => (
            <button
              key={command}
              type="button"
              onClick={() => execCommand(command)}
              title={title}
              aria-label={buttonLabel}
              className={toolbarButtonVariants()}
            >
              <Icon className="w-4 h-4 text-slate-700" aria-hidden="true" />
            </button>
          ))}

          <div className="w-px h-6 bg-slate-300 mx-1" />

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowColorPicker(!showColorPicker);
                setShowHighlightPicker(false);
              }}
              title={t('ui.richText.textColor')}
              aria-label={t('ui.richText.textColor')}
              aria-haspopup="true"
              aria-expanded={showColorPicker}
              aria-controls={colorPopoverId}
              className={toolbarButtonVariants()}
            >
              <Palette className="w-4 h-4 text-slate-700" aria-hidden="true" />
            </button>
            {showColorPicker && (
              <div
                id={colorPopoverId}
                className="absolute top-full start-0 mt-1 bg-surface border border-slate-300 rounded-lg shadow-lg p-3 z-10 w-48"
              >
                <p className="text-xs font-medium text-slate-700 mb-2">{t('ui.richText.textColor')}</p>
                <div className="space-y-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => applyTextColor(color.value)}
                      className="w-full flex items-center gap-2 p-2 hover:bg-slate-100 rounded transition-colors"
                    >
                      <div
                        className="w-5 h-5 rounded border border-slate-300"
                        style={{ backgroundColor: color.value }}
                      />
                      <span className="text-sm text-slate-700">{color.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowHighlightPicker(!showHighlightPicker);
                setShowColorPicker(false);
              }}
              title={t('ui.richText.highlight')}
              aria-label={t('ui.richText.highlight')}
              aria-haspopup="true"
              aria-expanded={showHighlightPicker}
              aria-controls={highlightPopoverId}
              className={toolbarButtonVariants()}
            >
              <Highlighter className="w-4 h-4 text-slate-700" aria-hidden="true" />
            </button>
            {showHighlightPicker && (
              <div
                id={highlightPopoverId}
                className="absolute top-full start-0 mt-1 bg-surface border border-slate-300 rounded-lg shadow-lg p-3 z-10 w-48"
              >
                <p className="text-xs font-medium text-slate-700 mb-2">{t('ui.richText.highlight')}</p>
                <div className="space-y-2">
                  {PRESET_HIGHLIGHTS.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => applyHighlight(color.value)}
                      className="w-full flex items-center gap-2 p-2 hover:bg-slate-100 rounded transition-colors"
                    >
                      <div
                        className="w-5 h-5 rounded border border-slate-300"
                        style={{ backgroundColor: color.value }}
                      />
                      <span className="text-sm text-slate-700">{color.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="w-px h-6 bg-slate-300 mx-1" />

          {listButtons.map(({ icon: Icon, command, title, label: buttonLabel }) => (
            <button
              key={command}
              type="button"
              onClick={() => execCommand(command)}
              title={title}
              aria-label={buttonLabel}
              className={toolbarButtonVariants()}
            >
              <Icon className="w-4 h-4 text-slate-700" aria-hidden="true" />
            </button>
          ))}

          <div className="w-px h-6 bg-slate-300 mx-1" />

          <button
            type="button"
            onClick={() => execCommand('undo')}
            title="Undo (Ctrl+Z)"
            aria-label={t('ui.richText.undo')}
            className={toolbarButtonVariants()}
          >
            <Undo className="w-4 h-4 text-slate-700" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => execCommand('redo')}
            title="Redo (Ctrl+Y)"
            aria-label={t('ui.richText.redo')}
            className={toolbarButtonVariants()}
          >
            <Redo className="w-4 h-4 text-slate-700" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => execCommand('removeFormat')}
            title="Clear Formatting"
            aria-label={t('ui.richText.clearFormatting')}
            className={toolbarButtonVariants()}
          >
            <Eraser className="w-4 h-4 text-slate-700" aria-hidden="true" />
          </button>

          <div className="w-px h-6 bg-slate-300 mx-1" />

          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-600 me-1">{t('ui.richText.quickLabel')}:</span>
            <button
              type="button"
              onClick={() => applyQuickFormat('warning')}
              title={t('ui.richText.warningTitle')}
              aria-label={t('ui.richText.warningTitle')}
              className={cn(
                'px-2 py-1 text-xs rounded transition-colors font-semibold',
                STATUS_TONE_MUTED.danger,
                'hover:bg-danger/20',
              )}
            >
              <AlertTriangle className="w-3 h-3 inline me-1" aria-hidden="true" />
              {t('ui.richText.warning')}
            </button>
            <button
              type="button"
              onClick={() => applyQuickFormat('important')}
              title={t('ui.richText.importantTitle')}
              aria-label={t('ui.richText.importantTitle')}
              className={cn(
                'px-2 py-1 text-xs rounded transition-colors font-semibold',
                STATUS_TONE_MUTED.warning,
                'hover:bg-warning/20',
              )}
            >
              <Zap className="w-3 h-3 inline me-1" aria-hidden="true" />
              {t('ui.richText.important')}
            </button>
          </div>

          <div className="w-px h-6 bg-slate-300 mx-1" />

          <button type="button" onClick={insertLink} title="Insert Link"
            aria-label={t('ui.richText.insertLink', 'Insert link')} className={toolbarButtonVariants()}>
            <Link2 className="w-4 h-4 text-slate-700" aria-hidden="true" />
          </button>
          <button type="button" onClick={insertImage} title="Insert Image"
            aria-label={t('ui.richText.insertImage', 'Insert image')} className={toolbarButtonVariants()}>
            <ImageIcon className="w-4 h-4 text-slate-700" aria-hidden="true" />
          </button>
          <button type="button" onClick={insertTable} title="Insert Table"
            aria-label={t('ui.richText.insertTable', 'Insert table')} className={toolbarButtonVariants()}>
            <TableIcon className="w-4 h-4 text-slate-700" aria-hidden="true" />
          </button>

          <div className="flex-1" />

          <button
            type="button"
            onClick={toggleSourceMode}
            title="View HTML Source"
            aria-label={t('ui.richText.viewSource')}
            aria-pressed={isSourceMode}
            className={toolbarButtonVariants({ active: isSourceMode })}
          >
            <Code className="w-4 h-4 text-slate-700" aria-hidden="true" />
          </button>
        </div>

        {isSourceMode ? (
          <textarea
            value={sourceValue}
            onChange={(e) => setSourceValue(e.target.value)}
            className="w-full p-3 font-mono text-sm focus:outline-none resize-none"
            style={{ minHeight }}
            placeholder={t('ui.richText.sourcePlaceholder')}
          />
        ) : (
          <div
            ref={editorRef}
            id={id}
            role="textbox"
            aria-multiline="true"
            aria-invalid={ariaInvalid}
            aria-describedby={ariaDescribedBy}
            aria-labelledby={ariaLabelledBy}
            contentEditable
            onInput={handleInput}
            className="w-full p-3 focus:outline-none prose max-w-none"
            style={{ minHeight }}
            suppressContentEditableWarning
            data-placeholder={resolvedPlaceholder}
          />
        )}
      </div>

      {helpText && (
        <p className="text-sm text-slate-600">{helpText}</p>
      )}

      <style>{`
        [contentEditable][data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: #94a3b8;
          pointer-events: none;
          position: absolute;
        }

        [contentEditable] {
          outline: none;
        }

        [contentEditable] ul,
        [contentEditable] ol {
          padding-left: 1.5rem;
        }

        [contentEditable] ul {
          list-style-type: disc;
        }

        [contentEditable] ol {
          list-style-type: decimal;
        }

        [contentEditable] strong,
        [contentEditable] b {
          font-weight: bold;
        }

        [contentEditable] em,
        [contentEditable] i {
          font-style: italic;
        }

        [contentEditable] u {
          text-decoration: underline;
        }

        [contentEditable] strike,
        [contentEditable] s {
          text-decoration: line-through;
        }

        [contentEditable] table {
          border-collapse: collapse;
          width: 100%;
        }
        [contentEditable] td,
        [contentEditable] th {
          border: 1px solid #cbd5e1;
          padding: 4px 6px;
        }
      `}</style>
    </div>
  );
});

RichTextEditor.displayName = 'RichTextEditor';
