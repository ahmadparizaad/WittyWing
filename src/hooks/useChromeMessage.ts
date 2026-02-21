import { useCallback } from 'react';

interface MessageResponse<T = unknown> {
  data?: T;
  error?: string;
}

export function useChromeMessage() {
  const sendMessage = useCallback(
    <T = unknown>(message: Record<string, unknown>): Promise<MessageResponse<T>> => {
      return new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage(message, (response: T) => {
            if (chrome.runtime.lastError) {
              resolve({ error: chrome.runtime.lastError.message });
            } else {
              resolve({ data: response });
            }
          });
        } catch (error) {
          console.error('sendMessage error:', error);
          resolve({ error: error instanceof Error ? error.message : 'Unknown error' });
        }
      });
    },
    []
  );

  return { sendMessage };
}
