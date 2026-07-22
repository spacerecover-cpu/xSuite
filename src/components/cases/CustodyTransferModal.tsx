import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Package, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { SearchableSelect } from '../ui/SearchableSelect';
import { supabase } from '../../lib/supabaseClient';
import {
  initiateCustodyTransfer,
  acceptCustodyTransfer,
  rejectCustodyTransfer,
  CustodyTransfer,
} from '../../lib/chainOfCustodyService';

interface CustodyTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  caseNumber: string;
  mode: 'initiate' | 'accept' | 'reject';
  transfer?: CustodyTransfer;
  currentCustodianName: string;
}

export const CustodyTransferModal: React.FC<CustodyTransferModalProps> = ({
  isOpen,
  onClose,
  caseId,
  caseNumber,
  mode,
  transfer,
  currentCustodianName,
}) => {
  const queryClient = useQueryClient();

  const [transferReason, setTransferReason] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState<string>('');
  const [, setRecipientName] = useState('');
  const [transferMethod, setTransferMethod] = useState('');
  const [transferLocation, setTransferLocation] = useState('');
  const [conditionBefore, setConditionBefore] = useState('');
  const [conditionAfter, setConditionAfter] = useState('');
  const [sealNumber, setSealNumber] = useState('');
  const [newSealNumber, setNewSealNumber] = useState('');
  const [sealIntact, setSealIntact] = useState<boolean | undefined>(undefined);
  const [rejectionReason, setRejectionReason] = useState('');

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles_for_transfer'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('is_active', true)
        .order('full_name');

      if (error) throw error;
      return data || [];
    },
    enabled: mode === 'initiate',
  });

  const initiateTransferMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRecipient || !transferReason) {
        throw new Error('Please select a recipient and provide a reason');
      }

      const recipient = profiles.find((p) => p.id === selectedRecipient);
      if (!recipient) {
        throw new Error('Invalid recipient selected');
      }

      return initiateCustodyTransfer({
        caseId,
        transferReason,
        fromCustodianName: currentCustodianName,
        toCustodianId: selectedRecipient,
        toCustodianName: recipient.full_name,
        transferMethod: transferMethod || undefined,
        transferLocation: transferLocation || undefined,
        conditionBefore: conditionBefore || undefined,
        sealNumber: sealNumber || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chain_of_custody', caseId] });
      queryClient.invalidateQueries({ queryKey: ['custody_transfers', caseId] });
      onClose();
    },
  });

  const acceptTransferMutation = useMutation({
    mutationFn: async () => {
      if (!transfer) throw new Error('No transfer to accept');
      if (sealIntact === undefined) {
        throw new Error('Please verify seal condition');
      }

      return acceptCustodyTransfer({
        transferId: transfer.id,
        conditionAfter: conditionAfter || undefined,
        sealIntact,
        newSealNumber: newSealNumber || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chain_of_custody', caseId] });
      queryClient.invalidateQueries({ queryKey: ['custody_transfers', caseId] });
      onClose();
    },
  });

  const rejectTransferMutation = useMutation({
    mutationFn: async () => {
      if (!transfer) throw new Error('No transfer to reject');
      if (!rejectionReason) {
        throw new Error('Please provide a reason for rejection');
      }

      return rejectCustodyTransfer({
        transferId: transfer.id,
        rejectionReason,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chain_of_custody', caseId] });
      queryClient.invalidateQueries({ queryKey: ['custody_transfers', caseId] });
      onClose();
    },
  });

  const handleSubmit = () => {
    if (mode === 'initiate') {
      initiateTransferMutation.mutate();
    } else if (mode === 'accept') {
      acceptTransferMutation.mutate();
    } else if (mode === 'reject') {
      rejectTransferMutation.mutate();
    }
  };

  const isLoading =
    initiateTransferMutation.isPending ||
    acceptTransferMutation.isPending ||
    rejectTransferMutation.isPending;

  const error =
    initiateTransferMutation.error ||
    acceptTransferMutation.error ||
    rejectTransferMutation.error;

  const getTitle = () => {
    switch (mode) {
      case 'initiate':
        return 'Initiate Custody Transfer';
      case 'accept':
        return 'Accept Custody Transfer';
      case 'reject':
        return 'Reject Custody Transfer';
      default:
        return 'Custody Transfer';
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={getTitle()}
      icon={ArrowRightLeft}
      titleSize="sm"
      size="2xl"
      showClose
      closeOnBackdrop={false}
    >
      <div className="space-y-5">
        {error && (
          <div className="bg-danger-muted border border-danger/30 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
            <div className="text-sm text-danger">
              {error instanceof Error ? error.message : 'An error occurred'}
            </div>
          </div>
        )}

        {mode === 'initiate' && (
          <>
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
                  <span className="font-medium">Current Custodian:</span> {currentCustodianName}
                </p>
              </div>
            </div>

            <SearchableSelect
              label="Transfer To"
              required
              floatingLabel
              shrinkDefaultValue
              usePortal
              options={profiles.map((p) => ({
                id: p.id,
                name: `${p.full_name} (${p.role})`,
              }))}
              value={selectedRecipient}
              onChange={(value) => {
                setSelectedRecipient(value);
                const profile = profiles.find((p) => p.id === value);
                if (profile) setRecipientName(profile.full_name);
              }}
              placeholder="Select recipient..."
            />

            <Textarea
              label="Transfer Reason"
              required
              floatingLabel
              value={transferReason}
              onChange={(e) => setTransferReason(e.target.value)}
              rows={3}
              className="resize-none"
              placeholder="Describe the reason for this custody transfer..."
            />

            <div className="grid grid-cols-2 gap-x-4 gap-y-5">
              <Input
                label="Transfer Method"
                floatingLabel
                type="text"
                value={transferMethod}
                onChange={(e) => setTransferMethod(e.target.value)}
                placeholder="e.g., Hand delivery, Courier"
              />
              <Input
                label="Transfer Location"
                floatingLabel
                type="text"
                value={transferLocation}
                onChange={(e) => setTransferLocation(e.target.value)}
                placeholder="e.g., Lab 2, Main Office"
              />
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-5">
              <Textarea
                label="Condition Before Transfer"
                floatingLabel
                value={conditionBefore}
                onChange={(e) => setConditionBefore(e.target.value)}
                rows={2}
                className="resize-none"
                placeholder="Document current condition..."
              />
              <Input
                label="Seal Number"
                floatingLabel
                type="text"
                value={sealNumber}
                onChange={(e) => setSealNumber(e.target.value)}
                placeholder="Enter seal number if applicable"
              />
            </div>
          </>
        )}

        {mode === 'accept' && transfer && (
          <>
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Package className="w-5 h-5 text-primary" />
                <span className="font-semibold text-primary">Transfer Details</span>
              </div>
              <div className="space-y-2 text-sm text-primary">
                <p>
                  <span className="font-medium">From:</span> {transfer.from_custodian_name}
                </p>
                <p>
                  <span className="font-medium">To:</span> {transfer.to_custodian_name}
                </p>
                <p>
                  <span className="font-medium">Reason:</span> {transfer.transfer_reason}
                </p>
                {transfer.seal_number && (
                  <p>
                    <span className="font-medium">Original Seal:</span> {transfer.seal_number}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Seal Condition <span className="text-danger">*</span>
              </label>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setSealIntact(true)}
                  className={`flex-1 p-3 border-2 rounded-lg transition-colors ${
                    sealIntact === true
                      ? 'border-success bg-success-muted'
                      : 'border-slate-300 hover:border-slate-400'
                  }`}
                >
                  <CheckCircle2
                    className={`w-5 h-5 mx-auto mb-1 ${
                      sealIntact === true ? 'text-success' : 'text-slate-400'
                    }`}
                  />
                  <span className="text-sm font-medium">Seal Intact</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSealIntact(false)}
                  className={`flex-1 p-3 border-2 rounded-lg transition-colors ${
                    sealIntact === false
                      ? 'border-danger bg-danger-muted'
                      : 'border-slate-300 hover:border-slate-400'
                  }`}
                >
                  <AlertCircle
                    className={`w-5 h-5 mx-auto mb-1 ${
                      sealIntact === false ? 'text-danger' : 'text-slate-400'
                    }`}
                  />
                  <span className="text-sm font-medium">Seal Broken</span>
                </button>
              </div>
            </div>

            <Textarea
              label="Condition After Transfer"
              floatingLabel
              value={conditionAfter}
              onChange={(e) => setConditionAfter(e.target.value)}
              rows={3}
              className="resize-none"
              placeholder="Document condition upon receipt..."
            />

            {sealIntact === false && (
              <Input
                label="New Seal Number"
                floatingLabel
                type="text"
                value={newSealNumber}
                onChange={(e) => setNewSealNumber(e.target.value)}
                placeholder="Enter new seal number"
              />
            )}
          </>
        )}

        {mode === 'reject' && transfer && (
          <>
            <div className="bg-danger-muted border border-danger/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-5 h-5 text-danger" />
                <span className="font-semibold text-danger">Rejection Notice</span>
              </div>
              <p className="text-sm text-danger">
                You are about to reject the custody transfer from {transfer.from_custodian_name}.
                This action will be recorded in the Chain of Custody.
              </p>
            </div>

            <Textarea
              label="Rejection Reason"
              required
              floatingLabel
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={4}
              className="resize-none"
              placeholder="Provide a detailed reason for rejecting this transfer..."
            />
          </>
        )}

        <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200">
          <Button onClick={onClose} variant="secondary" size="sm" className="text-xs" disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading}
            size="sm"
            className={`text-xs ${
              mode === 'reject'
                ? 'bg-danger hover:bg-danger/90'
                : mode === 'accept'
                ? 'bg-success hover:bg-success/90'
                : ''
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Processing...
              </>
            ) : mode === 'initiate' ? (
              'Initiate Transfer'
            ) : mode === 'accept' ? (
              'Accept Transfer'
            ) : (
              'Reject Transfer'
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
