import { useRef, useState, useCallback } from 'react';

export interface AudioRecorderState {
  isRecording: boolean;
  error: string | null;
}

export interface AudioRecorderOptions {
  sampleRate?: number;
  onAudioChunk: (pcmBuffer: ArrayBuffer) => void;
  onError?: (error: Error) => void;
}

/**
 * useAudioRecorder
 * 使用 AudioWorklet（現代方式）擷取麥克風音訊並轉換為 16kHz PCM Int16
 */
export function useAudioRecorder(options: AudioRecorderOptions) {
  const { sampleRate = 16000, onAudioChunk, onError } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);

  // Float32Array → Int16 PCM 轉換
  const convertFloat32ToInt16 = useCallback((float32: Float32Array): ArrayBuffer => {
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768));
    }
    return int16.buffer;
  }, []);

  // AudioWorklet Processor 內嵌程式碼（避免額外檔案相依）
  const workletCode = `
    class PCMProcessor extends AudioWorkletProcessor {
      constructor() {
        super();
        this._bufferSize = 4096;
        this._buffer = new Float32Array(this._bufferSize);
        this._pos = 0;
      }
      process(inputs) {
        const input = inputs[0];
        if (!input || !input[0]) return true;
        const channel = input[0];
        for (let i = 0; i < channel.length; i++) {
          this._buffer[this._pos++] = channel[i];
          if (this._pos >= this._bufferSize) {
            this.port.postMessage({ samples: this._buffer.slice(0, this._pos) });
            this._pos = 0;
          }
        }
        return true;
      }
    }
    registerProcessor('pcm-processor', PCMProcessor);
  `;

  const start = useCallback(async () => {
    try {
      setError(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate,
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate });
      audioContextRef.current = audioContext;

      // 使用 Blob URL 載入 AudioWorklet（避免廢棄的 ScriptProcessor）
      const blob = new Blob([workletCode], { type: 'application/javascript' });
      const workletUrl = URL.createObjectURL(blob);
      await audioContext.audioWorklet.addModule(workletUrl);
      URL.revokeObjectURL(workletUrl);

      const source = audioContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioContext, 'pcm-processor');
      workletNodeRef.current = workletNode;

      workletNode.port.onmessage = (event: MessageEvent) => {
        const pcm = convertFloat32ToInt16(event.data.samples);
        onAudioChunk(pcm);
      };

      source.connect(workletNode);
      workletNode.connect(audioContext.destination);

      setIsRecording(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '無法存取麥克風';
      setError(msg);
      onError?.(err instanceof Error ? err : new Error(msg));
    }
  }, [sampleRate, onAudioChunk, onError, convertFloat32ToInt16, workletCode]);

  const stop = useCallback(async () => {
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    await audioContextRef.current?.close();
    audioContextRef.current = null;

    setIsRecording(false);
  }, []);

  return { isRecording, error, start, stop };
}
