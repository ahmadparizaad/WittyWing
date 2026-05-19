import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { SERVER_URL } from '../config';
import type { PlanStatus } from '../types';

interface UsePlanStatusResult {
  status: PlanStatus | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export function usePlanStatus(serverJwt: string | null): UsePlanStatusResult {
  const [status, setStatus] = useState<PlanStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!serverJwt) return;
    setIsLoading(true);
    try {
      const resp = await axios.get<PlanStatus>(`${SERVER_URL}/api/credits/status`, {
        headers: { Authorization: `Bearer ${serverJwt}` },
      });
      setStatus(resp.data);
    } catch {
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, [serverJwt]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { status, isLoading, refresh };
}
