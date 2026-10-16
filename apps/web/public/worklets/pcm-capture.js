const TARGET_RATE = 16000;
const FRAME = 512;

class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET_RATE;
    this.position = 0;
    this.frame = new Int16Array(FRAME);
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    while (this.position < channel.length) {
      const start = Math.floor(this.position);
      const end = Math.min(channel.length, Math.floor(this.position + this.ratio));
      let sum = 0;
      for (let i = start; i < Math.max(end, start + 1); i++) sum += channel[i] || 0;
      const value = sum / Math.max(1, end - start);
      this.frame[this.filled++] = Math.max(-32768, Math.min(32767, Math.round(value * 32767)));
      if (this.filled === FRAME) {
        const out = this.frame;
        this.port.postMessage(out.buffer, [out.buffer]);
        this.frame = new Int16Array(FRAME);
        this.filled = 0;
      }
      this.position += this.ratio;
    }
    this.position -= channel.length;
    return true;
  }
}

registerProcessor('pcm-capture', PcmCapture);
