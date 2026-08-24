'use client';

import { useEffect, useRef, useState } from 'react';
import { GpsLocationData, GpsHistoryPoint } from '@/lib/peplink';

// CONFIGURABLE: Offset to correct the 3D model's native forward axis (e.g. 0, Math.PI/2, Math.PI, -Math.PI/2)
const VEHICLE_MODEL_HEADING_OFFSET = -Math.PI / 2;

interface CesiumMapProps {
  currentLocation: GpsLocationData | null;
  historyPoints: GpsHistoryPoint[];
  showPolyline: boolean;
  cameraMode?: 'FOLLOW' | 'FREE' | 'DRONE';
  isPlaying?: boolean;
  playbackSpeed?: number;
  scrubTrigger?: { percent: number, nonce: number } | null;
  onTickTelemetry?: (location: GpsLocationData) => void;
  onPlaybackProgress?: (percent: number) => void;
}

export default function CesiumMap({
  currentLocation,
  historyPoints,
  showPolyline,
  cameraMode = 'FOLLOW',
  isPlaying = false,
  playbackSpeed = 1,
  scrubTrigger = null,
  onTickTelemetry,
  onPlaybackProgress
}: CesiumMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const vehicleEntityRef = useRef<any>(null);
  const polylineEntityRef = useRef<any>(null);
  const futurePolylineEntityRef = useRef<any>(null);
  const startPointRef = useRef<any>(null);
  const endPointRef = useRef<any>(null);
  const clockTickListenerRef = useRef<any>(null);
  
  // Interpolation properties for Cesium Clock playback
  const positionPropertyRef = useRef<any>(null);
  const rotationPropertyRef = useRef<any>(null);
  const speedPropertyRef = useRef<any>(null);
  const altitudePropertyRef = useRef<any>(null);
  
  const lastLiveHeadingDegRef = useRef<number>(0);
  const lastLiveUnwrappedHeadingRadRef = useRef<number | null>(null);
  const lastLiveLocationRef = useRef<GpsLocationData | null>(null);
  
  const [isLoaded, setIsLoaded] = useState(false);
  const [cesiumError, setCesiumError] = useState<string | null>(null);

  // Initialize Cesium
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;
    let isSubscribed = true;

    async function initCesium() {
      try {
        (window as any).CESIUM_BASE_URL = '/cesium';
        const Cesium = await import('cesium');

        if (!isSubscribed || !containerRef.current) return;

        const viewer = new Cesium.Viewer(containerRef.current, {
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          infoBox: false,
          sceneModePicker: false,
          selectionIndicator: false,
          timeline: false,
          animation: false,
          fullscreenButton: false,
          navigationHelpButton: false,
          scene3DOnly: true,
          requestRenderMode: false,
          shouldAnimate: false, // controlled by props
        });

        viewer.scene.globe.enableLighting = true;
        // Do NOT load OSM 3D Buildings. The user explicitly requested SATELLITE MAP ONLY.

        // Setup smooth interpolation properties
        const positionProperty = new Cesium.SampledPositionProperty();
        const rotationProperty = new Cesium.SampledProperty(Number);
        const speedProperty = new Cesium.SampledProperty(Number);
        const altitudeProperty = new Cesium.SampledProperty(Number);
        
        positionPropertyRef.current = positionProperty;
        rotationPropertyRef.current = rotationProperty;
        speedPropertyRef.current = speedProperty;
        altitudePropertyRef.current = altitudeProperty;

        // Initialize vehicle with 3D GLB model
        const vehicleEntity = viewer.entities.add({
          name: 'Peplink Vehicle',
          position: positionProperty,
          model: {
            uri: '/models/GroundVehicle.glb',
            scale: 1.0,
            minimumPixelSize: 128,
            maximumScale: 5,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, // keeps car on road/terrain
          },
          orientation: new Cesium.CallbackProperty((time: any) => {
            const rot = rotationProperty.getValue(time);
            if (rot === undefined || rot === null) return Cesium.Quaternion.IDENTITY;
            const pos = positionProperty.getValue(time);
            if (!pos) return Cesium.Quaternion.IDENTITY;
            
            // Apply fixed model heading offset
            const finalHeading = rot + VEHICLE_MODEL_HEADING_OFFSET;
            
            return Cesium.Transforms.headingPitchRollQuaternion(
              pos,
              new Cesium.HeadingPitchRoll(finalHeading, 0, 0)
            );
          }, false),
          label: {
            text: 'Balance_45C2',
            font: 'bold 12px Inter, sans-serif',
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            outlineWidth: 3,
            outlineColor: Cesium.Color.BLACK,
            fillColor: Cesium.Color.CYAN,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -50),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          }
        });

        viewerRef.current = viewer;
        vehicleEntityRef.current = vehicleEntity;

        setIsLoaded(true);
      } catch (err: any) {
        setCesiumError(err?.message || 'Failed to initialize Cesium');
      }
    }
    initCesium();

    return () => {
      isSubscribed = false;
      if (viewerRef.current) {
        if (clockTickListenerRef.current) {
          viewerRef.current.clock.onTick.removeEventListener(clockTickListenerRef.current);
        }
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  // Update Clock and History Samples when historyPoints change
  useEffect(() => {
    if (!viewerRef.current || !historyPoints) return;
    
    import('cesium').then((Cesium) => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      const posProp = positionPropertyRef.current;
      const rotProp = rotationPropertyRef.current;
      const spdProp = speedPropertyRef.current;
      const altProp = altitudePropertyRef.current;

      if (historyPoints.length === 0) {
        if (polylineEntityRef.current) {
          viewer.entities.remove(polylineEntityRef.current);
          polylineEntityRef.current = null;
        }
        return;
      }
      
      // Reset properties for new route
      posProp.forwardExtrapolationType = Cesium.ExtrapolationType.HOLD;
      posProp.backwardExtrapolationType = Cesium.ExtrapolationType.HOLD;
      
      // Extract timestamps
      const startMs = historyPoints[0].timestamp;
      const endMs = historyPoints[historyPoints.length - 1].timestamp;
      
      const startJulian = Cesium.JulianDate.fromDate(new Date(startMs));
      const endJulian = Cesium.JulianDate.fromDate(new Date(endMs));
      
      let lastValidHeadingDeg = 0;
      let lastUnwrappedHeadingRad: number | null = null;

      // Inject all points into the SampledProperties
      historyPoints.forEach((pt, i) => {
        const time = Cesium.JulianDate.fromDate(new Date(pt.timestamp));
        const pos = Cesium.Cartesian3.fromDegrees(pt.longitude, pt.latitude, pt.altitude);
        
        let headingDeg = pt.heading;

        // Fallback bearing if heading is missing or zero, AND the vehicle is moving
        if ((headingDeg === undefined || headingDeg === null || headingDeg === 0) && pt.speed > 1) {
          if (i < historyPoints.length - 1) {
            const nextPt = historyPoints[i + 1];
            const lat1 = Cesium.Math.toRadians(pt.latitude);
            const lat2 = Cesium.Math.toRadians(nextPt.latitude);
            const dLon = Cesium.Math.toRadians(nextPt.longitude - pt.longitude);
            const y = Math.sin(dLon) * Math.cos(lat2);
            const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
            let brng = Math.atan2(y, x);
            headingDeg = Cesium.Math.toDegrees(brng);
            if (headingDeg < 0) headingDeg += 360;
          }
        }
        
        // If stationary or still invalid, keep last valid heading
        if (headingDeg === undefined || headingDeg === null || pt.speed < 1) {
          headingDeg = lastValidHeadingDeg;
        } else {
          lastValidHeadingDeg = headingDeg;
        }

        // Cesium ENU heading matches standard compass (0=N, 90=E)
        let currentRad = Cesium.Math.toRadians(headingDeg);
        
        // Shortest-angle unwrap logic
        if (lastUnwrappedHeadingRad !== null) {
          let diff = (currentRad - lastUnwrappedHeadingRad) % (2 * Math.PI);
          if (diff > Math.PI) diff -= 2 * Math.PI;
          if (diff < -Math.PI) diff += 2 * Math.PI;
          currentRad = lastUnwrappedHeadingRad + diff;
        }
        lastUnwrappedHeadingRad = currentRad;

        posProp.addSample(time, pos);
        rotProp.addSample(time, currentRad);
        spdProp.addSample(time, pt.speed);
        altProp.addSample(time, pt.altitude);
      });
      
      viewer.clock.startTime = startJulian;
      viewer.clock.stopTime = endJulian;
      viewer.clock.currentTime = startJulian;
      viewer.clock.clockRange = Cesium.ClockRange.CLAMPED;
      
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          historyPoints[0].longitude,
          historyPoints[0].latitude - 0.005,
          300
        ),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(-25), roll: 0 },
        duration: 1
      });
    });
  }, [historyPoints]);


  // Render Historical Route Polyline
  useEffect(() => {
    if (!viewerRef.current) return;
    
    import('cesium').then((Cesium) => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      if (polylineEntityRef.current) {
        viewer.entities.remove(polylineEntityRef.current);
        polylineEntityRef.current = null;
      }
      if (futurePolylineEntityRef.current) {
        viewer.entities.remove(futurePolylineEntityRef.current);
        futurePolylineEntityRef.current = null;
      }
      if (startPointRef.current) {
        viewer.entities.remove(startPointRef.current);
        startPointRef.current = null;
      }
      if (endPointRef.current) {
        viewer.entities.remove(endPointRef.current);
        endPointRef.current = null;
      }

      if (!showPolyline || !historyPoints || historyPoints.length < 2) return;

      const flatDegrees: number[] = [];
      historyPoints.forEach((pt) => {
        flatDegrees.push(pt.longitude, pt.latitude, Math.max(0.5, pt.altitude));
      });

      const positions = Cesium.Cartesian3.fromDegreesArrayHeights(flatDegrees);

      futurePolylineEntityRef.current = viewer.entities.add({
        name: 'Historical Track Future',
        polyline: {
          positions: positions,
          width: 4,
          material: new Cesium.PolylineOutlineMaterialProperty({
            color: Cesium.Color.fromCssColorString('#06b6d4').withAlpha(0.2),
            outlineWidth: 1,
            outlineColor: Cesium.Color.fromCssColorString('#082f49').withAlpha(0.2)
          }),
          clampToGround: true,
        }
      });

      polylineEntityRef.current = viewer.entities.add({
        name: 'Historical Track Traveled',
        polyline: {
          positions: new Cesium.CallbackProperty((time: any) => {
            const posProp = positionPropertyRef.current;
            if (!posProp) return positions; // Fallback if no vehicle position
            
            const currentPos = posProp.getValue(time);
            if (!currentPos) return [];

            const currentDateMs = Cesium.JulianDate.toDate(time).getTime();
            let lastIdx = 0;
            for (let i = 0; i < historyPoints.length; i++) {
              if (historyPoints[i].timestamp <= currentDateMs) {
                lastIdx = i;
              } else {
                break;
              }
            }
            
            const dynamicPositions = positions.slice(0, lastIdx + 1);
            dynamicPositions.push(currentPos);
            return dynamicPositions;
          }, false),
          width: 6,
          material: new Cesium.PolylineOutlineMaterialProperty({
            color: Cesium.Color.fromCssColorString('#06b6d4'),
            outlineWidth: 2,
            outlineColor: Cesium.Color.fromCssColorString('#082f49')
          }),
          clampToGround: true,
        }
      });
      
      startPointRef.current = viewer.entities.add({
        name: 'Start Point',
        position: positions[0],
        point: { pixelSize: 12, color: Cesium.Color.LIME, outlineColor: Cesium.Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { text: 'START', font: '10px Inter', verticalOrigin: Cesium.VerticalOrigin.BOTTOM, pixelOffset: new Cesium.Cartesian2(0, -10), disableDepthTestDistance: Number.POSITIVE_INFINITY }
      });

      endPointRef.current = viewer.entities.add({
        name: 'End Point',
        position: positions[positions.length - 1],
        point: { pixelSize: 12, color: Cesium.Color.RED, outlineColor: Cesium.Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { text: 'END', font: '10px Inter', verticalOrigin: Cesium.VerticalOrigin.BOTTOM, pixelOffset: new Cesium.Cartesian2(0, -10), disableDepthTestDistance: Number.POSITIVE_INFINITY }
      });
    });
  }, [historyPoints, showPolyline]);
  
  // Engine Tick & Camera System (Playback & Follow)
  useEffect(() => {
    if (!viewerRef.current || historyPoints.length === 0) return;
    
    import('cesium').then((Cesium) => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      const clock = viewer.clock;
      
      // Handle Scrub Trigger
      if (scrubTrigger) {
        const startMs = historyPoints[0].timestamp;
        const endMs = historyPoints[historyPoints.length - 1].timestamp;
        const targetMs = startMs + ((endMs - startMs) * (scrubTrigger.percent / 100));
        clock.currentTime = Cesium.JulianDate.fromDate(new Date(targetMs));
      }
      
      clock.multiplier = playbackSpeed;
      clock.shouldAnimate = isPlaying;
      
      if (clockTickListenerRef.current) {
        clock.onTick.removeEventListener(clockTickListenerRef.current);
      }
      
      clockTickListenerRef.current = () => {
        const cTime = clock.currentTime;
        
        // 1. Calculate Playback Progress %
        const sTime = clock.startTime;
        const eTime = clock.stopTime;
        const totalSecs = Cesium.JulianDate.secondsDifference(eTime, sTime);
        const currentSecs = Math.max(0, Cesium.JulianDate.secondsDifference(cTime, sTime));
        
        const pct = Math.min(100, Math.max(0, (currentSecs / totalSecs) * 100));
        if (onPlaybackProgress) {
          onPlaybackProgress(pct);
        }
        
        // Auto-pause at the end
        if (pct >= 100 && isPlaying) {
          clock.shouldAnimate = false;
        }
        
        // 2. Stream Interpolated Telemetry Data
        const pos = positionPropertyRef.current.getValue(cTime);
        if (pos) {
          const carto = Cesium.Cartographic.fromCartesian(pos);
          const alt = altitudePropertyRef.current.getValue(cTime) || 0;
          const spd = speedPropertyRef.current.getValue(cTime) || 0;
          
          let rot = rotationPropertyRef.current.getValue(cTime) || 0;
          let headingDeg = -Cesium.Math.toDegrees(rot);
          if (headingDeg < 0) headingDeg += 360;

          if (onTickTelemetry) {
            onTickTelemetry({
              latitude: Number(Cesium.Math.toDegrees(carto.latitude).toFixed(6)),
              longitude: Number(Cesium.Math.toDegrees(carto.longitude).toFixed(6)),
              altitude: Number(alt.toFixed(1)),
              speed: Number(spd.toFixed(1)),
              heading: Number(headingDeg.toFixed(1)),
              timestamp: Cesium.JulianDate.toDate(cTime).getTime(),
              formattedTime: Cesium.JulianDate.toDate(cTime).toLocaleTimeString(),
              deviceName: 'Balance_45C2 (Replay)',
              connectionStatus: 'PLAYBACK',
              isSimulated: true
            } as any);
          }
          
          // 3. Follow Camera (if in follow mode or drone mode)
          if (cameraMode === 'FOLLOW' || cameraMode === 'DRONE') {
             const headingRad = -rot; // Invert back
             
             // Drone mode has wider view and steeper pitch
             const distance = cameraMode === 'DRONE' ? 250 : 150; 
             const lat = Cesium.Math.toDegrees(carto.latitude);
             const lng = Cesium.Math.toDegrees(carto.longitude);
             
             const offsetLat = lat - (distance / 111000) * Math.cos(headingRad);
             const offsetLng = lng - (distance / (111000 * Math.cos(lat * Math.PI / 180))) * Math.sin(headingRad);
             
             const pitch = cameraMode === 'DRONE' ? -45 : -15;
             const targetCamPos = Cesium.Cartesian3.fromDegrees(offsetLng, offsetLat, Math.max(30, carto.height + (cameraMode === 'DRONE' ? 150 : 40)));
             
             Cesium.Cartesian3.lerp(viewerRef.current.camera.position, targetCamPos, 0.1, viewerRef.current.camera.position);
             
             viewerRef.current.camera.setView({
               orientation: {
                 heading: headingRad,
                 pitch: Cesium.Math.toRadians(pitch),
                 roll: 0
               }
             });
          }
        }
      };
      
      clock.onTick.addEventListener(clockTickListenerRef.current);
    });
  }, [isPlaying, playbackSpeed, scrubTrigger, cameraMode, historyPoints]);
  
  // LIVE mode fallback: When not playing history, respond to currentLocation updates
  useEffect(() => {
    if (!viewerRef.current || isPlaying || scrubTrigger || !currentLocation) return;
    if (typeof currentLocation.latitude !== 'number' || typeof currentLocation.longitude !== 'number') return;
    
    import('cesium').then((Cesium) => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      
      if (viewer.clock.shouldAnimate === false && (!historyPoints || historyPoints.length === 0 || !scrubTrigger)) {
        viewer.clock.currentTime = Cesium.JulianDate.now();
        viewer.clock.shouldAnimate = true;
      }
      
      const cTime = viewer.clock.currentTime;
      const targetTime = Cesium.JulianDate.addSeconds(cTime, 2, new Cesium.JulianDate());
      
      const pos = Cesium.Cartesian3.fromDegrees(currentLocation.longitude, currentLocation.latitude, currentLocation.altitude || 0);

      let headingDeg = currentLocation.heading;
      
      if ((headingDeg === undefined || headingDeg === null || headingDeg === 0) && currentLocation.speed && currentLocation.speed > 1) {
        if (lastLiveLocationRef.current) {
          const prevLoc = lastLiveLocationRef.current;
          const lat1 = Cesium.Math.toRadians(prevLoc.latitude);
          const lat2 = Cesium.Math.toRadians(currentLocation.latitude);
          const dLon = Cesium.Math.toRadians(currentLocation.longitude - prevLoc.longitude);
          const y = Math.sin(dLon) * Math.cos(lat2);
          const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
          let brng = Math.atan2(y, x);
          headingDeg = Cesium.Math.toDegrees(brng);
          if (headingDeg < 0) headingDeg += 360;
        }
      }
      
      if (headingDeg === undefined || headingDeg === null || (currentLocation.speed && currentLocation.speed < 1)) {
        headingDeg = lastLiveHeadingDegRef.current;
      } else {
        lastLiveHeadingDegRef.current = headingDeg;
      }

      let currentRad = Cesium.Math.toRadians(headingDeg);
      if (lastLiveUnwrappedHeadingRadRef.current !== null) {
          let diff = (currentRad - lastLiveUnwrappedHeadingRadRef.current) % (2 * Math.PI);
          if (diff > Math.PI) diff -= 2 * Math.PI;
          if (diff < -Math.PI) diff += 2 * Math.PI;
          currentRad = lastLiveUnwrappedHeadingRadRef.current + diff;
      }
      lastLiveUnwrappedHeadingRadRef.current = currentRad;
      lastLiveLocationRef.current = currentLocation;

      positionPropertyRef.current.addSample(targetTime, pos);
      rotationPropertyRef.current.addSample(targetTime, currentRad);
      
      if (cameraMode === 'FOLLOW' || cameraMode === 'DRONE') {
        const headingRad = currentRad;
        const distance = cameraMode === 'DRONE' ? 250 : 150;
        const offsetLat = currentLocation.latitude - (distance / 111000) * Math.cos(headingRad);
        const offsetLng = currentLocation.longitude - (distance / (111000 * Math.cos(currentLocation.latitude * Math.PI / 180))) * Math.sin(headingRad);
        const pitch = cameraMode === 'DRONE' ? -45 : -15;
        const heightOffset = cameraMode === 'DRONE' ? 150 : 40;
        const targetCamPos = Cesium.Cartesian3.fromDegrees(offsetLng, offsetLat, Math.max(30, (currentLocation.altitude || 0) + heightOffset));
        
        if (!viewer.hasSetInitialCamera) {
          viewer.camera.position = targetCamPos;
          viewer.camera.setView({ orientation: { heading: headingRad, pitch: Cesium.Math.toRadians(pitch), roll: 0 } });
          viewer.hasSetInitialCamera = true;
        } else {
          Cesium.Cartesian3.lerp(viewer.camera.position, targetCamPos, 0.1, viewer.camera.position);
          viewer.camera.setView({ orientation: { heading: headingRad, pitch: Cesium.Math.toRadians(pitch), roll: 0 } });
        }
      }
    });
  }, [currentLocation, isPlaying, scrubTrigger, cameraMode, historyPoints]);

  return (
    <div className="relative w-full h-full min-h-[450px] rounded-2xl overflow-hidden bg-black/40 border border-white/10 shadow-2xl">
      <div ref={containerRef} className="w-full h-full min-h-[450px]" />

      {!isLoaded && !cesiumError && (
        <div className="absolute inset-0 bg-black/40/80 backdrop-blur-md flex flex-col items-center justify-center gap-3 z-20">
          <div className="w-10 h-10 border-4 border-pink-500/30 border-t-cyan-400 rounded-full animate-spin" />
          <p className="text-xs font-mono text-pink-200 tracking-wider">INITIALIZING 3D CESIUM GLOBE...</p>
        </div>
      )}
      
      {cesiumError && (
        <div className="absolute inset-0 bg-black/40/90 flex flex-col items-center justify-center p-6 text-center z-20">
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl max-w-md text-red-400 text-sm">
            <p className="font-bold mb-1">3D Globe Initialization Failed</p>
            <p className="text-xs text-red-300/80">{cesiumError}</p>
          </div>
        </div>
      )}
    </div>
  );
}
