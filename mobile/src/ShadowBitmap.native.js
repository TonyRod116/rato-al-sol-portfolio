import React, { useEffect, useRef } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { retireShadowFile } from './ShadowOverlay';
import { startShadowBitmapTask } from './shadow-bitmap-task.mjs';

let nextFile = 0;

export function ShadowBitmap({ shadows, bounds, retryToken = 0, onReady, onError }) {
  const callbacks = useRef({ onReady, onError });
  callbacks.current = { onReady, onError };
  useEffect(() => {
    if (!shadows?.features?.length || !bounds) return;
    if (!FileSystem.cacheDirectory) {
      callbacks.current.onError?.({ source: shadows, area: bounds, retryToken, reason: 'storage' });
      return;
    }
    const uri = `${FileSystem.cacheDirectory}rato-shadow-bitmap-${Date.now()}-${nextFile++}.png`;
    return startShadowBitmapTask({ shadows, bounds, retryToken, uri,
      write: (file, base64) => FileSystem.writeAsStringAsync(file, base64, { encoding: 'base64' }),
      retire: retireShadowFile,
      onReady: (result) => callbacks.current.onReady?.(result),
      onError: (failure) => callbacks.current.onError?.(failure) });
  }, [shadows, bounds, retryToken]);
  return null;
}
