import { Buffer } from "node:buffer";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { WebSocket, type RawData } from "ws";

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const EDGE_FULL_VERSION = "143.0.3650.75";
const EDGE_GEC_VERSION = "1-143.0.3650";
const EDGE_USER_AGENT =
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ` +
  `(KHTML, like Gecko) Chrome/${EDGE_FULL_VERSION} Safari/537.36 Edg/${EDGE_FULL_VERSION}`;

const DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural";
const DEFAULT_OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const AUDIO_PATH_MARKER = Buffer.from("Path:audio\r\n");
const MAX_TEXT_LENGTH = 20_000;
const EDGE_ORIGIN = "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold";

type EdgeEndpointConfig = {
  name: "msedgeservices" | "bing";
  host: string;
  wsBaseUrl: string;
  wsTokenParam: string;
  voicesUrl: string;
  voicesTokenParam: string;
};

const EDGE_ENDPOINTS: readonly EdgeEndpointConfig[] = [
  {
    name: "msedgeservices",
    host: "api.msedgeservices.com",
    wsBaseUrl: "wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1",
    wsTokenParam: "Ocp-Apim-Subscription-Key",
    voicesUrl: "https://api.msedgeservices.com/tts/cognitiveservices/voices/list",
    voicesTokenParam: "Ocp-Apim-Subscription-Key",
  },
  {
    name: "bing",
    host: "speech.platform.bing.com",
    wsBaseUrl: "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1",
    wsTokenParam: "TrustedClientToken",
    voicesUrl: "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list",
    voicesTokenParam: "trustedclienttoken",
  },
];

let clockSkewSeconds = 0;

export type EdgeTtsVoice = {
  Name: string;
  ShortName: string;
  FriendlyName: string;
  Gender: "Male" | "Female";
  Locale: string;
  VoiceTag?: {
    ContentCategories?: string[];
    VoicePersonalities?: string[];
  };
};

export type EdgeTtsOptions = Partial<{
  voice: string;
  volume: string | number;
  rate: string | number;
  pitch: string | number;
  outputFormat: string;
  connectTimeoutMs: number;
  timeoutMs: number;
  signal: AbortSignal;
}>;

export async function getVoices(): Promise<EdgeTtsVoice[]> {
  let lastError: Error | null = null;

  for (const endpoint of EDGE_ENDPOINTS) {
    const secMsGec = generateSecMsGec(TRUSTED_CLIENT_TOKEN);
    const url = buildVoicesUrl(endpoint, secMsGec);

    try {
      const response = await fetch(url, {
        headers: buildBaseHeaders(),
      });

      if (response.status === 403 && adjustClockSkewFromHeader(response.headers.get("date"))) {
        const retrySecMsGec = generateSecMsGec(TRUSTED_CLIENT_TOKEN);
        const retryUrl = buildVoicesUrl(endpoint, retrySecMsGec);
        const retryResponse = await fetch(retryUrl, {
          headers: buildBaseHeaders(),
        });
        if (retryResponse.ok) {
          return normalizeVoicesResponse(await retryResponse.json());
        }
        lastError = new Error(
          `Failed to fetch voices from ${endpoint.name}: ${retryResponse.status} ${retryResponse.statusText}`
        );
        continue;
      }

      if (response.ok) {
        return normalizeVoicesResponse(await response.json());
      }

      lastError = new Error(`Failed to fetch voices from ${endpoint.name}: ${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error("Failed to fetch voices from all Edge TTS endpoints");
}

export async function synthesize(text: string, options: EdgeTtsOptions = {}): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of synthesizeStream(text, options)) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function* synthesizeStream(text: string, options: EdgeTtsOptions = {}): AsyncGenerator<Uint8Array, void, unknown> {
  const normalizedText = normalizeText(text);
  if (!normalizedText) {
    throw new Error("Missing required field: text");
  }
  if (normalizedText.length > MAX_TEXT_LENGTH) {
    throw new Error(`Text is too long (${normalizedText.length}). Max length is ${MAX_TEXT_LENGTH}.`);
  }

  const voice = normalizeVoice(options.voice);
  const rate = normalizeRate(options.rate);
  const pitch = normalizePitch(options.pitch);
  const volume = normalizeVolume(options.volume);
  const outputFormat = (options.outputFormat || "").trim() || DEFAULT_OUTPUT_FORMAT;
  const connectTimeoutMs = Number.isFinite(options.connectTimeoutMs)
    ? Math.max(1_000, Number(options.connectTimeoutMs))
    : DEFAULT_CONNECT_TIMEOUT_MS;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(1_000, Number(options.timeoutMs)) : DEFAULT_TIMEOUT_MS;
  const signal = options.signal;
  const ws = await openSynthesisSocket(connectTimeoutMs, signal);

  const queue: Uint8Array[] = [];
  let done = false;
  let aborted = false;
  let error: Error | null = null;
  let wake: (() => void) | null = null;
  let inactivityTimer: NodeJS.Timeout | null = null;

  const clearWake = () => {
    if (wake) {
      wake();
      wake = null;
    }
  };

  const resetTimeout = () => {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
      error = new Error(`WebSocket inactivity timeout (${timeoutMs}ms)`);
      done = true;
      safelyCloseSocket(ws);
      clearWake();
    }, timeoutMs);
  };

  const onAbort = () => {
    aborted = true;
    done = true;
    safelyCloseSocket(ws);
    clearWake();
  };

  if (signal?.aborted) {
    onAbort();
  } else {
    signal?.addEventListener("abort", onAbort, { once: true });
  }

  ws.on("message", (rawData: RawData, isBinary: boolean) => {
    resetTimeout();
    const data = toBuffer(rawData);

    if (!isBinary) {
      const textData = data.toString("utf8");
      if (textData.includes("Path:turn.end") || textData.includes("turn.end")) {
        done = true;
        safelyCloseSocket(ws);
        clearWake();
      }
      return;
    }

    const markerIndex = data.indexOf(AUDIO_PATH_MARKER);
    if (markerIndex !== -1) {
      const content = data.subarray(markerIndex + AUDIO_PATH_MARKER.length);
      if (content.length > 0) {
        queue.push(new Uint8Array(content));
        clearWake();
      }
      return;
    }

    if (data.toString("utf8").includes("Path:turn.end")) {
      done = true;
      safelyCloseSocket(ws);
      clearWake();
    }
  });

  ws.on("error", (wsError) => {
    error = wsError instanceof Error ? wsError : new Error(String(wsError));
    done = true;
    clearWake();
  });

  ws.on("close", () => {
    done = true;
    clearWake();
  });

  try {
    resetTimeout();
    sendSynthesisRequest(ws, normalizedText, outputFormat, { voice, rate, pitch, volume }, (sendError) => {
      error = sendError;
      done = true;
      safelyCloseSocket(ws);
      clearWake();
    });

    while (!done || queue.length > 0) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        continue;
      }
      const chunk = queue.shift();
      if (chunk) {
        yield chunk;
      }
    }

    if (!aborted && error) {
      throw error;
    }
  } finally {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    signal?.removeEventListener("abort", onAbort);
    safelyCloseSocket(ws);
  }
}

function normalizeText(input: string): string {
  return String(input || "").trim();
}

function normalizeVoice(input?: string): string {
  const value = String(input || "").trim();
  return value || DEFAULT_VOICE;
}

function normalizeRate(input?: string | number): string {
  if (typeof input === "number" && Number.isFinite(input)) {
    return `${input >= 0 ? "+" : ""}${input}%`;
  }
  const value = String(input || "").trim();
  if (!value) return "+0%";
  if (/^[+-]?\d+(\.\d+)?%$/.test(value)) {
    return value.startsWith("+") || value.startsWith("-") ? value : `+${value}`;
  }
  return value;
}

function normalizePitch(input?: string | number): string {
  if (typeof input === "number" && Number.isFinite(input)) {
    return `${input >= 0 ? "+" : ""}${input}Hz`;
  }
  const value = String(input || "").trim();
  if (!value) return "+0Hz";
  if (/^[+-]?\d+(\.\d+)?Hz$/.test(value)) {
    return value.startsWith("+") || value.startsWith("-") ? value : `+${value}`;
  }
  return value;
}

function normalizeVolume(input?: string | number): string {
  if (typeof input === "number" && Number.isFinite(input)) {
    return `${input >= 0 ? "+" : ""}${input}%`;
  }
  const value = String(input || "").trim();
  if (!value) return "+0%";
  if (/^[+-]?\d+(\.\d+)?%$/.test(value)) {
    return value.startsWith("+") || value.startsWith("-") ? value : `+${value}`;
  }
  return value;
}

function buildSsml(
  text: string,
  input: {
    voice: string;
    rate: string;
    pitch: string;
    volume: string;
  }
): string {
  const xmlLang = resolveLocaleFromVoice(input.voice);
  return (
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${xmlLang}'>` +
    `<voice name='${escapeXml(input.voice)}'>` +
    `<prosody pitch='${escapeXml(input.pitch)}' rate='${escapeXml(input.rate)}' volume='${escapeXml(input.volume)}'>` +
    `${escapeXml(text)}` +
    "</prosody></voice></speak>"
  );
}

function resolveLocaleFromVoice(voice: string): string {
  const match = /^([a-z]{2}-[A-Z]{2})-/.exec(voice);
  return match?.[1] || "en-US";
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function createConnectionId(): string {
  return randomUUID().replaceAll("-", "");
}

function createToken32(): string {
  return randomBytes(16).toString("hex").toUpperCase();
}

function generateSecMsGec(trustedClientToken: string): string {
  const unixSecondsWithWindowsEpoch = Math.floor(Date.now() / 1000 + clockSkewSeconds) + 11_644_473_600;
  const rounded = unixSecondsWithWindowsEpoch - (unixSecondsWithWindowsEpoch % 300);
  const windowsTicks = rounded * 10_000_000;
  const payload = `${windowsTicks}${trustedClientToken}`;
  return createHash("sha256").update(payload).digest("hex").toUpperCase();
}

function adjustClockSkewFromHeader(serverDate: string | null | undefined): boolean {
  if (!serverDate) return false;
  const serverMs = Date.parse(serverDate);
  if (!Number.isFinite(serverMs)) return false;
  const clientSeconds = Date.now() / 1000 + clockSkewSeconds;
  const serverSeconds = serverMs / 1000;
  clockSkewSeconds += serverSeconds - clientSeconds;
  return true;
}

function buildVoicesUrl(endpoint: EdgeEndpointConfig, secMsGec: string): string {
  const params = new URLSearchParams();
  params.set(endpoint.voicesTokenParam, TRUSTED_CLIENT_TOKEN);
  params.set("Sec-MS-GEC", secMsGec);
  params.set("Sec-MS-GEC-Version", EDGE_GEC_VERSION);
  return `${endpoint.voicesUrl}?${params.toString()}`;
}

function buildWsUrl(endpoint: EdgeEndpointConfig, secMsGec: string): string {
  const params = new URLSearchParams();
  params.set(endpoint.wsTokenParam, TRUSTED_CLIENT_TOKEN);
  params.set("Sec-MS-GEC", secMsGec);
  params.set("Sec-MS-GEC-Version", EDGE_GEC_VERSION);
  params.set("ConnectionId", createConnectionId());
  return `${endpoint.wsBaseUrl}?${params.toString()}`;
}

function buildBaseHeaders(): Record<string, string> {
  return {
    "User-Agent": EDGE_USER_AGENT,
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    Cookie: `MUID=${createToken32()};`,
  };
}

class HttpStatusError extends Error {
  readonly statusCode: number;
  readonly serverDate: string | undefined;

  constructor(statusCode: number, message: string, serverDate?: string) {
    super(message);
    this.name = "HttpStatusError";
    this.statusCode = statusCode;
    this.serverDate = serverDate;
  }
}

async function openSynthesisSocket(connectTimeoutMs: number, signal?: AbortSignal): Promise<WebSocket> {
  let lastError: Error | null = null;

  for (const endpoint of EDGE_ENDPOINTS) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const secMsGec = generateSecMsGec(TRUSTED_CLIENT_TOKEN);
        const url = buildWsUrl(endpoint, secMsGec);
        return await openSingleSocket(endpoint, url, connectTimeoutMs, signal);
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        lastError = normalized;

        if (
          normalized instanceof HttpStatusError &&
          normalized.statusCode === 403 &&
          attempt === 0 &&
          adjustClockSkewFromHeader(normalized.serverDate)
        ) {
          continue;
        }
        break;
      }
    }
  }

  throw lastError ?? new Error("Failed to connect to Edge TTS websocket");
}

function openSingleSocket(
  endpoint: EdgeEndpointConfig,
  wsUrl: string,
  connectTimeoutMs: number,
  signal?: AbortSignal
): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: NodeJS.Timeout | null = null;

    const ws = new WebSocket(wsUrl, {
      host: endpoint.host,
      origin: EDGE_ORIGIN,
      headers: {
        ...buildBaseHeaders(),
        Pragma: "no-cache",
        "Cache-Control": "no-cache",
        "Sec-WebSocket-Protocol": "synthesize",
      },
    });

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      signal?.removeEventListener("abort", onAbort);
      ws.removeListener("open", onOpen);
      ws.removeListener("error", onError);
      ws.removeListener("unexpected-response", onUnexpectedResponse);
    };

    const settleReject = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      safelyTerminateSocket(ws);
      reject(error);
    };

    const settleResolve = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(ws);
    };

    const onAbort = () => {
      settleReject(new Error("TTS request aborted"));
    };

    const onOpen = () => {
      settleResolve();
    };

    const onError = (wsError: Error) => {
      settleReject(wsError instanceof Error ? wsError : new Error(String(wsError)));
    };

    const onUnexpectedResponse = (_request: unknown, response: IncomingMessage) => {
      const statusCode = Number(response.statusCode || 0);
      const serverDate = getHeaderString(response.headers, "date");
      response.resume();
      settleReject(new HttpStatusError(statusCode, `Unexpected server response: ${statusCode}`, serverDate));
    };

    ws.once("open", onOpen);
    ws.once("error", onError);
    ws.once("unexpected-response", onUnexpectedResponse);

    timer = setTimeout(() => {
      settleReject(new Error(`WebSocket connection timeout (${connectTimeoutMs}ms)`));
    }, connectTimeoutMs);

    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function getHeaderString(headers: IncomingHttpHeaders, key: string): string | undefined {
  const value = headers[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) return value[0];
  return undefined;
}

function sendSynthesisRequest(
  ws: WebSocket,
  text: string,
  outputFormat: string,
  input: {
    voice: string;
    rate: string;
    pitch: string;
    volume: string;
  },
  onError: (error: Error) => void
): void {
  const timestamp = new Date().toUTCString();
  const speechConfigMessage =
    `X-Timestamp:${timestamp}\r\n` +
    "Content-Type:application/json; charset=utf-8\r\n" +
    "Path:speech.config\r\n\r\n" +
    JSON.stringify({
      context: {
        synthesis: {
          audio: {
            metadataoptions: {
              sentenceBoundaryEnabled: false,
              wordBoundaryEnabled: false,
            },
            outputFormat,
          },
        },
      },
    });

  ws.send(speechConfigMessage, { compress: true }, (configError) => {
    if (configError) {
      onError(configError instanceof Error ? configError : new Error(String(configError)));
      return;
    }

    const ssmlMessage =
      `X-RequestId:${createConnectionId()}\r\n` +
      "Content-Type:application/ssml+xml\r\n" +
      `X-Timestamp:${new Date().toUTCString()}Z\r\n` +
      "Path:ssml\r\n\r\n" +
      buildSsml(text, input);

    ws.send(ssmlMessage, { compress: true }, (ssmlError) => {
      if (!ssmlError) return;
      onError(ssmlError instanceof Error ? ssmlError : new Error(String(ssmlError)));
    });
  });
}

function normalizeVoicesResponse(input: unknown): EdgeTtsVoice[] {
  if (Array.isArray(input)) return input as EdgeTtsVoice[];
  if (input && typeof input === "object") {
    const maybeVoices = (input as { voices?: unknown }).voices;
    if (Array.isArray(maybeVoices)) return maybeVoices as EdgeTtsVoice[];
  }
  return [];
}

function safelyCloseSocket(ws: WebSocket): void {
  if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) return;
  try {
    ws.close();
  } catch {
    // no-op
  }
}

function safelyTerminateSocket(ws: WebSocket): void {
  if (ws.readyState === WebSocket.CLOSED) return;
  try {
    ws.terminate();
  } catch {
    // no-op
  }
}

function toBuffer(rawData: RawData): Buffer {
  if (Buffer.isBuffer(rawData)) return rawData;
  if (rawData instanceof ArrayBuffer) return Buffer.from(rawData);
  if (Array.isArray(rawData)) return Buffer.concat(rawData.map(toBuffer));
  return Buffer.from(rawData as Uint8Array);
}
