/**
 * VideoPlayerPanel — HTMLVideoElement embedded in the Tauri WebView.
 *
 * The asset is served via Tauri's asset protocol (`convertFileSrc`). Why
 * HTMLVideoElement is the right starting point in 2026:
 *   - Chromium (the WebView) plays H.264/AAC inside MP4/MOV out of the
 *     box on Windows;
 *   - the perito's most common footage is MP4 from phones / dashcams;
 *   - the API is well-known (`currentTime`, `play()`, `pause()`,
 *     `requestVideoFrameCallback`);
 *   - everything we don't trust the player for (metadata, frame
 *     extraction) goes through Rust+ffmpeg, as the lab decided.
 *
 * Known limits surfaced in `docs/archive/SPIKE_F_VIDEO_ENGINE_RELATORIO.md`:
 * AVI / MKV with unusual codecs
 * may NOT play. The status bar shows the player's `error` event with a
 * clear message if that happens.
 */

import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  Pause,
  Play,
  Rewind,
  FastForward,
  StepBack,
  StepForward,
  AlertTriangle,
} from "lucide-react";
import styles from "./VideoPlayerPanel.module.css";

interface Props {
  workspacePath: string;
  relativePath: string;
  onTimeUpdate: (t: number) => void;
  onDurationLoaded: (d: number) => void;
  registerSeek: (fn: (seconds: number) => void) => void;
}

const PLAYBACK_RATES = [0.25, 0.5, 1, 2];

export function VideoPlayerPanel({
  workspacePath,
  relativePath,
  onTimeUpdate,
  onDurationLoaded,
  registerSeek,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const src = (() => {
    try {
      const sep = workspacePath.includes("\\") ? "\\" : "/";
      const abs = `${workspacePath}${sep}${relativePath.replace(/\//g, sep)}`;
      return convertFileSrc(abs);
    } catch {
      return null;
    }
  })();

  useEffect(() => {
    registerSeek((seconds: number) => {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = Math.max(0, Math.min(seconds, v.duration || seconds));
    });
  }, [registerSeek]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTime = () => onTimeUpdate(v.currentTime);
    const onMeta = () => onDurationLoaded(v.duration);
    const onErr = () => {
      const code = v.error?.code;
      setError(
        code != null
          ? `Falha ao reproduzir (MediaError code ${code}). Codec pode não ser suportado pelo WebView.`
          : "Falha ao reproduzir o vídeo.",
      );
    };
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("error", onErr);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("error", onErr);
    };
  }, [onTimeUpdate, onDurationLoaded]);

  const togglePlay = async () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      try {
        await v.play();
      } catch {
        /* autoplay/permission errors surface via error event */
      }
    } else {
      v.pause();
    }
  };

  const seekBy = (delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta));
  };

  /** Approximation of frame-step. WebView doesn't expose a true single-frame
   * step; using requestVideoFrameCallback would be ideal but its support is
   * mixed. We approximate with a small delta. The user gets honesty via the
   * warning banner on VFR videos. */
  const frameStep = (direction: 1 | -1) => {
    const v = videoRef.current;
    if (!v) return;
    if (!v.paused) v.pause();
    // 1/30s — works ok for typical 30 fps footage; technical truth comes
    // from ffmpeg, not from this step.
    seekBy(direction * (1 / 30));
  };

  return (
    <div className={styles.panel}>
      {error && (
        <div className={styles.errorBanner}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}
      <div className={styles.videoWrap}>
        {src ? (
          <video
            ref={videoRef}
            src={src}
            className={styles.video}
            controls={false}
            preload="metadata"
          />
        ) : (
          <div className={styles.placeholder}>
            Não foi possível resolver o caminho do vídeo.
          </div>
        )}
      </div>
      <div className={styles.controls}>
        <button type="button" onClick={() => seekBy(-5)} title="-5s">
          <Rewind size={14} />
        </button>
        <button
          type="button"
          onClick={() => frameStep(-1)}
          title="Voltar ~1 frame (aprox.)"
        >
          <StepBack size={14} />
        </button>
        <button
          type="button"
          className={styles.primary}
          onClick={() => void togglePlay()}
          title={isPlaying ? "Pausar (Espaço)" : "Reproduzir (Espaço)"}
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button
          type="button"
          onClick={() => frameStep(1)}
          title="Avançar ~1 frame (aprox.)"
        >
          <StepForward size={14} />
        </button>
        <button type="button" onClick={() => seekBy(5)} title="+5s">
          <FastForward size={14} />
        </button>
        <div className={styles.rateGroup} role="radiogroup" aria-label="Velocidade">
          {PLAYBACK_RATES.map((r) => (
            <button
              key={r}
              type="button"
              className={`${styles.rate} ${playbackRate === r ? styles.rateActive : ""}`}
              onClick={() => {
                const v = videoRef.current;
                if (!v) return;
                v.playbackRate = r;
                setPlaybackRate(r);
              }}
            >
              {r}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
