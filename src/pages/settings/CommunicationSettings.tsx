import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Plug, Zap, LayoutTemplate } from 'lucide-react';
import { SettingsPageHeader } from '../../components/layout/SettingsPageHeader';
import { WhatsAppConnectionTab } from '../../components/settings/whatsapp/WhatsAppConnectionTab';
import { WhatsAppAutomationsTab } from '../../components/settings/whatsapp/WhatsAppAutomationsTab';
import { WhatsAppTemplatesTab } from '../../components/settings/whatsapp/WhatsAppTemplatesTab';

const TABS = [
  { id: 'connection', label: 'Connection', icon: Plug },
  { id: 'automations', label: 'Automations', icon: Zap },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate },
] as const;

export function CommunicationSettings() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('connection');
  return (
    <div className="min-h-screen p-6">
      <SettingsPageHeader categoryId="communications" />
      <button
        onClick={() => navigate('/settings')}
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ChevronLeft className="h-4 w-4" /> Settings
      </button>
      <div className="mb-6 flex gap-1 border-b border-slate-200">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>
      {tab === 'connection' && <WhatsAppConnectionTab />}
      {tab === 'automations' && <WhatsAppAutomationsTab />}
      {tab === 'templates' && <WhatsAppTemplatesTab />}
    </div>
  );
}
export default CommunicationSettings;
