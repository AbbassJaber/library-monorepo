const SOURCE_RATE = 24000;
const CAPACITY = SOURCE_RATE * 60;

class PcmPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(CAPACITY);
    this.read = 0;
    this.write = 0;
    this.available = 0;
    this.step = SOURCE_RATE / sampleRate;
    this.position = 0;
    this.port.onmessage = event => {
      if (event.data && event.data.type === 'flush') {
        this.read = this.write;
        this.available = 0;
        this.position = 0;
        return;
      }
      const samples = new Int16Array(event.data);
      for (let i = 0; i < samples.length; i++) {
        if (this.available === CAPACITY) break;
        this.buffer[this.write] = samples[i] / 32768;
        this.write = (this.write + 1) % CAPACITY;
        this.available++;
      }
    };
  }

  process(_inputs, outputs) {
    const out = outputs[0][0];
    for (let i = 0; i < out.length; i++) {
      if (this.available < 2) {
        out[i] = 0;
        continue;
      }
      const a = this.buffer[this.read];
      const b = this.buffer[(this.read + 1) % CAPACITY];
      out[i] = a + (b - a) * this.position;
      this.position += this.step;
      while (this.position >= 1 && this.available > 1) {
        this.position -= 1;
        this.read = (this.read + 1) % CAPACITY;
        this.available--;
      }
    }
    return true;
  }
}

registerProcessor('pcm-player', PcmPlayer);
