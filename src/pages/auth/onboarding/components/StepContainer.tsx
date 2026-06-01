import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import type { StepMeta } from '../constants';

interface StepContainerProps {
  step: StepMeta;
  stepIndex: number;
  direction: number;
  children: ReactNode;
}

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -80 : 80,
    opacity: 0,
  }),
};

const reducedVariants = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
};

export const StepContainer = ({ step, stepIndex, direction, children }: StepContainerProps) => {
  const shouldReduceMotion = useReducedMotion();
  const Icon = step.icon;
  const variants = shouldReduceMotion ? reducedVariants : slideVariants;

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-6 sm:py-10">
      <div className="w-full max-w-5xl grid lg:grid-cols-5 gap-8 lg:gap-12 items-center">
        <div className="hidden lg:flex lg:col-span-2 flex-col items-center justify-center text-center px-4">
          <motion.div
            key={`visual-${stepIndex}`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-6"
          >
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-primary/10 blur-2xl scale-150" />
              <div className="relative w-24 h-24 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20 flex items-center justify-center shadow-glow-primary">
                <Icon className="w-12 h-12 text-primary" />
              </div>
            </div>
          </motion.div>
          <motion.p
            key={`tagline-${stepIndex}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="font-display text-xl text-slate-400 italic leading-relaxed"
          >
            {step.tagline}
          </motion.p>
        </div>

        <div className="lg:col-span-3 w-full max-w-lg mx-auto lg:mx-0">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={stepIndex}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 sm:p-8 shadow-xl">
                <div className="mb-6">
                  <h2 className="font-display text-2xl sm:text-3xl text-white mb-2">
                    {step.title}
                  </h2>
                  <p className="font-body text-slate-400 text-sm">
                    {step.subtitle}
                  </p>
                </div>
                {children}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
