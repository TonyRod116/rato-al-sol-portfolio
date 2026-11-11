import React, { useEffect, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { retireShadowFile } from './ShadowOverlay';
import { startNativeShadowTask } from './shadow-native-task.mjs';

const native = requireOptionalNativeModule('RatoShadowRaster');
let nextFile = 0;

// Keep the existing renderer as a safe fallback for old builds or native
// errors. Only publish a result if it belongs to the current scene.
export function ShadowNative({ fallback: Fallback, shadows, bounds, retryToken = 0, onReady, onError }) {
  const callbacks = useRef({ onReady, onError });
  callbacks.current = { onReady, onError };
  const [failed, setFailed] = useState(null);
  const useFallback = !native || !FileSystem.cacheDirectory ||
    (failed?.source === shadows && failed?.area === bounds && failed?.retryToken === retryToken);
  useEffect(() => {
    if (useFallback || !shadows?.features?.length || !bounds) return;
    const uri = `${FileSystem.cacheDirectory}rato-native-shadow-${Date.now()}-${nextFile++}.png`;
    return startNativeShadowTask({ shadows, bounds, retryToken, uri, native, retire: retireShadowFile,
      onReady: (result) => callbacks.current.onReady?.(result),
      // A deliberately bounded or timed-out job must not immediately start
      // another expensive renderer for the same scene.
      onError: (failure) => {
        if (failure.reason === 'native') setFailed({ source: shadows, area: bounds, retryToken });
        else callbacks.current.onError?.(failure);
      } });
  }, [shadows, bounds, retryToken, useFallback]);
  return useFallback ? <Fallback shadows={shadows} bounds={bounds} retryToken={retryToken} onReady={onReady} onError={onError} /> : null;
}
