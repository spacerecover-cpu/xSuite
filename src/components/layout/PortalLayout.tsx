import React, { Suspense, useEffect, useRef, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ContentLoadingFallback } from '../shared/ContentLoadingFallback';
import { usePortalAuth } from '../../contexts/PortalAuthContext';
import { useTenantFeature } from '../../contexts/TenantConfigContext';
import { CustomerAvatar } from '../ui/CustomerAvatar';
import { FileText, DollarSign, MessageSquare, LogOut, LayoutDashboard, Settings, FileBarChart, ShoppingBag, ChevronDown, Receipt } from 'lucide-react';
import { AnnouncementBanner } from '../shared/AnnouncementBanner';
import { getPortalSettings } from '../../lib/portalUrlService';
import { logger } from '../../lib/logger';

interface PortalBranding {
  logoUrl: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
}

export const PortalLayout: React.FC = () => {
  const { t } = useTranslation();
  const { customer, logout } = usePortalAuth();
  const portalEnabled = useTenantFeature('portal.customer');
  const navigate = useNavigate();
  const [branding, setBranding] = useState<PortalBranding>({
    logoUrl: null,
    supportEmail: null,
    supportPhone: null,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await getPortalSettings();
        if (cancelled || !settings) return;
        setBranding({
          logoUrl: typeof settings.portal_custom_logo_url === 'string' && settings.portal_custom_logo_url
            ? settings.portal_custom_logo_url
            : null,
          supportEmail: typeof settings.portal_support_email === 'string' && settings.portal_support_email
            ? settings.portal_support_email
            : null,
          supportPhone: typeof settings.portal_support_phone === 'string' && settings.portal_support_phone
            ? settings.portal_support_phone
            : null,
        });
      } catch (err) {
        logger.error('Failed to load portal branding:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = () => {
    setMenuOpen(false);
    logout();
    // replace so the back button can't return to a now-protected portal page (L7).
    navigate('/portal/login', { replace: true });
  };

  const handleOpenSettings = () => {
    setMenuOpen(false);
    navigate('/portal/settings');
  };

  if (!customer) {
    return null;
  }

  const navItems = [
    { path: '/portal/dashboard', label: t('portal.nav.dashboard'), icon: LayoutDashboard },
    { path: '/portal/cases', label: t('portal.nav.myCases'), icon: FileText },
    { path: '/portal/quotes', label: t('portal.nav.quotes'), icon: DollarSign },
    { path: '/portal/reports', label: t('portal.nav.reports'), icon: FileBarChart },
    { path: '/portal/purchases', label: t('portal.nav.myPurchases'), icon: ShoppingBag },
    { path: '/portal/payments', label: t('portal.nav.payments'), icon: Receipt },
    { path: '/portal/communications', label: t('portal.nav.messages'), icon: MessageSquare },
    { path: '/portal/settings', label: t('portal.nav.settings'), icon: Settings },
  ];

  if (!portalEnabled) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">{t('portal.common.portalUnavailable')}</h1>
          <p className="mt-2 text-sm text-slate-600">
            {t('portal.common.portalUnavailableBody')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AnnouncementBanner />
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              {branding.logoUrl ? (
                <img
                  src={branding.logoUrl}
                  alt={t('portal.common.logoAlt')}
                  className="h-10 w-auto max-w-[200px] object-contain"
                />
              ) : (
                <h1 className="text-xl font-bold text-slate-900">{t('portal.common.customerPortal')}</h1>
              )}
              <nav className="hidden md:flex items-center gap-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) =>
                        `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                          isActive
                            ? 'bg-primary/10 text-primary'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`
                      }
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </NavLink>
                  );
                })}
              </nav>
            </div>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={t('portal.common.openAccountMenu')}
                className="flex items-center gap-2 rounded-full p-1 pr-2 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors"
              >
                <CustomerAvatar
                  firstName={customer.customer_name}
                  lastName=""
                  photoUrl={customer.profile_photo_url}
                  size="sm"
                />
                <span className="hidden sm:inline text-sm font-medium text-slate-900 max-w-[140px] truncate">
                  {customer.customer_name}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-500" aria-hidden="true" />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  aria-label={t('portal.common.openAccountMenu')}
                  className="absolute right-0 mt-2 w-56 rounded-lg bg-white shadow-lg border border-slate-200 py-2 z-50"
                >
                  <div className="px-3 py-2 border-b border-slate-100">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {customer.customer_name}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{customer.customer_number}</p>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleOpenSettings}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <Settings className="w-4 h-4" aria-hidden="true" />
                    {t('portal.common.menuSettings')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <LogOut className="w-4 h-4" aria-hidden="true" />
                    {t('portal.common.menuLogout')}
                  </button>
                </div>
              )}
            </div>
          </div>

          <nav className="md:hidden flex items-center gap-1 pb-2 overflow-x-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`
                  }
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Suspense fallback={<ContentLoadingFallback />}>
          <Outlet />
        </Suspense>
      </main>

      <footer className="bg-white border-t border-slate-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-2 text-center text-sm text-slate-500">
          <p>{t('portal.common.footerHelp')}</p>
          {(branding.supportEmail || branding.supportPhone) && (
            <p className="text-xs">
              {branding.supportEmail && (
                <a href={`mailto:${branding.supportEmail}`} className="text-primary hover:underline">
                  {branding.supportEmail}
                </a>
              )}
              {branding.supportEmail && branding.supportPhone && <span className="mx-2">·</span>}
              {branding.supportPhone && (
                <a href={`tel:${branding.supportPhone}`} className="text-primary hover:underline">
                  {branding.supportPhone}
                </a>
              )}
            </p>
          )}
        </div>
      </footer>
    </div>
  );
};
