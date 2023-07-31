declare module 'pumper' {
  type Defaults = {
    threshold: number;
    spikeTolerance: number;
  };

  const DEFAULTS: Defaults;

  function getLowLatencyMedia(
    targetLatency?: number,
    maxLatency?: number,
    increment?: number,
    fallback?: boolean
  ): Promise<MediaStream>;

  class Band {
    startFreq: number;
    endFreq: number;
    threshold: number;
    spikeTolerance: number;
    volScale: number;
    volume: number;
    isOverThreshold: boolean;
    isSpiking: boolean;

    constructor(
      startFreq?: number,
      endFreq?: number,
      threshold?: number,
      spikeTolerance?: number,
      volScale?: number
    );

    _onSpike(spikeAmount: number): void;
    _onThreshold(): void;
  }

  class Pumper {
    volume: number;
    isSpiking: boolean;
    isOverThreshold: boolean;
    globalThreshold: number;
    globalSpikeTolerance: number;
    sensitivity: number;

    timeData: Uint8Array;
    timeDataLength: number;
    freqData: Uint8Array;
    freqDataLength: number;

    bands: Band[];

    constructor(start?: number, end?: number, precision?: number);

    start(srcValue: string): Promise<void>;
    play(): Promise<void | boolean>;
    resume(): void;
    createBand(
      start?: number,
      end?: number,
      threshold?: number,
      spikeTolerance?: number,
      volScale?: number
    ): Band;
    createBands(
      start?: number,
      end?: number,
      count?: number,
      volStart?: number,
      volEnd?: number,
      bleed?: number
    ): Band[];
    update(): boolean;
  }

  export { Pumper, DEFAULTS };
}
