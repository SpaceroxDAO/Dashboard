import { useState, useEffect, useCallback } from 'react';
import { checkApiHealth, getFileContent, updateFileContent } from '@/services/api';

/**
 * Hook to interact with the file API
 * Falls back to mock data when API is unavailable (e.g., on Vercel)
 */
export function useFileApi() {
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if API is available on mount
  useEffect(() => {
    checkApiHealth().then(setApiAvailable);
  }, []);

  const readFile = useCallback(async (filePath: string): Promise<string | null> => {
    if (!apiAvailable) {
      return null; // Fall back to mock data
    }

    setLoading(true);
    setError(null);

    try {
      const result = await getFileContent(filePath);
      return result.content;
    } catch (err) {
      setError('Failed to read file');
      return null;
    } finally {
      setLoading(false);
    }
  }, [apiAvailable]);

  const writeFile = useCallback(async (filePath: string, content: string): Promise<boolean> => {
    if (!apiAvailable) {
      console.warn('API not available - file changes will not be persisted');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      await updateFileContent(filePath, content);
      return true;
    } catch (err) {
      setError('Failed to write file');
      return false;
    } finally {
      setLoading(false);
    }
  }, [apiAvailable]);

  return {
    apiAvailable,
    loading,
    error,
    readFile,
    writeFile,
  };
}
