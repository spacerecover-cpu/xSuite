import React, { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Fingerprint, Shield, CheckCircle2, XCircle, AlertTriangle, Package } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SearchableSelect } from '../ui/SearchableSelect';
import {
  performIntegrityCheck,
  IntegrityCheckResult,
} from '../../lib/chainOfCustodyService';
import { useAuth } from '../../contexts/AuthContext';

interface IntegrityCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  caseNumber: string;
  devices?: Array<{ id: string; name: string }>;
}

export const IntegrityCheckModal: React.FC<IntegrityCheckModalProps> = ({
  isOpen,
  onClose,
  caseId,
  caseNumber,
  devices = [],
}) => {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const checkReasonId = useId();
  const expectedHashId = useId();
  const actualHashId = useId();
  const sealNumberId = useId();
  const physicalConditionId = useId();
  const findingsId = useId();

  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [checkType, setCheckType] = useState('');
  const [checkReason, setCheckReason] = useState('');
  const [expectedHash, setExpectedHash] = useState('');
  const [actualHash, setActualHash] = useState('');
  const [hashAlgorithm, setHashAlgorithm] = useState('SHA-256');
  const [physicalCondition, setPhysicalCondition] = useState('');
  const [sealNumber, setSealNumber] = useState('');
  const [sealIntact, setSealIntact] = useState<boolean | undefined>(undefined);
  const [findings, setFindings] = useState('');
  const [anomalies, setAnomalies] = useState<string[]>([]);
  const [newAnomaly, setNewAnomaly] = useState('');

  const checkTypes = [
    { id: 'scheduled', name: 'Scheduled Check' },
    { id: 'random', name: 'Random Verification' },
    { id: 'pre_transfer', name: 'Pre-Transfer Verification' },
    { id: 'post_transfer', name: 'Post-Transfer Verification' },
    { id: 'incident_response', name: 'Incident Response' },
    { id: 'audit', name: 'Audit Verification' },
  ];

  const addAnomaly = () => {
    if (newAnomaly.trim()) {
      setAnomalies([...anomalies, newAnomaly.trim()]);
      setNewAnomaly('');
    }
  };

  const removeAnomaly = (index: number) => {
    setAnomalies(anomalies.filter((_, i) => i !== index));
  };

  const determineResult = (): IntegrityCheckResult => {
    const hashMatch = expectedHash && actualHash ? expectedHash === actualHash : undefined;

    if (anomalies.length > 0 || hashMatch === false) return 'failed';

    if (sealIntact === false) return 'warning';

    if (hashMatch === true && (sealIntact === true || sealIntact === undefined)) return 'passed';

    if (!expectedHash && !actualHash && sealIntact === undefined) return 'not_applicable';

    // Exactly one hash was provided, so no comparison could occur — this is not a
    // verified pass. Flag it as unverified rather than falling through to 'passed'.
    if ((!!expectedHash) !== (!!actualHash)) return 'warning';

    return 'passed';
  };

  const performCheckMutation = useMutation({
    mutationFn: async () => {
      if (!checkType) {
        throw new Error('Please select a check type');
      }

      const result = determineResult();

      return performIntegrityCheck({
        caseId,
        deviceId: selectedDevice || undefined,
        checkType,
        checkReason: checkReason || undefined,
        expectedHash: expectedHash || undefined,
        actualHash: actualHash || undefined,
        hashAlgorithm: hashAlgorithm || undefined,
        physicalCondition: physicalCondition || undefined,
        sealNumber: sealNumber || undefined,
        sealIntact,
        overallResult: result,
        findings: findings || undefined,
        anomalies: anomalies.length > 0 ? anomalies : undefined,
        inspectorName: profile?.full_name || 'Unknown',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chain_of_custody', caseId] });
      queryClient.invalidateQueries({ queryKey: ['integrity_checks', caseId] });
      onClose();
      resetForm();
    },
  });

  const resetForm = () => {
    setSelectedDevice('');
    setCheckType('');
    setCheckReason('');
    setExpectedHash('');
    setActualHash('');
    setHashAlgorithm('SHA-256');
    setPhysicalCondition('');
    setSealNumber('');
    setSealIntact(undefined);
    setFindings('');
    setAnomalies([]);
    setNewAnomaly('');
  };

  const handleSubmit = () => {
    performCheckMutation.mutate();
  };

  const result = determineResult();
  const hashMatch = expectedHash && actualHash ? expectedHash === actualHash : undefined;

  const getResultBadge = (res: IntegrityCheckResult) => {
    const configs = {
      passed: {
        icon: CheckCircle2,
        color: 'bg-success-muted text-success border-success/30',
        label: 'Passed',
      },
      failed: {
        icon: XCircle,
        color: 'bg-danger-muted text-danger border-danger/30',
        label: 'Failed',
      },
      warning: {
        icon: AlertTriangle,
        color: 'bg-warning-muted text-warning border-warning/30',
        label: 'Warning',
      },
      not_applicable: {
        icon: Package,
        color: 'bg-slate-100 text-slate-800 border-slate-300',
        label: 'N/A',
      },
    };

    const config = configs[res];
    const Icon = config.icon;

    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 ${config.color}`}>
        <Icon className="w-5 h-5" />
        <span className="font-semibold">{config.label}</span>
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Perform Integrity Check" icon={Shield} maxWidth="3xl" closeOnBackdrop={false}>
      <div className="space-y-4">
        {performCheckMutation.error && (
          <div className="bg-danger-muted border border-danger/30 rounded-lg p-3 flex items-start gap-2">
            <XCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
            <div className="text-sm text-danger">
              {performCheckMutation.error instanceof Error
                ? performCheckMutation.error.message
                : 'An error occurred'}
            </div>
          </div>
        )}

        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-5 h-5 text-primary" />
            <span className="font-semibold text-primary">Case Information</span>
          </div>
          <div className="text-sm text-primary">
            <p>
              <span className="font-medium">Case Number:</span> {caseNumber}
            </p>
            <p>
              <span className="font-medium">Inspector:</span> {profile?.full_name || 'Unknown'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Check Type <span className="text-danger">*</span>
            </label>
            <SearchableSelect
              options={checkTypes}
              value={checkType}
              onChange={setCheckType}
              placeholder="Select check type..."
            />
          </div>
          {devices.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Device (Optional)</label>
              <SearchableSelect
                options={devices.map((d) => ({ id: d.id, name: d.name }))}
                value={selectedDevice}
                onChange={setSelectedDevice}
                placeholder="Select device..."
              />
            </div>
          )}
        </div>

        <div>
          <label htmlFor={checkReasonId} className="block text-sm font-medium text-slate-700 mb-2">Check Reason</label>
          <textarea
            id={checkReasonId}
            value={checkReason}
            onChange={(e) => setCheckReason(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="Describe the reason for this integrity check..."
          />
        </div>

        <div className="border-t border-slate-200 pt-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <Fingerprint className="w-4 h-4 text-primary" />
            Hash Verification
          </h3>

          <div className="grid grid-cols-3 gap-4 mb-3">
            <div className="col-span-3">
              <label className="block text-sm font-medium text-slate-700 mb-2">Hash Algorithm</label>
              <SearchableSelect
                options={[
                  { id: 'SHA-256', name: 'SHA-256' },
                  { id: 'SHA-512', name: 'SHA-512' },
                  { id: 'MD5', name: 'MD5' },
                ]}
                value={hashAlgorithm}
                onChange={setHashAlgorithm}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor={expectedHashId} className="block text-sm font-medium text-slate-700 mb-2">Expected Hash</label>
              <Input
                id={expectedHashId}
                type="text"
                value={expectedHash}
                onChange={(e) => setExpectedHash(e.target.value)}
                placeholder="Enter expected hash value"
                className="font-mono text-xs"
              />
            </div>
            <div>
              <label htmlFor={actualHashId} className="block text-sm font-medium text-slate-700 mb-2">Actual Hash</label>
              <Input
                id={actualHashId}
                type="text"
                value={actualHash}
                onChange={(e) => setActualHash(e.target.value)}
                placeholder="Enter actual hash value"
                className="font-mono text-xs"
              />
            </div>
          </div>

          {hashMatch !== undefined && (
            <div className="mt-3">
              {hashMatch ? (
                <div className="bg-success-muted border border-success/30 rounded p-2 flex items-center gap-2 text-sm text-success">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-medium">Hash values match - Integrity verified</span>
                </div>
              ) : (
                <div className="bg-danger-muted border border-danger/30 rounded p-2 flex items-center gap-2 text-sm text-danger">
                  <XCircle className="w-4 h-4" />
                  <span className="font-medium">Hash mismatch - Integrity compromised</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 pt-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Physical Inspection</h3>

          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
              <label htmlFor={sealNumberId} className="block text-sm font-medium text-slate-700 mb-2">Seal Number</label>
              <Input
                id={sealNumberId}
                type="text"
                value={sealNumber}
                onChange={(e) => setSealNumber(e.target.value)}
                placeholder="Enter seal number"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Seal Condition</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setSealIntact(true)}
                  className={`flex-1 px-3 py-2 text-sm border-2 rounded transition-colors ${
                    sealIntact === true
                      ? 'border-success bg-success-muted text-success'
                      : 'border-slate-300 text-slate-600 hover:border-slate-400'
                  }`}
                >
                  Intact
                </button>
                <button
                  onClick={() => setSealIntact(false)}
                  className={`flex-1 px-3 py-2 text-sm border-2 rounded transition-colors ${
                    sealIntact === false
                      ? 'border-danger bg-danger-muted text-danger'
                      : 'border-slate-300 text-slate-600 hover:border-slate-400'
                  }`}
                >
                  Broken
                </button>
              </div>
            </div>
          </div>

          <div>
            <label htmlFor={physicalConditionId} className="block text-sm font-medium text-slate-700 mb-2">Physical Condition</label>
            <textarea
              id={physicalConditionId}
              value={physicalCondition}
              onChange={(e) => setPhysicalCondition(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Document the physical condition of the evidence..."
            />
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Anomalies</h3>

          <div className="flex gap-2 mb-2">
            <Input
              type="text"
              value={newAnomaly}
              onChange={(e) => setNewAnomaly(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addAnomaly()}
              placeholder="Add anomaly..."
              className="flex-1"
            />
            <Button onClick={addAnomaly} size="sm">
              Add
            </Button>
          </div>

          {anomalies.length > 0 && (
            <div className="space-y-1">
              {anomalies.map((anomaly, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 text-sm bg-danger-muted border border-danger/30 rounded px-3 py-2"
                >
                  <span className="flex-1 text-danger">{anomaly}</span>
                  <button
                    onClick={() => removeAnomaly(idx)}
                    className="text-danger hover:text-danger/80"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <label htmlFor={findingsId} className="block text-sm font-medium text-slate-700 mb-2">Findings</label>
          <textarea
            id={findingsId}
            value={findings}
            onChange={(e) => setFindings(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="Document your findings from this integrity check..."
          />
        </div>

        <div className="border-t border-slate-200 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Predicted Result:</span>
            {getResultBadge(result)}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Button onClick={onClose} variant="secondary" disabled={performCheckMutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={performCheckMutation.isPending}>
            {performCheckMutation.isPending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Recording...
              </>
            ) : (
              'Record Integrity Check'
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
