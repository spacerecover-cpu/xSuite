import React from 'react';
import { FileText, MessageSquarePlus } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Card } from '../../ui/Card';
import { formatDate } from '@/lib/format';

interface CaseNote {
  id: string;
  note_text: string;
  private?: boolean;
  created_at: string;
  author: {
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
}

export const CaseNotesTab: React.FC<CaseNotesTabProps> = ({
  notes,
  newNote,
  isAdding,
  onNoteChange,
  onAddNote,
}) => {
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
            notes.map((note) => (
              <div key={note.id} className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-xs font-bold flex-shrink-0">
                      {note.author.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 text-sm">{note.author.full_name}</p>
                      <p className="text-xs text-slate-500">{formatDate(note.created_at)}</p>
                    </div>
                  </div>
                  {note.private && (
                    <Badge variant="secondary" size="sm">Private</Badge>
                  )}
                </div>
                <p className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed pl-10">{note.note_text}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </Card>
  );
};
