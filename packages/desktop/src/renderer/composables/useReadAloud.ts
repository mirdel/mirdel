import { computed, ref } from "vue";
import { markdownToPlain } from "@mirdel/markdown-to-plain";

export type ReadAloudTtsSettings = {
  voice: string;
  rate: string;
  pitch: string;
};

type SpeakInput = {
  messageId: string;
  markdown: string;
  tts?: Partial<ReadAloudTtsSettings>;
  onError?: (error: string) => void;
};

const speakingMessageId = ref<string | null>(null);
const pendingMessageId = ref<string | null>(null);
const readAloudTtsSettings = ref<ReadAloudTtsSettings>({
  voice: "zh-CN-XiaoxiaoNeural",
  rate: "+0%",
  pitch: "+0Hz",
});

const STREAM_MIME_TYPE = "audio/mpeg";
let readAloudSettingsLoaded = false;
let readAloudSettingsLoadingPromise: Promise<void> | null = null;
let saveReadAloudSettingsTimer: ReturnType<typeof setTimeout> | null = null;

type ActivePlayback = {
  requestId: string;
  messageId: string;
  audio: HTMLAudioElement;
  mediaSource: MediaSource;
  objectUrl: string;
  sourceBuffer: SourceBuffer | null;
  queue: Uint8Array[];
  streamDone: boolean;
  receivedFirstChunk: boolean;
  playRequested: boolean;
  playStarted: boolean;
  onError?: (error: string) => void;
  disposeStream?: () => void;
  disposed: boolean;
};

let activePlayback: ActivePlayback | null = null;

function hasTtsApi() {
  if (typeof window === "undefined") return false;
  if (typeof window.ipc !== "function") return false;
  if (!window.tts || typeof window.tts.onStream !== "function") return false;
  if (typeof MediaSource === "undefined") return false;
  return MediaSource.isTypeSupported(STREAM_MIME_TYPE);
}

function sanitizeForSpeech(markdown: string): string {
  const plain = markdownToPlain(markdown, { preserveLineBreaks: true });

  return plain
    .replace(/\[(?:S)?\d+\]\(cite:\d+\)/g, " ")
    .replace(/\[S\d+\](?!\()/g, " ")
    .replace(/\[(\d+(?:\s*,\s*\d+)*)\](?!\()/g, " ")
    .replace(/\[[^\]]*图片[^\]]*\]/g, " ")
    .replace(/\[[^\]]*image[^\]]*\]/gi, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function clearSpeakingState() {
  speakingMessageId.value = null;
  pendingMessageId.value = null;
}

function stopSpeaking() {
  if (!activePlayback) {
    clearSpeakingState();
    return;
  }
  cleanupPlayback(activePlayback, { abortRemote: true });
}

async function speakWithTtsService(
  messageId: string,
  text: string,
  tts: ReadAloudTtsSettings,
  onError?: (error: string) => void
): Promise<{ ok: boolean; error?: string }> {
  if (!hasTtsApi()) return { ok: false, error: "ipc_unavailable" };

  stopSpeaking();

  const requestId = createRequestId();
  const playback = createPlayback(messageId, requestId, onError);
  activePlayback = playback;
  speakingMessageId.value = messageId;
  pendingMessageId.value = messageId;

  try {
    playback.disposeStream = window.tts.onStream((event) => {
      if (event.requestId !== requestId || playback.disposed) return;

      if (event.type === "chunk") {
        if (!playback.receivedFirstChunk) {
          playback.receivedFirstChunk = true;
          if (pendingMessageId.value === messageId) {
            pendingMessageId.value = null;
          }
        }
        playback.queue.push(base64ToUint8Array(event.audioBase64));
        flushQueue(playback);
        ensurePlaybackStarted(playback);
        return;
      }

      if (event.type === "done") {
        if (!playback.receivedFirstChunk) {
          cleanupPlayback(playback, {
            abortRemote: false,
            reportError: "TTS returned no audio data",
          });
          return;
        }
        playback.streamDone = true;
        finalizeIfReady(playback);
        return;
      }

      if (event.type === "error") {
        cleanupPlayback(playback, {
          abortRemote: false,
          reportError: event.error || "tts_stream_failed",
        });
      }
    });

    const result = await window.ipc("tts:start", {
      requestId,
      text,
      voice: tts.voice,
      rate: tts.rate,
      pitch: tts.pitch,
    });
    if (!result?.ok) {
      cleanupPlayback(playback, { abortRemote: false });
      return { ok: false, error: result?.error || "tts_start_failed" };
    }

    return { ok: true };
  } catch (error) {
    if (activePlayback === playback) {
      cleanupPlayback(playback, { abortRemote: true });
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function speakMessage(
  input: SpeakInput
): Promise<{ ok: boolean; reason?: "unavailable" | "empty" | "playback_failed"; detail?: string }> {
  if (!hasTtsApi()) {
    return { ok: false, reason: "unavailable" };
  }

  const text = sanitizeForSpeech(String(input.markdown || ""));
  if (!text) {
    return { ok: false, reason: "empty" };
  }

  if (speakingMessageId.value === input.messageId) {
    stopSpeaking();
    return { ok: true };
  }

  stopSpeaking();

  const tts = normalizeReadAloudTtsSettings({
    ...readAloudTtsSettings.value,
    ...(input.tts || {}),
  });
  const ttsResult = await speakWithTtsService(input.messageId, text, tts, input.onError);
  if (ttsResult.ok) return { ok: true };
  return { ok: false, reason: "playback_failed", detail: ttsResult.error };
}

function normalizeReadAloudTtsSettings(input: Partial<ReadAloudTtsSettings>): ReadAloudTtsSettings {
  const voice = String(input.voice || "").trim() || "zh-CN-XiaoxiaoNeural";
  const rate = String(input.rate || "").trim() || "+0%";
  const pitch = String(input.pitch || "").trim() || "+0Hz";
  return { voice, rate, pitch };
}

async function ensureReadAloudSettingsLoaded(): Promise<void> {
  if (readAloudSettingsLoaded) return;
  if (readAloudSettingsLoadingPromise) {
    await readAloudSettingsLoadingPromise;
    return;
  }
  if (typeof window === "undefined" || typeof window.ipc !== "function") {
    readAloudSettingsLoaded = true;
    return;
  }

  readAloudSettingsLoadingPromise = (async () => {
    try {
      const result = await window.ipc("settings:getReadAloudTtsSettings");
      readAloudTtsSettings.value = normalizeReadAloudTtsSettings(result || {});
    } catch {
      // keep defaults
    } finally {
      readAloudSettingsLoaded = true;
      readAloudSettingsLoadingPromise = null;
    }
  })();

  await readAloudSettingsLoadingPromise;
}

async function persistReadAloudSettings(): Promise<void> {
  if (typeof window === "undefined" || typeof window.ipc !== "function") return;
  await window.ipc("settings:setReadAloudTtsSettings", {
    voice: readAloudTtsSettings.value.voice,
    rate: readAloudTtsSettings.value.rate,
    pitch: readAloudTtsSettings.value.pitch,
  });
}

function schedulePersistReadAloudSettings(delayMs = 300) {
  if (saveReadAloudSettingsTimer) {
    clearTimeout(saveReadAloudSettingsTimer);
  }
  saveReadAloudSettingsTimer = setTimeout(() => {
    saveReadAloudSettingsTimer = null;
    void persistReadAloudSettings();
  }, delayMs);
}

function updateReadAloudSettings(
  patch: Partial<ReadAloudTtsSettings>,
  options?: { immediate?: boolean }
) {
  readAloudTtsSettings.value = normalizeReadAloudTtsSettings({
    ...readAloudTtsSettings.value,
    ...(patch || {}),
  });
  if (options?.immediate) {
    void persistReadAloudSettings();
    return;
  }
  schedulePersistReadAloudSettings();
}

export function useReadAloud() {
  const isAvailable = computed(() => hasTtsApi());
  const isSpeaking = computed(() => speakingMessageId.value !== null);
  const isPending = computed(() => pendingMessageId.value !== null);

  function isSpeakingMessage(messageId?: string | null): boolean {
    if (!messageId) return false;
    return speakingMessageId.value === messageId;
  }

  function isPendingMessage(messageId?: string | null): boolean {
    if (!messageId) return false;
    return pendingMessageId.value === messageId;
  }

  return {
    isAvailable,
    isSpeaking,
    isPending,
    speakingMessageId,
    pendingMessageId,
    speakMessage,
    stopSpeaking,
    isSpeakingMessage,
    isPendingMessage,
    readAloudTtsSettings,
    ensureReadAloudSettingsLoaded,
    updateReadAloudSettings,
  };
}

function createRequestId(): string {
  return `tts_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createPlayback(messageId: string, requestId: string, onError?: (error: string) => void): ActivePlayback {
  const mediaSource = new MediaSource();
  const objectUrl = URL.createObjectURL(mediaSource);
  const audio = new Audio(objectUrl);

  const playback: ActivePlayback = {
    requestId,
    messageId,
    audio,
    mediaSource,
    objectUrl,
    sourceBuffer: null,
    queue: [],
    streamDone: false,
    receivedFirstChunk: false,
    playRequested: false,
    playStarted: false,
    onError,
    disposed: false,
  };

  mediaSource.addEventListener("sourceopen", () => {
    if (playback.disposed || playback.sourceBuffer) return;
    if (!MediaSource.isTypeSupported(STREAM_MIME_TYPE)) return;
    const sourceBuffer = mediaSource.addSourceBuffer(STREAM_MIME_TYPE);
    sourceBuffer.mode = "sequence";
    playback.sourceBuffer = sourceBuffer;

    sourceBuffer.addEventListener("updateend", () => {
      flushQueue(playback);
      finalizeIfReady(playback);
    });

    flushQueue(playback);
    finalizeIfReady(playback);
  });

  audio.onended = () => {
    if (activePlayback === playback) {
      cleanupPlayback(playback, { abortRemote: false });
    }
  };
  audio.onerror = () => {
    if (activePlayback === playback) {
      cleanupPlayback(playback, { abortRemote: true });
    }
  };

  return playback;
}

function flushQueue(playback: ActivePlayback) {
  if (playback.disposed) return;
  const sourceBuffer = playback.sourceBuffer;
  if (!sourceBuffer || sourceBuffer.updating) return;
  const chunk = playback.queue.shift();
  if (!chunk) return;
  try {
    sourceBuffer.appendBuffer(chunk);
  } catch {
    cleanupPlayback(playback, { abortRemote: true });
  }
}

function finalizeIfReady(playback: ActivePlayback) {
  if (playback.disposed) return;
  if (!playback.streamDone) return;
  if (playback.queue.length > 0) return;
  if (playback.sourceBuffer?.updating) return;
  if (playback.mediaSource.readyState !== "open") return;
  try {
    playback.mediaSource.endOfStream();
  } catch {
    // no-op
  }
}

function cleanupPlayback(playback: ActivePlayback, options: { abortRemote: boolean; reportError?: string }) {
  if (playback.disposed) return;
  playback.disposed = true;

  playback.disposeStream?.();

  if (options.abortRemote && hasTtsApi()) {
    void window.ipc("tts:stop", { requestId: playback.requestId }).catch(() => undefined);
  }

  playback.audio.pause();
  playback.audio.onended = null;
  playback.audio.onerror = null;
  playback.audio.src = "";

  if (playback.mediaSource.readyState === "open") {
    try {
      playback.mediaSource.endOfStream();
    } catch {
      // no-op
    }
  }

  URL.revokeObjectURL(playback.objectUrl);

  if (activePlayback === playback) {
    activePlayback = null;
    clearSpeakingState();
  }

  if (options.reportError && playback.onError) {
    playback.onError(options.reportError);
  }
}

function ensurePlaybackStarted(playback: ActivePlayback) {
  if (playback.disposed || playback.playRequested || playback.playStarted) return;
  playback.playRequested = true;
  void playback.audio.play().then(() => {
    if (playback.disposed) return;
    playback.playStarted = true;
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    cleanupPlayback(playback, {
      abortRemote: true,
      reportError: normalizePlaybackErrorMessage(message),
    });
  });
}

function base64ToUint8Array(base64: string): Uint8Array {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

function normalizePlaybackErrorMessage(message: string): string {
  if (message.includes("interrupted by a call to pause")) {
    return "Playback was interrupted before audio started";
  }
  return message;
}
