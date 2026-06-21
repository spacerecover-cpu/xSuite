import React, { useMemo, useState } from 'react';
import { FileText, MessageSquarePlus, Pencil } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Card } from '../../ui/Card';
import { supabase } from '@/lib/supabaseClient';
import { formatDateTimeWithConfig } from '@/lib/format';
import { useDateTimeConfig } from '@/contexts/TenantConfigContext';

interface CaseNote {
  id: string;
  note_text: string;
  private?: boolean;
  created_at: string;
  updated_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  author?: {
    full_name: string;
  };
}

interface CaseNotesTabProps {
  caseId: string;
  notes: CaseNote[];
  newNote: string;
  isAdding?: boolean;
  onNoteChange: (v: string) => void;
  onAddNote: () => void;
  onUpdateNote: (noteId: string, content: string) => Promise<void>;
}

export const CaseNotesTab: React.FC<CaseNotesTabProps> = ({
  notes,
  newNote,
  isAdding,
  onNoteChange,
  onAddNote,
  onUpdateNote,
}) => {
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dateTimeConfig = useDateTimeConfig();

  const authorIds = useMemo(
    () =>
      Array.from(
        new Set(notes.flatMap((n) => [n.created_by, n.updated_by]).filter((v): v is string => !!v)),
      ),
    [notes],
  );

  const { data: authorProfiles = [] } = useQuery({
    queryKey: ['profiles_by_ids', 'case_notes', authorIds.slice().sort().join(',')],
    queryFn: async () => {
      if (authorIds.length === 0) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', authorIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: authorIds.length > 0,
  });

  const authorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of authorProfiles) {
      map.set(p.id, p.full_name ?? 'Unknown');
    }
    return map;
  }, [authorProfiles]);

  const startEditing = (note: CaseNote) => {
    setEditingNoteId(note.id);
    setEditingContent(note.note_text);
    setSaveError(null);
  };

  const cancelEditing = () => {
    setEditingNoteId(null);
    setEditingContent('');
    setSaveError(null);
  };

  const saveEdit = async (noteId: string) => {
    if (!editingContent.trim()) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await onUpdateNote(noteId, editingContent.trim());
      setEditingNoteId(null);
      setEditingContent('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save note';
      setSaveError(
        msg.includes('42501') ? 'You do not have permission to edit this note.' : msg,
      );
    } finally {
      setIsSaving(false);
    }
  };

  const wasEdited = (note: CaseNote) =>
    !!note.updated_at && note.updated_at !== note.created_at;

  return (
    <Card>
      <div className="p-6">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Internal Notes</h2>

        <div className="mb-6 bg-slate-50 rounded-lg p-4 border border-slate-200">
          <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
            <MessageSquarePlus className="w-4 h-4 text-primary" />
            Add Note
          </label>
          <textarea
            value={newNote}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="Add a technical note or update..."
            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary resize-none bg-white"
            rows={3}
          />
          <div className="flex justify-end mt-2">
            <Button
              onClick={onAddNote}
              disabled={!newNote.trim() || isAdding}
              style={{ backgroundColor: 'rgb(var(--color-success))' }}
            >
              {isAdding ? 'Adding...' : 'Add Note'}
            </Button>
          </div>
        </div>

        <div className="space-y-3 max-h-[600px] overflow-y-auto">
          {notes.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="font-medium mb-1">No internal notes yet</p>
              <p className="text-sm">Add a note using the form above</p>
            </div>
          ) : (
            notes.map((note) => {
              const authorName =
                (note.created_by ? authorMap.get(note.created_by) : undefined) ??
                note.author?.full_name ??
                'Unknown';
              const editorName = note.updated_by ? authorMap.get(note.updated_by) : undefined;
              const isEditing = editingNoteId === note.id;
              const edited = wasEdited(note);

              return (
                <div key={note.id} className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-xs font-bold flex-shrink-0">
                        {authorName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900 text-sm">{authorName}</p>
                        <p className="text-xs text-slate-500" title={`UTC: ${note.created_at}`}>
                          {formatDateTimeWithConfig(note.created_at, dateTimeConfig)}
                        </p>
                        {edited && note.updated_at && (
                          <p className="text-xs text-slate-400 italic" title={`UTC: ${note.updated_at}`}>
                            Edited {formatDateTimeWithConfig(note.updated_at, dateTimeConfig)}
                            {editorName ? ` by ${editorName}` : ''}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {note.private && (
                        <Badge variant="secondary" size="sm">Private</Badge>
                      )}
                      {!isEditing && (
                        <button
                          onClick={() => startEditing(note)}
                          className="p-1 text-slate-400 hover:text-primary transition-colors rounded"
                          title="Edit note"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="pl-10">
                      <textarea
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary resize-none bg-white text-sm"
                        rows={4}
                        autoFocus
                      />
                      {saveError && (
                        <p className="text-xs text-danger mt-1">{saveError}</p>
                      )}
                      <div className="flex justify-end gap-2 mt-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={cancelEditing}
                          disabled={isSaving}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => saveEdit(note.id)}
                          disabled={!editingContent.trim() || isSaving}
                        >
                          {isSaving ? 'Saving...' : 'Save'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed pl-10">{note.note_text}</p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </Card>
  );
};
