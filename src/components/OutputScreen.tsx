/** What an output screen shows (background, mix, media, words, overlays, border), and the output window page itself */
import { useParams } from 'react-router-dom';
import { DesignMediaLayer } from '../lib/designMedia';
import { OverlayLayer, overlaysFor, type Overlay } from '../lib/overlays';
import { LiveInputView, inputKey } from '../lib/liveInputs';
import { usePlaybackFollower } from '../lib/playback';
import { MixStack, mixLayersForScreen, ScreenBorderView, type LiveMixLayer } from '../lib/mix';
import React, { useState, useEffect, useRef } from 'react';
import { setSharedTimer } from '../lib/timers';
import { motion, AnimatePresence } from 'motion/react';
import { loadInstalledFonts } from '../lib/fontStore';
import { isTauri } from '../lib/tauriScreen';
import { SmartTextLayout } from './SmartTextLayout';
import { FixedStage } from './FixedStage';
import { PresentationTemplate, getStoredTemplates, subscribeTemplates } from '../lib/templates';
import { StageScreen } from './StageScreen';
import { stageLayoutFor } from '../lib/stageLayouts';
import { SlideDefinition, OutputSettings, GlobalSettings, PresentState, isStageOutput, CHANNEL_NAME, isBoxOnScreen, resolveCustomBoxAnimation, resolveSlideForOutput, getStyleForOutput, screenBorderFor, resolveOutputBackground } from '../lib/model';

/**
 * What an audience output draws inside its FixedStage. The projector window and the Design canvas
 * both render through this, so the canvas is always exactly what the screen shows.
 */
/**
 * A background video on a screen. Always silent: a playback video's sound comes only from the playback bar's player,
 * which this follows (time, pause, loop); other videos loop on their own.
 */
export function BackgroundVideo({ url, playback, videoRef, opacity }: { url: string; playback: boolean; videoRef?: React.RefObject<HTMLVideoElement>; opacity: number }) {
  const local = useRef<HTMLVideoElement | null>(null);
  usePlaybackFollower(local, playback ? url : null);
  return (
    <video
      ref={(el) => { local.current = el; if (videoRef) (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el; }}
      src={url}
      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
      style={{ opacity }}
      autoPlay
      loop={!playback}
      muted
      playsInline
      data-bg-media
      data-playback={playback ? '' : undefined}
    />
  );
}

/** Mix mode's canvas: the words faint (a sheet of its own, still above the media) */
export const FAINT_WORDS: React.CSSProperties = { position: 'absolute', inset: 0, opacity: 0.35, zIndex: 10, pointerEvents: 'none' };

export function AudienceOutputContent({ output, settings, slide, background, hideBackground = false, hideText = false, videoRef, muted = false, scrollPreviewPos, highlightWordIndex, designPreview = false, templateOverride, overlays = [], mix, wordsFaint = false, noWords = false }: {
  /** The Media Mixer's layers (filtered here to the ones for this screen) */
  mix?: { layers: LiveMixLayer[]; exitFade?: number } | null;
  /** Mix mode's canvas: the words faint, so media can be placed around them */
  wordsFaint?: boolean;
  /** Leave the words out (Mix: working on the media alone) */
  noWords?: boolean;
  /** Overlays on this screen (they stay through clears; only F3 takes them off) */
  overlays?: Overlay[];
  output: OutputSettings | undefined;
  settings: GlobalSettings | undefined;
  slide: SlideDefinition | null | undefined;
  /** Design canvas only: draw the slide in this template (one being changed) instead of its own */
  templateOverride?: PresentationTemplate;
  background: ReturnType<typeof resolveOutputBackground>;
  hideBackground?: boolean;
  hideText?: boolean;
  videoRef?: React.RefObject<HTMLVideoElement>;
  muted?: boolean;
  scrollPreviewPos?: number;
  /** Design canvas only: outline the word being styled */
  highlightWordIndex?: number;
  /** Design canvas only: also draw text boxes that are hidden (faded) or waiting for Go live */
  designPreview?: boolean;
}) {
  const style = getStyleForOutput(output, settings);
  const bg = hideBackground ? null : background;
  // When the slide is taken away (Clear all), its words stay just long enough to fade out
  const lastSlide = useRef(slide);
  if (slide) lastSlide.current = slide;
  const shownSlide = slide || lastSlide.current;
  const resolved = shownSlide ? resolveSlideForOutput(shownSlide, output, undefined, style, templateOverride) : null;
  const design = shownSlide?.designs?.[output?.id || 'main'];
  const showText = !hideText && !!slide && style?.activeLayers.slide !== false;
  // Clearing fades (or uses the slide's own exit animation, when its design has one)
  const pageHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
  const slideExit = resolved?.animation?.exit;
  const clearSeconds = pageHidden ? 0 : slideExit && slideExit.type !== 'none' ? (slideExit.duration ?? 0.35) : 0.6;
  const bgKey = bg ? `${bg.type}|${bg.url || ''}|${bg.color || ''}|${bg.input ? inputKey(bg.input) : ''}` : '';
  // How strongly the background shows over black (Settings → Outputs → Background opacity)
  const bgOpacity = Math.min(100, Math.max(0, output?.backgroundOpacity ?? 80)) / 100;

  return (
    <>
      {/* The background fades out when cleared and crossfades when it changes */}
      <AnimatePresence initial={false}>
      {bg && (
      <motion.div
        key={bgKey}
        className="absolute inset-0 w-full h-full pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: clearSeconds, ease: 'easeOut' }}
        data-bg-layer
      >
      {bg?.type === 'color' && <div className="absolute inset-0 w-full h-full pointer-events-none" style={{ backgroundColor: bg.color || '#000', opacity: bgOpacity }} />}

      {/* A camera, screen or NDI source */}
      {bg?.type === 'input' && bg.input && (
        <LiveInputView input={bg.input} quality="high" className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: bgOpacity }} showProblems={designPreview} />
      )}

      {bg?.url && bg.type === 'video' ? (
        <BackgroundVideo url={bg.url} playback={!!bg.playback} videoRef={videoRef} opacity={bgOpacity} />
      ) : bg?.url ? (
        <img src={bg.url} className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={{ opacity: bgOpacity }} alt="bg" data-bg-media />
      ) : null}
      </motion.div>
      )}
      </AnimatePresence>

      {/* Media Mixer: the show's layers, above the background (they blend with it) and under overlays and words */}
      <MixStack layers={mixLayersForScreen(mix?.layers, output?.id, settings?.outputs)} exitFade={mix?.exitFade} preview={designPreview} />

      {/* Overlays drawn under the words */}
      <OverlayLayer overlays={overlays} above={false} />

      {/* Pictures and videos: the template's, then this slide's own (above the background, under the words). They go with the words: Clear text and Clear all fade them out; clearing the background leaves them */}
      {shownSlide && <DesignMediaLayer items={[...(resolved?.styleOverrides?.media || []), ...(design?.media || [])]} preview={designPreview} cleared={!showText} fadeSeconds={clearSeconds} />}

      {/* data-text-layer lets the Design canvas tell which words belong to the lyrics */}
      {/* Cleared words stay in place and fade (or leave with the slide's exit), so clearing never cuts */}
      {shownSlide && resolved && !design?.hideLyrics && !noWords && (
        <div data-text-layer="lyrics" style={wordsFaint ? FAINT_WORDS : { display: 'contents' }}>
          <SmartTextLayout
            text={shownSlide.text}
            source={shownSlide.source}
            type={shownSlide.type}
            animation={resolved.animation}
            styleOverrides={resolved.styleOverrides}
            scrollPreviewPos={scrollPreviewPos}
            highlightWordIndex={highlightWordIndex}
            className="relative z-10 w-full h-full"
            cleared={!showText}
          />
        </div>
      )}

      {shownSlide && !noWords && design?.customBoxes?.filter(box => designPreview || isBoxOnScreen(box)).map(box => (
        <div key={box.id} data-text-layer={box.id} style={wordsFaint ? FAINT_WORDS : { display: 'contents' }}>
          <SmartTextLayout
            text={box.text}
            type="lyrics"
            animation={resolveCustomBoxAnimation(box)}
            styleOverrides={{ global: box.style, layout: box.layout, verticalAlign: box.verticalAlign }}
            className={`relative z-10 w-full h-full ${box.hidden ? 'opacity-30' : ''}`}
            cleared={!showText}
          />
        </div>
      ))}

      {/* Overlays drawn over the words */}
      <OverlayLayer overlays={overlays} above />

      {/* Mix borders: over everything (outside the border's window stays covered, words and overlays too) */}
      <MixStack layers={mixLayersForScreen(mix?.layers, output?.id, settings?.outputs)} exitFade={mix?.exitFade} preview={designPreview} top />

      {/* The screen's border (its Style): on every slide, over everything */}
      <ScreenBorderView border={screenBorderFor(output, settings)} />
    </>
  );
}

export function ProjectorView() {
  const { outputId = 'main' } = useParams();
  
  const [liveState, setLiveState] = useState<PresentState>({
    slide: null, globalBackground: null, clearText: false, isPresenting: false, clearedOutputs: {}, lockedOutputs: {}, frozenStates: {}
  });
  
  const projectorVideoRef = useRef<HTMLVideoElement>(null);
  const lockedRef = useRef(false);

  // Opened on the operator's own screen: show how to get back, and let a click close it too
  const onOperatorScreen = new URLSearchParams(window.location.search).get('operator') === '1';
  const [showHint, setShowHint] = useState(onOperatorScreen);
  const closeOutput = () => {
    if (isTauri()) {
      // Hidden, not destroyed: ready to show again at once
      import('@tauri-apps/api/core').then(({ invoke }) => invoke('close_output_window', { label: `projector-${outputId}`, keep: true })).catch(() => {});
    } else {
      window.close();
    }
  };
  // The desktop app keeps output windows ready (hidden) so launching them is instant: while hidden, draw nothing
  const [shown, setShown] = useState(() => !isTauri() || (window as any).__flowshowShown === true);
  useEffect(() => {
    if (!isTauri()) return;
    const onShown = () => setShown(true);
    const onHidden = () => setShown(false);
    window.addEventListener('flowshow-output-shown', onShown);
    window.addEventListener('flowshow-output-hidden', onHidden);
    // Opened straight away (not prepared first): it is already visible
    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().isVisible()).then(v => { if (v) setShown(true); }).catch(() => setShown(true));
    return () => { window.removeEventListener('flowshow-output-shown', onShown); window.removeEventListener('flowshow-output-hidden', onHidden); };
  }, []);
  // Esc always closes an output window (only the operator's keyboard can reach it)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); closeOutput(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [outputId]);
  useEffect(() => {
    if (!onOperatorScreen) return;
    const t = setTimeout(() => setShowHint(false), 6000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    lockedRef.current = !!liveState.lockedOutputs?.[outputId];
  }, [liveState.lockedOutputs, outputId]);

  // Projector windows are separate pages: populate the template cache so style/custom templates resolve here.
  const [, setTemplatesVersion] = useState(0);
  useEffect(() => {
    getStoredTemplates().then(() => setTemplatesVersion(v => v + 1));
  }, [liveState.settings, liveState.slide]);
  useEffect(() => subscribeTemplates(() => setTemplatesVersion(v => v + 1)), []);
  // Fonts installed from template packages are needed on the screens too
  useEffect(() => { void loadInstalledFonts(); }, []);

  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ type: 'REQUEST_CURRENT_STATE' });
    
    channel.onmessage = (event) => {
      if (event.data?.type === 'VIDEO_CMD') {
        if (lockedRef.current) return; 
        
        const { command, value } = event.data;
        if (projectorVideoRef.current) {
           if (command === 'play') projectorVideoRef.current.play().catch(console.error);
           else if (command === 'pause') projectorVideoRef.current.pause();
           else if (command === 'mute') projectorVideoRef.current.muted = value;
           else if (command === 'seek') projectorVideoRef.current.currentTime = value;
        }
      } else if (event.data && !event.data.type?.startsWith('REQUEST_')) {
         
         setLiveState(prev => {
             const incoming = event.data;
             const isNowLocked = incoming.lockedOutputs?.[outputId];

             if (isNowLocked) {
                 return {
                     ...incoming,
                     slide: prev.slide,
                     stage: prev.stage,
                     globalBackground: prev.globalBackground,
                     clearText: prev.clearText,
                     clearedOutputs: {
                         ...incoming.clearedOutputs,
                         [outputId]: prev.clearedOutputs?.[outputId] 
                     }
                 };
             }
             return incoming;
         });

         if (!lockedRef.current && event.data.videoInitState && projectorVideoRef.current) {
             projectorVideoRef.current.currentTime = event.data.videoInitState.time;
             projectorVideoRef.current.muted = event.data.videoInitState.muted;
             if (event.data.videoInitState.playing) projectorVideoRef.current.play().catch(console.error);
             else projectorVideoRef.current.pause();
         }
      }
    };
    return () => channel.close();
  }, [outputId]);

  useEffect(() => { setSharedTimer(liveState.timer); }, [liveState.timer]);
  const outputConfig = liveState.settings?.outputs.find(o => o.id === outputId);
  const isCleared = !!liveState.clearedOutputs?.[outputId];
  const isLocked = !!liveState.lockedOutputs?.[outputId];
  const frozenState = liveState.frozenStates?.[outputId];
  
  const rawActiveBg = (liveState.globalBackground || outputConfig?.defaultBackground) ?? null;

  const displaySlide = isLocked ? frozenState?.slide : liveState.slide;
  const displayBg = resolveOutputBackground(isLocked ? frozenState?.bg : rawActiveBg, outputConfig, liveState.settings);
  const displayClearText = isLocked ? frozenState?.clearText : liveState.clearText;

  const hideBg = isCleared && outputId !== 'main';
  const hideText = isCleared;
  const stageStyle = getStyleForOutput(outputConfig, liveState.settings);

  return (
    <div
      className={`w-screen h-screen bg-transparent flex flex-col items-center justify-center overflow-hidden relative select-none ${onOperatorScreen ? 'cursor-pointer' : 'cursor-none'}`}
      onClick={onOperatorScreen ? closeOutput : undefined}
      data-output-page
    >
      {onOperatorScreen && (showHint || !liveState.isPresenting) && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl bg-black/80 border border-white/20 text-center shadow-2xl pointer-events-none" data-output-hint>
          <div className="text-white text-base font-semibold">Press Esc or click to close {outputConfig?.name || 'this output'}</div>
          {!liveState.isPresenting && <div className="text-neutral-400 text-sm mt-1">Nothing is being presented yet: in FlowShow, click the Presenting button (top right) and pick a slide.</div>}
        </div>
      )}
      {shown && <div className={`w-full h-full transition-opacity duration-700 ease-in-out ${liveState.isPresenting ? 'opacity-100' : 'opacity-0'}`}>
        <FixedStage className="w-full h-full relative">
          {isStageOutput(outputConfig) ? (
            <StageScreen
              layout={stageLayoutFor(stageStyle, displaySlide, liveState.settings?.stageLayouts)}
              slide={displaySlide}
              nextSlide={liveState.stage?.nextSlide}
              songTitle={liveState.stage?.songTitle}
              background={stageStyle?.backgroundColor}
              hideText={hideText || !!displayClearText}
            />
          ) : (
            <AudienceOutputContent
              output={outputConfig}
              settings={liveState.settings}
              slide={displaySlide}
              background={displayBg}
              hideBackground={hideBg}
              hideText={hideText || !!displayClearText}
              overlays={isLocked ? (frozenState?.overlays || []) : overlaysFor(liveState.settings?.overlays, liveState.overlays, outputId)}
              mix={isLocked ? frozenState?.mix : liveState.mix}
              videoRef={projectorVideoRef}
            />
          )}
        </FixedStage>
      </div>}
    </div>
  );
}
