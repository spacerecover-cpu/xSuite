import { supabase } from './supabaseClient';
import { logger } from './logger';

export interface CreateUserData {
  email: string;
  password: string;
  full_name: string;
  role: 'owner' | 'admin' | 'technician' | 'sales' | 'accounts' | 'hr';
  phone: string;
  is_active: boolean;
  case_access_level: 'restricted' | 'full';
}

export interface UpdateUserData {
  full_name: string;
  role: 'owner' | 'admin' | 'technician' | 'sales' | 'accounts' | 'hr';
  phone: string;
  is_active: boolean;
  case_access_level?: 'restricted' | 'full';
}

export const userManagementService = {
  async createUser(userData: CreateUserData): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/user-management?action=create-user`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create user');
      }

      return { success: true };
    } catch (error: any) {
      logger.error('Error creating user:', error);
      return { success: false, error: error.message };
    }
  },

  async updateUser(
    userId: string,
    userData: UpdateUserData
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: oldProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      const updateData: any = {
        full_name: userData.full_name,
        role: userData.role,
        phone: userData.phone || null,
        is_active: userData.is_active,
        updated_at: new Date().toISOString(),
      };

      if (userData.case_access_level !== undefined) {
        updateData.case_access_level = userData.case_access_level;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', userId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      const { data: currentUser } = await supabase.auth.getUser();
      if (currentUser.user && oldProfile) {
        const { error: auditError } = await supabase.rpc('log_audit_trail', {
          p_action: 'update',
          p_record_type: 'profiles',
          p_record_id: userId,
          p_old_values: {
            full_name: oldProfile.full_name,
            role: oldProfile.role,
            phone: oldProfile.phone,
            is_active: oldProfile.is_active,
          } as never,
          p_new_values: {
            full_name: userData.full_name,
            role: userData.role,
            phone: userData.phone,
            is_active: userData.is_active,
          } as never,
        });
        if (auditError) {
          throw new Error(auditError.message);
        }
      }

      return { success: true };
    } catch (error: any) {
      logger.error('Error updating user:', error);
      return { success: false, error: error.message };
    }
  },

  async resetPassword(
    userId: string,
    userEmail: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/user-management?action=reset-password`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, email: userEmail, newPassword }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to reset password');
      }

      return { success: true };
    } catch (error: any) {
      logger.error('Error resetting password:', error);
      return { success: false, error: error.message };
    }
  },

  async changePassword(
    _currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        throw new Error(error.message);
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({ password_reset_required: false })
          .eq('id', user.id);
      }

      return { success: true };
    } catch (error: any) {
      logger.error('Error changing password:', error);
      return { success: false, error: error.message };
    }
  },
};
