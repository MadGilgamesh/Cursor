import { useQuery } from '@tanstack/react-query';

import { api } from './api.js';

export interface StaffSession {
  id: string;
  email: string;
  role: 'administrator' | 'moderator' | 'content_designer';
}

export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: () => api<StaffSession>('/api/panel/me'),
    retry: false,
  });
}
