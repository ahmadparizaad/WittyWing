import { useState, useEffect, useCallback } from 'react';

type StorageArea = 'local' | 'sync';

export function useChromeStorage<T>(
  key: string,
  initialValue: T,
  area: StorageArea = 'local'
): [T, (value: T) => void, boolean] {
  const [storedValue, setStoredValue] = useState<T>(initialValue);
  const [isLoading, setIsLoading] = useState(true);

  const storage = area === 'sync' ? chrome.storage.sync : chrome.storage.local;

  // Load initial value
  useEffect(() => {
    setIsLoading(true);
    storage.get([key], (result) => {
      if (result[key] !== undefined) {
        setStoredValue(result[key] as T);
      }
      setIsLoading(false);
    });
  }, [key, storage]);

  // Listen for changes
  useEffect(() => {
    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === area && changes[key]) {
        setStoredValue(changes[key].newValue as T);
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [key, area]);

  // Set value
  const setValue = useCallback(
    (value: T) => {
      setStoredValue(value);
      storage.set({ [key]: value });
    },
    [key, storage]
  );

  return [storedValue, setValue, isLoading];
}
