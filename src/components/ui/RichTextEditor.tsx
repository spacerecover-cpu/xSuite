import React, { useRef, useEffect, useState } from 'react';
import { sanitizeHtml } from '../../lib/sanitizeHtml';
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

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder = 'Enter text...',
  minHeight = '200px',
  label,
  helpText,
  id,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  'aria-labelledby': ariaLabelledBy,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [isSourceMode, setIsSourceMode] = useState(false);
  const [sourceValue, setSourceValue] = useState('');

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
      const newValue = editorRef.current.innerHTML;
      if (newValue !== value) {
        onChange(newValue);
      }
    }
  };

  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput();
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
      onChange(sourceValue);
      setIsSourceMode(false);
    }
  };

  const formatButtons = [
    { icon: Bold, command: 'bold', title: 'Bold (Ctrl+B)' },
    { icon: Italic, command: 'italic', title: 'Italic (Ctrl+I)' },
    { icon: Underline, command: 'underline', title: 'Underline (Ctrl+U)' },
    { icon: Strikethrough, command: 'strikeThrough', title: 'Strikethrough' },
  ];

  const listButtons = [
    { icon: List, command: 'insertUnorderedList', title: 'Bullet List' },
    { icon: ListOrdered, command: 'insertOrderedList', title: 'Numbered List' },
  ];

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}

      <div className="border border-slate-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary focus-within:border-primary">
        <div className="bg-slate-50 border-b border-slate-300 p-2 flex flex-wrap gap-1 items-center">
          {formatButtons.map(({ icon: Icon, command, title }) => (
            <button
              key={command}
              type="button"
              onClick={() => execCommand(command)}
              title={title}
              className="p-2 hover:bg-slate-200 rounded transition-colors"
            >
              <Icon className="w-4 h-4 text-slate-700" />
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
              title="Text Color"
              className="p-2 hover:bg-slate-200 rounded transition-colors"
            >
              <Palette className="w-4 h-4 text-slate-700" />
            </button>
            {showColorPicker && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-lg p-3 z-10 w-48">
                <p className="text-xs font-medium text-slate-700 mb-2">Text Color</p>
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
              title="Highlight"
              className="p-2 hover:bg-slate-200 rounded transition-colors"
            >
              <Highlighter className="w-4 h-4 text-slate-700" />
            </button>
            {showHighlightPicker && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-lg p-3 z-10 w-48">
                <p className="text-xs font-medium text-slate-700 mb-2">Highlight</p>
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

          {listButtons.map(({ icon: Icon, command, title }) => (
            <button
              key={command}
              type="button"
              onClick={() => execCommand(command)}
              title={title}
              className="p-2 hover:bg-slate-200 rounded transition-colors"
            >
              <Icon className="w-4 h-4 text-slate-700" />
            </button>
          ))}

          <div className="w-px h-6 bg-slate-300 mx-1" />

          <button
            type="button"
            onClick={() => execCommand('undo')}
            title="Undo (Ctrl+Z)"
            className="p-2 hover:bg-slate-200 rounded transition-colors"
          >
            <Undo className="w-4 h-4 text-slate-700" />
          </button>

          <button
            type="button"
            onClick={() => execCommand('redo')}
            title="Redo (Ctrl+Y)"
            className="p-2 hover:bg-slate-200 rounded transition-colors"
          >
            <Redo className="w-4 h-4 text-slate-700" />
          </button>

          <button
            type="button"
            onClick={() => execCommand('removeFormat')}
            title="Clear Formatting"
            className="p-2 hover:bg-slate-200 rounded transition-colors"
          >
            <Eraser className="w-4 h-4 text-slate-700" />
          </button>

          <div className="w-px h-6 bg-slate-300 mx-1" />

          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-600 mr-1">Quick:</span>
            <button
              type="button"
              onClick={() => applyQuickFormat('warning')}
              title="Red Warning Text (Bold + Red)"
              className="px-2 py-1 text-xs bg-danger-muted text-danger hover:bg-danger/20 rounded transition-colors font-semibold"
            >
              <AlertTriangle className="w-3 h-3 inline mr-1" />
              Warning
            </button>
            <button
              type="button"
              onClick={() => applyQuickFormat('important')}
              title="Important (Bold + Yellow Highlight)"
              className="px-2 py-1 text-xs bg-warning-muted text-slate-700 hover:bg-warning/20 rounded transition-colors font-semibold"
            >
              <Zap className="w-3 h-3 inline mr-1" />
              Important
            </button>
          </div>

          <div className="flex-1" />

          <button
            type="button"
            onClick={toggleSourceMode}
            title="View HTML Source"
            className={`p-2 hover:bg-slate-200 rounded transition-colors ${isSourceMode ? 'bg-slate-200' : ''}`}
          >
            <Code className="w-4 h-4 text-slate-700" />
          </button>
        </div>

        {isSourceMode ? (
          <textarea
            value={sourceValue}
            onChange={(e) => setSourceValue(e.target.value)}
            className="w-full p-3 font-mono text-sm focus:outline-none resize-none"
            style={{ minHeight }}
            placeholder="HTML source code..."
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
            data-placeholder={placeholder}
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
      `}</style>
    </div>
  );
};
