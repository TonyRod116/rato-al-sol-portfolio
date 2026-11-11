import React, { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import Svg, { Defs, Mask, Path, Rect } from 'react-native-svg';
import * as FileSystem from 'expo-file-system/legacy';
import { advanceShadowRasterPath, createShadowRasterPath } from './shadow-raster-path.mjs';
import { captureShadow } from './shadow-capture.mjs';
import { createShadowFileLifetime } from './shadow-file-lifetime.mjs';
import { readyShadowOverlayUri, shadowOverlayBoundsKey } from './shadow-overlay-image.mjs';

let nextFile = 0, nextJob = 0;
const files = createShadowFileLifetime((uri) => { FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}); });
const removeLater = files.retire;
export const retainShadowFile = files.retain;
export const releaseShadowFile = files.release;
export const retireShadowFile = files.retire;

// Render outside the MapView. Work is split into small JavaScript batches;
// SVG rasterization and PNG encoding are native and may still pause the UI.
// Errors carry the original input identities so the caller can ignore old jobs.
export function ShadowRasterizer({ shadows, bounds, retryToken = 0, onReady, onError }) {
  const svg = useRef(null), callbacks = useRef({ onReady, onError });
  callbacks.current = { onReady, onError };
  const [job, setJob] = useState(null);
  const [laidOutJob, setLaidOutJob] = useState(null);
  const currentJob = useRef(null);
  currentJob.current = job;

  useEffect(() => {
    let cancelled = false, timer;
    setJob(null);
    if (!shadows?.features?.length || !bounds) return;
    try {
      // iOS rasterizes SVG at the device's screen scale. A 256-point mask is
      // still rendered at Retina resolution while using less than half the
      // pixels of the previous 384-point luminance mask on the same device.
      const builder = createShadowRasterPath(shadows, bounds, { longestSide: Platform.OS === 'ios' ? 256 : 384 });
      const advance = () => {
        if (cancelled) return;
        try {
          if (advanceShadowRasterPath(builder)) setJob({ ...builder.result(), source: shadows, area: bounds, retryToken, id: ++nextJob });
          else timer = setTimeout(advance, 0);
        } catch { if (!cancelled) callbacks.current.onError?.({ reason: 'geometry', source: shadows, area: bounds, retryToken }); }
      };
      // Let the time slider and map finish moving before preparing the mask.
      timer = setTimeout(advance, 80);
    } catch { if (!cancelled) callbacks.current.onError?.({ reason: 'geometry', source: shadows, area: bounds, retryToken }); }
    return () => { cancelled = true; clearTimeout(timer); };
  }, [shadows, bounds, retryToken]);

  useEffect(() => {
    if (!job || job.source !== shadows || job.area !== bounds || job.retryToken !== retryToken) return;
    if (laidOutJob !== job) {
      const timer = setTimeout(() => callbacks.current.onError?.({ reason: 'layout', source: job.source, area: job.area, retryToken: job.retryToken }), 8000);
      return () => clearTimeout(timer);
    }
    let file;
    const cancel = captureShadow({
      capture: (callback) => {
        if (!svg.current) throw new Error('SVG unavailable');
        svg.current.toDataURL(callback, { width: job.width, height: job.height });
      },
      write: async (base64) => {
        if (!FileSystem.cacheDirectory) throw new Error('Cache unavailable');
        file = `${FileSystem.cacheDirectory}rato-shadow-${Date.now()}-${nextFile++}.png`;
        try { await FileSystem.writeAsStringAsync(file, base64, { encoding: 'base64' }); }
        catch (error) { removeLater(file); throw error; }
        return file;
      },
      discard: removeLater,
      onReady: (uri) => callbacks.current.onReady?.({ uri, bounds: job.bounds, source: job.source, area: job.area, retryToken: job.retryToken }),
      onError: (reason) => callbacks.current.onError?.({ reason, source: job.source, area: job.area, retryToken: job.retryToken }),
    });
    return () => { cancel(); removeLater(file); };
  }, [job, shadows, bounds, laidOutJob, retryToken]);

  if (!job || job.source !== shadows || job.area !== bounds || job.retryToken !== retryToken) return null;
  return <View key={job.id} collapsable={false} pointerEvents="none" style={{ position: 'absolute', left: -10000, top: 0, width: job.width, height: job.height }}
    onLayout={() => { if (currentJob.current === job) setLaidOutJob(job); }}>
    <Svg ref={svg} width={job.width} height={job.height} viewBox={`0 0 ${job.width} ${job.height}`}>
      {!!job.roofD && <Defs><Mask id="roofs" x="0" y="0" width={job.width} height={job.height} maskUnits="userSpaceOnUse" maskType="luminance">
        <Rect x="0" y="0" width={job.width} height={job.height} fill="white" />
        <Path d={job.roofD} fill="black" fillRule="nonzero" />
      </Mask></Defs>}
      <Path d={job.d} fill="#304349" fillOpacity={0.26} fillRule="nonzero" mask={job.roofD ? 'url(#roofs)' : undefined} />
    </Svg>
  </View>;
}

// Give MapView an Overlay with bounds before assigning the image. On Apple
// Maps the renderer is created when the image loads, so this reduces its race.
// Render the Overlay itself as a direct MapView child, not a wrapper component.
export function useGroundShadowImage(image) {
  const [ready, setReady] = useState(null);
  const boundsKey = shadowOverlayBoundsKey(image);
  const readyUri = readyShadowOverlayUri(ready, image);
  useEffect(() => {
    const uri = image?.uri;
    if (!uri) return;
    files.retain(uri);
    return () => files.release(uri);
  }, [image?.uri]);
  useEffect(() => {
    if (!image?.uri || !boundsKey) { setReady(null); return; }
    const timer = setTimeout(() => setReady({ uri: image.uri, boundsKey }), 100);
    return () => clearTimeout(timer);
  }, [image?.uri, boundsKey]);
  useEffect(() => {
    if (!readyUri) return;
    files.retain(readyUri);
    return () => files.release(readyUri);
  }, [readyUri]);
  return readyUri ? { uri: readyUri } : undefined;
}
