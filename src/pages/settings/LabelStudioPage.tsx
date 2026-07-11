import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Lock } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { useAuth } from '../../contexts/AuthContext';
import { LabelStudio } from '../../components/settings/labels/LabelStudio';
import { SettingsPageHeader } from '../../components/layout/SettingsPageHeader';
import { LABEL_CARDS } from './labelStudioMeta';
import type { LabelEntity } from '../../lib/labelPrefsService';

/** Roles allowed to edit label designs (manager and above — same as documents). */
const EDITOR_ROLES = ['owner', 'admin', 'manager'] as const;

/**
 * Settings → Label Studio: the design home for the three thermal labels
 * (case / stock / inventory). Each card opens the dedicated LabelStudio
 * editor; designs persist to `company_settings.metadata.label_printing`
 * (shared with Preferences → Device label printing and every print path).
 */
export const LabelStudioPage: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const canEdit = !!profile?.role && (EDITOR_ROLES as readonly string[]).includes(profile.role);

  const [editing, setEditing] = useState<LabelEntity | null>(null);

  // ---- Editor sub-view (same swap pattern as the Documents Studio) ---------
  if (editing) {
    const card = LABEL_CARDS.find((c) => c.entity === editing);
    if (card) {
      return <LabelStudio entity={editing} label={card.label} onBack={() => setEditing(null)} />;
    }
  }

  return (
    <div className="min-h-screen">
      <SettingsPageHeader categoryId="labels" />
      <div className="mb-6">
        <button
          onClick={() => navigate('/settings')}
          className="mb-4 flex items-center gap-2 text-slate-600 transition-colors hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm font-medium">Back to Settings</span>
        </button>
      </div>

      {!canEdit && (
        <Card variant="bordered" className="mb-6 border-warning/30 bg-warning-muted p-4">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 flex-shrink-0 text-warning" />
            <p className="text-sm text-warning">
              You can preview label designs, but only managers and admins can edit them.
            </p>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {LABEL_CARDS.map(({ entity, label, description, icon: Icon }) => (
          <Card key={entity} variant="bordered" className="flex flex-col p-5">
            <div className="mb-3 flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <Badge variant="default" size="sm">Thermal</Badge>
            </div>
            <h3 className="mb-1 font-semibold text-slate-900">{label}</h3>
            <p className="mb-4 flex-1 text-sm text-slate-600">{description}</p>
            <div className="flex items-center gap-2 border-t border-slate-100 pt-4">
              <Button
                variant={canEdit ? 'primary' : 'secondary'}
                size="sm"
                className="flex-1"
                onClick={() => setEditing(entity)}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                {canEdit ? 'Design' : 'Preview'}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <p className="mt-6 px-1 text-xs text-slate-500">
        Labels print through the compact thermal engine — what you design here is exactly what every
        print button and auto-print produces. Quick size &amp; auto-print switches also live in
        Settings → Preferences.
      </p>
    </div>
  );
};

export default LabelStudioPage;
