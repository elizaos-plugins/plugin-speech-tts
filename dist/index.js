// src/services/speech.ts
import { PassThrough } from "stream";
import { Readable } from "node:stream";
import { ReadableStream } from "node:stream/web";
import { ServiceType } from "@elizaos/core";

// src/services/audioUtils.ts
function getWavHeader(audioLength, sampleRate, channelCount = 1, bitsPerSample = 16) {
  const wavHeader = Buffer.alloc(44);
  wavHeader.write("RIFF", 0);
  wavHeader.writeUInt32LE(36 + audioLength, 4);
  wavHeader.write("WAVE", 8);
  wavHeader.write("fmt ", 12);
  wavHeader.writeUInt32LE(16, 16);
  wavHeader.writeUInt16LE(1, 20);
  wavHeader.writeUInt16LE(channelCount, 22);
  wavHeader.writeUInt32LE(sampleRate, 24);
  wavHeader.writeUInt32LE(
    sampleRate * bitsPerSample * channelCount / 8,
    28
  );
  wavHeader.writeUInt16LE(bitsPerSample * channelCount / 8, 32);
  wavHeader.writeUInt16LE(bitsPerSample, 34);
  wavHeader.write("data", 36);
  wavHeader.writeUInt32LE(audioLength, 40);
  return wavHeader;
}

// src/services/speech.ts
import { Service } from "@elizaos/core";

// src/environment.ts
import { z } from "zod";
var nodeEnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OpenAI API key is required"),
  // Core settings
  ELEVENLABS_XI_API_KEY: z.string().optional(),
  // All other settings optional with defaults
  ELEVENLABS_MODEL_ID: z.string().optional(),
  ELEVENLABS_VOICE_ID: z.string().optional(),
  ELEVENLABS_VOICE_STABILITY: z.string().optional(),
  ELEVENLABS_VOICE_SIMILARITY_BOOST: z.string().optional(),
  ELEVENLABS_VOICE_STYLE: z.string().optional(),
  ELEVENLABS_VOICE_USE_SPEAKER_BOOST: z.string().optional(),
  ELEVENLABS_OPTIMIZE_STREAMING_LATENCY: z.string().optional(),
  ELEVENLABS_OUTPUT_FORMAT: z.string().optional(),
  VITS_VOICE: z.string().optional(),
  VITS_MODEL: z.string().optional()
});
async function validateNodeConfig(runtime) {
  var _a;
  try {
    const voiceSettings = (_a = runtime.character.settings) == null ? void 0 : _a.voice;
    const elevenlabs = voiceSettings == null ? void 0 : voiceSettings.elevenlabs;
    const config = {
      OPENAI_API_KEY: runtime.getSetting("OPENAI_API_KEY") || process.env.OPENAI_API_KEY,
      ELEVENLABS_XI_API_KEY: runtime.getSetting("ELEVENLABS_XI_API_KEY") || process.env.ELEVENLABS_XI_API_KEY,
      // Use character card settings first, fall back to env vars, then defaults
      ...runtime.getSetting("ELEVENLABS_XI_API_KEY") && {
        ELEVENLABS_MODEL_ID: (elevenlabs == null ? void 0 : elevenlabs.model) || process.env.ELEVENLABS_MODEL_ID || "eleven_monolingual_v1",
        ELEVENLABS_VOICE_ID: (elevenlabs == null ? void 0 : elevenlabs.voiceId) || process.env.ELEVENLABS_VOICE_ID,
        ELEVENLABS_VOICE_STABILITY: (elevenlabs == null ? void 0 : elevenlabs.stability) || process.env.ELEVENLABS_VOICE_STABILITY || "0.5",
        ELEVENLABS_VOICE_SIMILARITY_BOOST: (elevenlabs == null ? void 0 : elevenlabs.similarityBoost) || process.env.ELEVENLABS_VOICE_SIMILARITY_BOOST || "0.75",
        ELEVENLABS_VOICE_STYLE: (elevenlabs == null ? void 0 : elevenlabs.style) || process.env.ELEVENLABS_VOICE_STYLE || "0",
        ELEVENLABS_VOICE_USE_SPEAKER_BOOST: (elevenlabs == null ? void 0 : elevenlabs.useSpeakerBoost) || process.env.ELEVENLABS_VOICE_USE_SPEAKER_BOOST || "true",
        ELEVENLABS_OPTIMIZE_STREAMING_LATENCY: process.env.ELEVENLABS_OPTIMIZE_STREAMING_LATENCY || "0",
        ELEVENLABS_OUTPUT_FORMAT: process.env.ELEVENLABS_OUTPUT_FORMAT || "pcm_16000"
      },
      // VITS settings
      VITS_VOICE: (voiceSettings == null ? void 0 : voiceSettings.model) || process.env.VITS_VOICE,
      VITS_MODEL: process.env.VITS_MODEL
      // AWS settings (only include if presen
    };
    return nodeEnvSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map((err) => `${err.path.join(".")}: ${err.message}`).join("\n");
      throw new Error(
        `Node configuration validation failed:
${errorMessages}`
      );
    }
    throw error;
  }
}

// src/services/speech.ts
import * as Echogarden from "echogarden";
import { elizaLogger } from "@elizaos/core";
function prependWavHeader(readable, audioLength, sampleRate, channelCount = 1, bitsPerSample = 16) {
  const wavHeader = getWavHeader(
    audioLength,
    sampleRate,
    channelCount,
    bitsPerSample
  );
  let pushedHeader = false;
  const passThrough = new PassThrough();
  readable.on("data", function(data) {
    if (!pushedHeader) {
      passThrough.push(wavHeader);
      pushedHeader = true;
    }
    passThrough.push(data);
  });
  readable.on("end", function() {
    passThrough.end();
  });
  return passThrough;
}
async function getVoiceSettings(runtime) {
  var _a;
  const hasElevenLabs = !!runtime.getSetting("ELEVENLABS_XI_API_KEY");
  const useVits = !hasElevenLabs;
  const voiceSettings = (_a = runtime.character.settings) == null ? void 0 : _a.voice;
  const elevenlabsSettings = voiceSettings == null ? void 0 : voiceSettings.elevenlabs;
  elizaLogger.debug("Voice settings:", {
    hasElevenLabs,
    useVits,
    voiceSettings,
    elevenlabsSettings
  });
  return {
    elevenlabsVoiceId: (elevenlabsSettings == null ? void 0 : elevenlabsSettings.voiceId) || runtime.getSetting("ELEVENLABS_VOICE_ID"),
    elevenlabsModel: (elevenlabsSettings == null ? void 0 : elevenlabsSettings.model) || runtime.getSetting("ELEVENLABS_MODEL_ID") || "eleven_monolingual_v1",
    elevenlabsStability: (elevenlabsSettings == null ? void 0 : elevenlabsSettings.stability) || runtime.getSetting("ELEVENLABS_VOICE_STABILITY") || "0.5",
    // ... other ElevenLabs settings ...
    vitsVoice: (voiceSettings == null ? void 0 : voiceSettings.model) || (voiceSettings == null ? void 0 : voiceSettings.url) || runtime.getSetting("VITS_VOICE") || "en_US-hfc_female-medium",
    elevenlabsUrl: runtime.getSetting("ELEVENLABS_XI_API_URL") || "https://api.elevenlabs.io/v1",
    useVits
  };
}
async function textToSpeech(runtime, text) {
  var _a;
  await validateNodeConfig(runtime);
  const { elevenlabsVoiceId, elevenlabsUrl } = await getVoiceSettings(runtime);
  try {
    const response = await fetch(
      `${elevenlabsUrl}/text-to-speech/${elevenlabsVoiceId}/stream?optimize_streaming_latency=${runtime.getSetting("ELEVENLABS_OPTIMIZE_STREAMING_LATENCY")}&output_format=${runtime.getSetting("ELEVENLABS_OUTPUT_FORMAT")}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": runtime.getSetting("ELEVENLABS_XI_API_KEY")
        },
        body: JSON.stringify({
          model_id: runtime.getSetting("ELEVENLABS_MODEL_ID"),
          text,
          voice_settings: {
            similarity_boost: runtime.getSetting(
              "ELEVENLABS_VOICE_SIMILARITY_BOOST"
            ),
            stability: runtime.getSetting(
              "ELEVENLABS_VOICE_STABILITY"
            ),
            style: runtime.getSetting("ELEVENLABS_VOICE_STYLE"),
            use_speaker_boost: runtime.getSetting(
              "ELEVENLABS_VOICE_USE_SPEAKER_BOOST"
            )
          }
        })
      }
    );
    const status = response.status;
    if (status != 200) {
      const errorBodyString = await response.text();
      const errorBody = JSON.parse(errorBodyString);
      if (status === 401 && ((_a = errorBody.detail) == null ? void 0 : _a.status) === "quota_exceeded") {
        elizaLogger.log(
          "ElevenLabs quota exceeded, falling back to VITS"
        );
        throw new Error("QUOTA_EXCEEDED");
      }
      throw new Error(
        `Received status ${status} from Eleven Labs API: ${errorBodyString}`
      );
    }
    if (response) {
      const webStream = ReadableStream.from(
        response.body
      );
      const reader = webStream.getReader();
      const readable = new Readable({
        read() {
          reader.read().then(({ done, value }) => {
            if (done) {
              this.push(null);
            } else {
              this.push(value);
            }
          });
        }
      });
      if (runtime.getSetting("ELEVENLABS_OUTPUT_FORMAT").startsWith("pcm_")) {
        const sampleRate = parseInt(
          runtime.getSetting("ELEVENLABS_OUTPUT_FORMAT").substring(4)
        );
        const withHeader = prependWavHeader(
          readable,
          1024 * 1024 * 100,
          sampleRate,
          1,
          16
        );
        return withHeader;
      } else {
        return readable;
      }
    } else {
      return new Readable({
        read() {
        }
      });
    }
  } catch (error) {
    if (error.message === "QUOTA_EXCEEDED") {
      const { vitsVoice } = await getVoiceSettings(runtime);
      const { audio } = await Echogarden.synthesize(text, {
        engine: "vits",
        voice: vitsVoice
      });
      let wavStream;
      if (audio instanceof Buffer) {
        elizaLogger.log("audio is a buffer");
        wavStream = Readable.from(audio);
      } else if ("audioChannels" in audio && "sampleRate" in audio) {
        elizaLogger.log("audio is a RawAudio");
        const floatBuffer = Buffer.from(audio.audioChannels[0].buffer);
        elizaLogger.log("buffer length: ", floatBuffer.length);
        const sampleRate = audio.sampleRate;
        const floatArray = new Float32Array(floatBuffer.buffer);
        const pcmBuffer = new Int16Array(floatArray.length);
        for (let i = 0; i < floatArray.length; i++) {
          pcmBuffer[i] = Math.round(floatArray[i] * 32767);
        }
        const wavHeaderBuffer = getWavHeader(
          pcmBuffer.length * 2,
          sampleRate,
          1,
          16
        );
        const wavBuffer = Buffer.concat([
          wavHeaderBuffer,
          Buffer.from(pcmBuffer.buffer)
        ]);
        wavStream = Readable.from(wavBuffer);
      } else {
        throw new Error("Unsupported audio format");
      }
      return wavStream;
    }
    throw error;
  }
}
async function processVitsAudio(audio) {
  let wavStream;
  if (audio instanceof Buffer) {
    elizaLogger.log("audio is a buffer");
    wavStream = Readable.from(audio);
  } else if ("audioChannels" in audio && "sampleRate" in audio) {
    elizaLogger.log("audio is a RawAudio");
    const floatBuffer = Buffer.from(audio.audioChannels[0].buffer);
    elizaLogger.log("buffer length: ", floatBuffer.length);
    const sampleRate = audio.sampleRate;
    const floatArray = new Float32Array(floatBuffer.buffer);
    const pcmBuffer = new Int16Array(floatArray.length);
    for (let i = 0; i < floatArray.length; i++) {
      pcmBuffer[i] = Math.round(floatArray[i] * 32767);
    }
    const wavHeaderBuffer = getWavHeader(
      pcmBuffer.length * 2,
      sampleRate,
      1,
      16
    );
    const wavBuffer = Buffer.concat([
      wavHeaderBuffer,
      Buffer.from(pcmBuffer.buffer)
    ]);
    wavStream = Readable.from(wavBuffer);
  } else {
    throw new Error("Unsupported audio format");
  }
  return wavStream;
}
async function generateVitsAudio(runtime, text) {
  const { vitsVoice } = await getVoiceSettings(runtime);
  const { audio } = await Echogarden.synthesize(text, {
    engine: "vits",
    voice: vitsVoice
  });
  return processVitsAudio(audio);
}
var SpeechService = class _SpeechService extends Service {
  static serviceType = ServiceType.SPEECH_GENERATION;
  async initialize(_runtime) {
  }
  getInstance() {
    return _SpeechService.getInstance();
  }
  async generate(runtime, text) {
    try {
      const { useVits } = await getVoiceSettings(runtime);
      if (useVits || !runtime.getSetting("ELEVENLABS_XI_API_KEY")) {
        return await generateVitsAudio(runtime, text);
      }
      return await textToSpeech(runtime, text);
    } catch (error) {
      console.error("Speech generation error:", error);
      return await generateVitsAudio(runtime, text);
    }
  }
};

// src/services/transcription.ts
import {
  elizaLogger as elizaLogger2,
  settings,
  TranscriptionProvider
} from "@elizaos/core";
import { Service as Service2, ServiceType as ServiceType2 } from "@elizaos/core";
import { exec } from "child_process";
import { File } from "formdata-node";
import fs from "fs";
import { nodewhisper } from "nodejs-whisper";
import OpenAI from "openai";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";
import { createClient } from "@deepgram/sdk";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var execAsync = promisify(exec);
var TranscriptionService = class extends Service2 {
  runtime = null;
  static serviceType = ServiceType2.TRANSCRIPTION;
  CONTENT_CACHE_DIR;
  DEBUG_AUDIO_DIR;
  TARGET_SAMPLE_RATE = 16e3;
  // Common sample rate for speech recognition
  isCudaAvailable = false;
  /**
   * CHANGED: We now use TranscriptionProvider instead of separate flags/strings.
   * This allows us to handle character settings, env variables, and fallback logic.
   */
  transcriptionProvider = null;
  deepgram = null;
  openai = null;
  /**
   * We keep the queue and processing logic as is.
   */
  queue = [];
  processing = false;
  /**
   * CHANGED: initialize() now checks:
   * 1) character.settings.transcription (if available and keys exist),
   * 2) then the .env TRANSCRIPTION_PROVIDER,
   * 3) then old fallback logic (Deepgram -> OpenAI -> local).
   */
  async initialize(_runtime) {
    var _a, _b;
    this.runtime = _runtime;
    const openaiBaseURL = this.runtime.getSetting(
      "OPENAI_BASE_URL"
    ) || null;
    let chosenProvider = null;
    const charSetting = (_b = (_a = this.runtime.character) == null ? void 0 : _a.settings) == null ? void 0 : _b.transcription;
    if (charSetting === TranscriptionProvider.Deepgram) {
      const deepgramKey = this.runtime.getSetting("DEEPGRAM_API_KEY");
      if (deepgramKey) {
        this.deepgram = createClient(deepgramKey);
        chosenProvider = TranscriptionProvider.Deepgram;
      }
    } else if (charSetting === TranscriptionProvider.OpenAI) {
      const openaiKey = this.runtime.getSetting("OPENAI_API_KEY");
      if (openaiKey) {
        this.openai = new OpenAI({ apiKey: openaiKey, baseURL: openaiBaseURL });
        chosenProvider = TranscriptionProvider.OpenAI;
      }
    } else if (charSetting === TranscriptionProvider.Local) {
      chosenProvider = TranscriptionProvider.Local;
    }
    if (!chosenProvider) {
      const envProvider = this.runtime.getSetting(
        "TRANSCRIPTION_PROVIDER"
      );
      if (envProvider) {
        switch (envProvider.toLowerCase()) {
          case "deepgram":
            {
              const dgKey = this.runtime.getSetting("DEEPGRAM_API_KEY");
              if (dgKey) {
                this.deepgram = createClient(dgKey);
                chosenProvider = TranscriptionProvider.Deepgram;
              }
            }
            break;
          case "openai":
            {
              const openaiKey = this.runtime.getSetting("OPENAI_API_KEY");
              if (openaiKey) {
                this.openai = new OpenAI({ apiKey: openaiKey, baseURL: openaiBaseURL });
                chosenProvider = TranscriptionProvider.OpenAI;
              }
            }
            break;
          case "local":
            chosenProvider = TranscriptionProvider.Local;
            break;
        }
      }
    }
    if (!chosenProvider) {
      const deepgramKey = this.runtime.getSetting("DEEPGRAM_API_KEY");
      if (deepgramKey) {
        this.deepgram = createClient(deepgramKey);
        chosenProvider = TranscriptionProvider.Deepgram;
      } else {
        const openaiKey = this.runtime.getSetting("OPENAI_API_KEY");
        if (openaiKey) {
          this.openai = new OpenAI({ apiKey: openaiKey, baseURL: openaiBaseURL });
          chosenProvider = TranscriptionProvider.OpenAI;
        } else {
          chosenProvider = TranscriptionProvider.Local;
        }
      }
    }
    this.transcriptionProvider = chosenProvider;
    this.detectCuda();
  }
  constructor() {
    super();
    const rootDir = path.resolve(__dirname, "../../");
    this.CONTENT_CACHE_DIR = path.join(rootDir, "content_cache");
    this.DEBUG_AUDIO_DIR = path.join(rootDir, "debug_audio");
    this.ensureCacheDirectoryExists();
    this.ensureDebugDirectoryExists();
  }
  ensureCacheDirectoryExists() {
    if (!fs.existsSync(this.CONTENT_CACHE_DIR)) {
      fs.mkdirSync(this.CONTENT_CACHE_DIR, { recursive: true });
    }
  }
  ensureDebugDirectoryExists() {
    if (!fs.existsSync(this.DEBUG_AUDIO_DIR)) {
      fs.mkdirSync(this.DEBUG_AUDIO_DIR, { recursive: true });
    }
  }
  detectCuda() {
    const platform = os.platform();
    if (platform === "linux") {
      try {
        fs.accessSync("/usr/local/cuda/bin/nvcc", fs.constants.X_OK);
        this.isCudaAvailable = true;
        elizaLogger2.log(
          "CUDA detected. Transcription will use CUDA acceleration."
        );
      } catch (_error) {
        elizaLogger2.log(
          "CUDA not detected. Transcription will run on CPU."
        );
      }
    } else if (platform === "win32") {
      const cudaPath = path.join(
        settings.CUDA_PATH || "C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v11.0",
        "bin",
        "nvcc.exe"
      );
      if (fs.existsSync(cudaPath)) {
        this.isCudaAvailable = true;
        elizaLogger2.log(
          "CUDA detected. Transcription will use CUDA acceleration."
        );
      } else {
        elizaLogger2.log(
          "CUDA not detected. Transcription will run on CPU."
        );
      }
    } else {
      elizaLogger2.log(
        "CUDA not supported on this platform. Transcription will run on CPU."
      );
    }
  }
  async convertAudio(inputBuffer) {
    const inputPath = path.join(
      this.CONTENT_CACHE_DIR,
      `input_${Date.now()}.wav`
    );
    const outputPath = path.join(
      this.CONTENT_CACHE_DIR,
      `output_${Date.now()}.wav`
    );
    fs.writeFileSync(inputPath, Buffer.from(inputBuffer));
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -show_entries stream=codec_name,sample_rate,channels -of json "${inputPath}"`
      );
      const probeResult = JSON.parse(stdout);
      const stream = probeResult.streams[0];
      elizaLogger2.log("Input audio info:", stream);
      let ffmpegCommand = `ffmpeg -i "${inputPath}" -ar ${this.TARGET_SAMPLE_RATE} -ac 1`;
      if (stream.codec_name === "pcm_f32le") {
        ffmpegCommand += " -acodec pcm_s16le";
      }
      ffmpegCommand += ` "${outputPath}"`;
      elizaLogger2.log("FFmpeg command:", ffmpegCommand);
      await execAsync(ffmpegCommand);
      const convertedBuffer = fs.readFileSync(outputPath);
      fs.unlinkSync(inputPath);
      fs.unlinkSync(outputPath);
      return convertedBuffer;
    } catch (error) {
      elizaLogger2.error("Error converting audio:", error);
      throw error;
    }
  }
  async saveDebugAudio(audioBuffer, prefix) {
    this.ensureDebugDirectoryExists();
    const filename = `${prefix}_${Date.now()}.wav`;
    const filePath = path.join(this.DEBUG_AUDIO_DIR, filename);
    fs.writeFileSync(filePath, Buffer.from(audioBuffer));
    elizaLogger2.log(`Debug audio saved: ${filePath}`);
  }
  async transcribeAttachment(audioBuffer) {
    return await this.transcribe(audioBuffer);
  }
  /**
   * If the audio buffer is too short, return null. Otherwise push to queue.
   */
  async transcribe(audioBuffer) {
    if (audioBuffer.byteLength < 0.2 * 16e3) {
      return null;
    }
    return new Promise((resolve) => {
      this.queue.push({ audioBuffer, resolve });
      if (!this.processing) {
        this.processQueue();
      }
    });
  }
  async transcribeAttachmentLocally(audioBuffer) {
    return this.transcribeLocally(audioBuffer);
  }
  /**
   * CHANGED: processQueue() uses the final transcriptionProvider enum set in initialize().
   */
  async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    while (this.queue.length > 0) {
      const { audioBuffer, resolve } = this.queue.shift();
      let result = null;
      switch (this.transcriptionProvider) {
        case TranscriptionProvider.Deepgram:
          result = await this.transcribeWithDeepgram(audioBuffer);
          break;
        case TranscriptionProvider.OpenAI:
          result = await this.transcribeWithOpenAI(audioBuffer);
          break;
        default:
          result = await this.transcribeLocally(audioBuffer);
      }
      resolve(result);
    }
    this.processing = false;
  }
  /**
   * Original logic from main is now handled by the final fallback in initialize().
   * We'll keep transcribeUsingDefaultLogic() if needed by other code references,
   * but it's no longer invoked in the new flow.
   */
  async transcribeUsingDefaultLogic(audioBuffer) {
    if (this.deepgram) {
      return await this.transcribeWithDeepgram(audioBuffer);
    } else if (this.openai) {
      return await this.transcribeWithOpenAI(audioBuffer);
    }
    return await this.transcribeLocally(audioBuffer);
  }
  async transcribeWithDeepgram(audioBuffer) {
    const buffer = Buffer.from(audioBuffer);
    const response = await this.deepgram.listen.prerecorded.transcribeFile(
      buffer,
      {
        model: "nova-2",
        language: "en-US",
        smart_format: true
      }
    );
    const result = response.result.results.channels[0].alternatives[0].transcript;
    return result;
  }
  async transcribeWithOpenAI(audioBuffer) {
    elizaLogger2.log("Transcribing audio with OpenAI...");
    try {
      await this.saveDebugAudio(audioBuffer, "openai_input_original");
      const arrayBuffer = new Uint8Array(audioBuffer).buffer;
      const convertedBuffer = Buffer.from(await this.convertAudio(arrayBuffer)).buffer;
      await this.saveDebugAudio(
        convertedBuffer,
        "openai_input_converted"
      );
      const file = new File([convertedBuffer], "audio.wav", {
        type: "audio/wav"
      });
      const result = await this.openai.audio.transcriptions.create({
        model: "whisper-1",
        language: "en",
        response_format: "text",
        file
      });
      const trimmedResult = result.trim();
      elizaLogger2.log(`OpenAI speech to text result: "${trimmedResult}"`);
      return trimmedResult;
    } catch (error) {
      elizaLogger2.error(
        "Error in OpenAI speech-to-text conversion:",
        error
      );
      if (error.response) {
        elizaLogger2.error("Response data:", error.response.data);
        elizaLogger2.error("Response status:", error.response.status);
        elizaLogger2.error("Response headers:", error.response.headers);
      } else if (error.request) {
        elizaLogger2.error("No response received:", error.request);
      } else {
        elizaLogger2.error("Error setting up request:", error.message);
      }
      return null;
    }
  }
  /**
   * Local transcription with nodejs-whisper. We keep it as it was,
   * just making sure to handle CUDA if available.
   */
  async transcribeLocally(audioBuffer) {
    try {
      elizaLogger2.log("Transcribing audio locally...");
      await this.saveDebugAudio(audioBuffer, "local_input_original");
      const arrayBuffer = new Uint8Array(audioBuffer).buffer;
      const convertedBuffer = Buffer.from(await this.convertAudio(arrayBuffer)).buffer;
      await this.saveDebugAudio(convertedBuffer, "local_input_converted");
      const tempWavFile = path.join(
        this.CONTENT_CACHE_DIR,
        `temp_${Date.now()}.wav`
      );
      const uint8Array = new Uint8Array(convertedBuffer);
      fs.writeFileSync(tempWavFile, uint8Array);
      elizaLogger2.debug(`Temporary WAV file created: ${tempWavFile}`);
      let output = await nodewhisper(tempWavFile, {
        modelName: "base.en",
        autoDownloadModelName: "base.en",
        removeWavFileAfterTranscription: false,
        withCuda: this.isCudaAvailable,
        whisperOptions: {
          outputInText: true,
          outputInVtt: false,
          outputInSrt: false,
          outputInCsv: false,
          translateToEnglish: false,
          wordTimestamps: false,
          timestamps_length: 60
          // splitOnWord: true,
        }
      });
      output = output.split("\n").map((line) => {
        if (line.trim().startsWith("[")) {
          const endIndex = line.indexOf("]");
          return line.substring(endIndex + 1);
        }
        return line;
      }).join("\n");
      fs.unlinkSync(tempWavFile);
      if (!output || output.length < 5) {
        elizaLogger2.log("Output is null or too short, returning null");
        return null;
      }
      return output;
    } catch (error) {
      elizaLogger2.error(
        "Error in local speech-to-text conversion:",
        error
      );
      return null;
    }
  }
};

// src/actions/describe-image.ts
import {
  composeContext,
  generateObject,
  ModelClass,
  elizaLogger as elizaLogger3,
  ServiceType as ServiceType3
} from "@elizaos/core";

// src/templates.ts
var getFileLocationTemplate = `
{{recentMessages}}

extract the file location from the users message or the attachment in the message history that they are referring to.
your job is to infer the correct attachment based on the recent messages, the users most recent message, and the attachments in the message
image attachments are the result of the users uploads, or images you have created.
only respond with the file location, no other text.
typically the file location is in the form of a URL or a file path.

\`\`\`json
{
    "fileLocation": "file location text goes here"
}
\`\`\`
`;

// src/types.ts
import { z as z2 } from "zod";
var FileLocationResultSchema = z2.object({
  fileLocation: z2.string().min(1)
});
function isFileLocationResult(obj) {
  return FileLocationResultSchema.safeParse(obj).success;
}

// src/actions/describe-image.ts
var describeImage = {
  name: "DESCRIBE_IMAGE",
  similes: ["DESCRIBE_PICTURE", "EXPLAIN_PICTURE", "EXPLAIN_IMAGE"],
  validate: async (_runtime, _message) => {
    return true;
  },
  description: "Describe an image",
  handler: async (runtime, message, state, _options, callback) => {
    const getFileLocationContext = composeContext({
      state,
      template: getFileLocationTemplate
    });
    const fileLocationResultObject = await generateObject({
      runtime,
      context: getFileLocationContext,
      modelClass: ModelClass.SMALL,
      schema: FileLocationResultSchema,
      stop: ["\n"]
    });
    if (!isFileLocationResult(fileLocationResultObject == null ? void 0 : fileLocationResultObject.object)) {
      elizaLogger3.error("Failed to generate file location");
      return false;
    }
    const { fileLocation } = fileLocationResultObject.object;
    const { description } = await runtime.getService(ServiceType3.IMAGE_DESCRIPTION).describeImage(fileLocation);
    runtime.messageManager.createMemory({
      userId: message.agentId,
      agentId: message.agentId,
      roomId: message.roomId,
      content: {
        text: description
      }
    });
    callback({
      text: description
    });
    return true;
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Can you describe this image for me?"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "Let me analyze this image for you...",
          action: "DESCRIBE_IMAGE"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "I see an orange tabby cat sitting on a windowsill. The cat appears to be relaxed and looking out the window at birds flying by. The lighting suggests it's a sunny afternoon."
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "What's in this picture?"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "I'll take a look at that image...",
          action: "DESCRIBE_IMAGE"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "The image shows a modern kitchen with stainless steel appliances. There's a large island counter in the center with marble countertops. The cabinets are white with sleek handles, and there's pendant lighting hanging above the island."
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Could you tell me what this image depicts?"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "I'll describe this image for you...",
          action: "DESCRIBE_IMAGE"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "This is a scenic mountain landscape at sunset. The peaks are snow-capped and reflected in a calm lake below. The sky is painted in vibrant oranges and purples, with a few wispy clouds catching the last rays of sunlight."
        }
      }
    ]
  ]
};

// src/index.ts
var speechTTS = {
  name: "default",
  description: "Default plugin, with basic actions and evaluators",
  services: [
    new SpeechService(),
    new TranscriptionService()
  ],
  actions: [describeImage]
};
var index_default = speechTTS;
export {
  SpeechService,
  TranscriptionService,
  index_default as default,
  speechTTS
};
//# sourceMappingURL=index.js.map