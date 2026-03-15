/**
 * MapRecorder — captures the WebGL map canvas into a WebM/MP4 video using
 * MediaRecorder + captureStream(). Requires `preserveDrawingBuffer: true`
 * on the MapLibre map instance.
 */

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "video/webm";
  if (MediaRecorder.isTypeSupported("video/mp4;codecs=avc1.42E01E")) {
    return "video/mp4;codecs=avc1.42E01E";
  }
  if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
    return "video/webm;codecs=vp9";
  }
  return "video/webm";
}

export class MapRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private offscreen: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private stream: MediaStream;
  private mimeType: string;

  constructor(
    private sourceCanvas: HTMLCanvasElement,
    fps = 30,
  ) {
    this.offscreen = document.createElement("canvas");
    this.offscreen.width = sourceCanvas.width;
    this.offscreen.height = sourceCanvas.height;
    this.ctx = this.offscreen.getContext("2d")!;
    this.stream = this.offscreen.captureStream(fps);
    this.mimeType = pickMimeType();
  }

  start(): void {
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream, {
      mimeType: this.mimeType,
      videoBitsPerSecond: 4_000_000,
    });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(100); // 100ms timeslice
  }

  drawFrame(timestamp?: string): void {
    const { width, height } = this.offscreen;
    this.ctx.drawImage(this.sourceCanvas, 0, 0, width, height);

    if (timestamp) {
      this.ctx.save();
      this.ctx.font = "bold 14px Inter, monospace";
      this.ctx.fillStyle = "rgba(0,0,0,0.6)";
      const metrics = this.ctx.measureText(timestamp);
      this.ctx.fillRect(width - metrics.width - 20, height - 32, metrics.width + 16, 24);
      this.ctx.fillStyle = "#fff";
      this.ctx.fillText(timestamp, width - metrics.width - 12, height - 14);
      this.ctx.restore();
    }
  }

  async stop(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!this.recorder) {
        resolve(new Blob(this.chunks, { type: this.mimeType }));
        return;
      }
      this.recorder.onstop = () => {
        resolve(new Blob(this.chunks, { type: this.mimeType }));
      };
      this.recorder.stop();
    });
  }

  get extension(): string {
    return this.mimeType.startsWith("video/mp4") ? "mp4" : "webm";
  }
}
