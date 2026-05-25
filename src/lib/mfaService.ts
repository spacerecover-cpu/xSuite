import { supabase } from './supabaseClient';

export interface MFAFactor {
  id: string;
  friendly_name?: string;
  factor_type: 'totp';
  status: 'verified' | 'unverified';
  created_at: string;
  updated_at: string;
}

export interface MFAEnrollResponse {
  id: string;
  type: 'totp';
  totp: {
    qr_code: string;
    secret: string;
    uri: string;
  };
}

export interface AssuranceLevel {
  currentLevel: 'aal1' | 'aal2';
  nextLevel: 'aal1' | 'aal2';
  currentAuthenticationMethods: Array<{
    method: string;
    timestamp: number;
  }>;
}

export const mfaService = {
  async getAssuranceLevel(): Promise<AssuranceLevel> {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw error;
    return {
      currentLevel: (data?.currentLevel ?? 'aal1') as 'aal1' | 'aal2',
      nextLevel: (data?.nextLevel ?? 'aal1') as 'aal1' | 'aal2',
      currentAuthenticationMethods: (data?.currentAuthenticationMethods ?? []) as Array<{ method: string; timestamp: number }>,
    };
  },

  async listFactors(): Promise<MFAFactor[]> {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw error;
    return (data?.totp ?? []) as MFAFactor[];
  },

  async enrollTOTP(friendlyName?: string): Promise<MFAEnrollResponse> {
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: friendlyName || 'xSuite Authenticator',
    });
    if (error) throw error;
    return data as MFAEnrollResponse;
  },

  async verifyTOTP(factorId: string, code: string): Promise<void> {
    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    });
    if (challengeError) throw challengeError;

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code,
    });
    if (verifyError) throw verifyError;
  },

  async unenroll(factorId: string): Promise<void> {
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) throw error;
  },

  async isMFAEnabled(): Promise<boolean> {
    const factors = await this.listFactors();
    return factors.some(f => f.status === 'verified');
  },

  async needsMFAVerification(): Promise<boolean> {
    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error) return false;
      return data.currentLevel === 'aal1' && data.nextLevel === 'aal2';
    } catch {
      return false;
    }
  },

  async getVerifiedFactor(): Promise<MFAFactor | null> {
    const factors = await this.listFactors();
    return factors.find(f => f.status === 'verified') ?? null;
  },

  async updateProfileMFAStatus(userId: string, enabled: boolean): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ mfa_enabled: enabled })
      .eq('id', userId);
    if (error) throw error;
  },
};
