import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';

export interface DetailPageNotFoundProps {
  backTo?: { to: string; label: string };
}

/** Standard detail not-found: centered icon + message + optional back button. */
export const DetailPageNotFound: React.FC<DetailPageNotFoundProps> = ({ backTo }) => (
  <div className="px-6 py-5 max-w-[1800px] mx-auto">
    <div className="flex flex-col items-center justify-center text-center py-16">
      <AlertCircle className="w-10 h-10 text-slate-400 mb-3" aria-hidden="true" />
      <p className="text-lg font-semibold text-slate-900">Not found</p>
      <p className="text-sm text-slate-500 mb-4">This record doesn't exist or has been removed.</p>
      {backTo && (
        <Link to={backTo.to}><Button variant="secondary" size="sm">{backTo.label}</Button></Link>
      )}
    </div>
  </div>
);
