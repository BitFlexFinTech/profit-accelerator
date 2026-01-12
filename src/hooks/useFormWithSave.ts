import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type TableName = keyof Database['public']['Tables'];

interface SaveResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: Record<string, string>;
}

export function useFormWithSave<T extends Record<string, any>>(
  table: TableName,
  initialData?: T
) {
  const [data, setData] = useState<T>(initialData || ({} as T));
  const [originalData, setOriginalData] = useState<T>(initialData || ({} as T));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const update = useCallback((key: keyof T, value: any) => {
    setData((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
    setStatus('idle');
    // Clear specific field error when updated
    if (errors[key as string]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key as string];
        return next;
      });
    }
  }, [errors]);

  const setFormData = useCallback((newData: T) => {
    setData(newData);
    setOriginalData(newData);
    setIsDirty(false);
    setErrors({});
    setStatus('idle');
  }, []);

  const save = useCallback(
    async (
      validate?: (data: T) => Record<string, string> | null
    ): Promise<SaveResult<T>> => {
      setSaving(true);
      setErrors({});

      try {
        // Run validation if provided
        if (validate) {
          const validationErrors = validate(data);
          if (validationErrors) {
            setErrors(validationErrors);
            setStatus('error');
            return { success: false, errors: validationErrors };
          }
        }

        const payload = {
          ...data,
          updated_at: new Date().toISOString(),
        };

        const { data: saved, error } = await supabase
          .from(table)
          .upsert(payload as any)
          .select()
          .single();

        if (error) throw error;

        setOriginalData(saved as unknown as T);
        setData(saved as unknown as T);
        setIsDirty(false);
        setStatus('success');

        return { success: true, data: saved as unknown as T };
      } catch (error: any) {
        setStatus('error');
        return { success: false, error: error.message };
      } finally {
        setSaving(false);
      }
    },
    [data, table]
  );

  const reset = useCallback(() => {
    setData(originalData);
    setIsDirty(false);
    setErrors({});
    setStatus('idle');
  }, [originalData]);

  return {
    data,
    saving,
    errors,
    isDirty,
    status,
    update,
    save,
    reset,
    setFormData,
  };
}
