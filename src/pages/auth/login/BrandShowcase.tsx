import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { ShieldCheck, Fingerprint, Layers, Users, FileCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const CAPABILITIES: { key: string; icon: LucideIcon }[] = [
  { key: 'custody', icon: Fingerprint },
  { key: 'raid', icon: Layers },
  { key: 'portal', icon: Users },
  { key: 'reporting', icon: FileCheck },
];

export const BrandShowcase = () => {
  const { t } = useTranslation();
  const shouldReduceMotion = useReducedMotion();

  const enter = (delay: number) => ({
    initial: shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 14 },
    animate: shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 },
    transition: { duration: 0.5, delay },
  });

  return (
    <div className="max-w-2xl">
      <motion.div {...enter(0.05)}>
        <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-sky-400/25 bg-sky-400/[0.06] text-sky-200 text-xs font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-sky-300" aria-hidden="true" />
          {t('auth.trustedBadge')}
        </span>
      </motion.div>

      <motion.div {...enter(0.15)}>
        <h1 className="mt-6 font-display-auth text-5xl xl:text-6xl font-bold leading-[1.08] tracking-tight">
          <span className="text-white">{t('auth.headlineLead')}</span>
          <br />
          <span className="bg-gradient-to-r from-sky-400 via-blue-400 to-violet-500 bg-clip-text text-transparent">
            {t('auth.headlineAccent')}
          </span>
        </h1>
        <p className="text-slate-400 mt-6 text-lg leading-relaxed max-w-md">
          {t('auth.subheadline')}
        </p>
      </motion.div>

      <motion.ul
        {...enter(0.3)}
        className="mt-10 grid grid-cols-2 sm:grid-cols-4 divide-x divide-white/10 rtl:divide-x-reverse"
      >
        {CAPABILITIES.map(({ key, icon: Icon }) => (
          <li key={key} className="flex flex-col items-center gap-2.5 px-3 text-center">
            <Icon className="w-6 h-6 text-sky-300" strokeWidth={1.6} aria-hidden="true" />
            <span className="text-slate-300 text-xs leading-snug">{t(`auth.capability.${key}`)}</span>
          </li>
        ))}
      </motion.ul>
    </div>
  );
};
