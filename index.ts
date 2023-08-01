/**
 * Pumper - Web Audio API analysis & monitoring library
 * @author njmcode
 *
 * This lib wraps the Web Audio API.  It is designed to make realtime analysis of
 * a web audio stream (media or microphone) easier. Created it for this project so
 * we can easily react to volume levels and frequency spikes for reactive Canvas/GL
 * visualizations.
 *
 * Instantiated via new.
 *
 * API:
 * - pumper = new Pumper(start, end, precision)
 *    - creates a new Pumper instance
 *    - optionally pass in any of the following properties:
 *    - start: number - global frequency range start
 *    - end: number - global frequency range end
 *    - precision: number - number of frequency range lookups
 *
 * - pumper.load(source)
 *    - source can be a media URL or 'mic'
 *    - returns a Promise that resolves when the stream is ready
 *    - if source is 'mic', will request mic permissions
 *    - if source is a URL, will attempt to fetch the media
 *
 * - pumper.createBand(start, end, threshold, spikeTolerance, volScale = 1)
 *    - creates a new frequency range monitor and returns the instance
 *    - 'start' and 'end' define the band frequency ranges
 *    - threshold: arbitrary threshold value for event triggering
 *    - spikeTolerance: volume increase threshold for event triggering
 *
 * - pumper.createBands(start, end, count, volStart, volEnd, bleed)
 *    - creates a series of frequency range monitors and returns the array
 *
 * - pumper.update()
 *    - updates all exposed properties with latest data
 *
 * Exposed properties:
 * - Pumper.bands - array of all Band instances in the order they were created
 * - Pumper.volume - current global average volume level. Set via Pumper.update()
 * - Pumper.spikeTolerance - distance over which a volume change is considered a spike
 * - Pumper.threshold - arbitrary threshold value for global volume level
 * - Pumper.isSpiking - true if there was a volume spike since the last time update() was called
 * - Pumper.isOverThreshold - true if the current global volume exceeds the set global threshold
 * - Pumper.freqData - raw frequency data array
 * - Pumper.timeData - raw time domain data array
 **/

import 'webrtc-adapter';

type Defaults = {
    threshold: number;
    spikeTolerance: number;
}

const DEFAULTS: Defaults = Object.freeze({
    threshold: 127,
    spikeTolerance: 30,
});

function getURLParam(name: string, url = window.location.href) {
    const urlObj = new URL(url);
    return urlObj.searchParams.get(name);
}

/**
 * Get a media stream with low latency.
 * @param targetLatency - target latency in seconds
 * @param maxLatency - max latency in seconds
 * @param increment - latency increment in reattempt
 * @param fallback - if true, will return a regular stream if low latency stream fails
 * @returns {Promise<MediaStream>}
 **/
async function getLowLatencyMedia(
    targetLatency: number = 0.003,
    maxLatency: number = 0.04,
    increment: number = 0.01,
    fallback: boolean = true
): Promise<MediaStream> {
    let latency = targetLatency;
    let stream: MediaStream | null = null;

    while (!stream && latency <= maxLatency) {
        const latencyConstraints: ConstrainDouble = {
            max: maxLatency,
            min: targetLatency,
            exact: latency,
            ideal: targetLatency,
        };
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    latency: latencyConstraints,
                },
            });
        } catch (err: unknown) {
            if (err instanceof OverconstrainedError) {
                if (err.constraint === 'latency') {
                    console.warn(`Failed to get media stream with latency ${latency}`);
                    latency += increment;
                } else {
                    console.warn('contraints', err.constraint);
                    throw err;
                }
            } else {
                throw err;
            }
        }
    }

    if (!stream) {
        if (!fallback) throw new Error('Failed to get media stream with low latency');
        console.warn('Failed to get media stream with low latency');
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                },
            });
        } catch (err) {
            throw new Error('Failed to get media stream at all' + err);
        }
    }

    return stream;
}

/**
 * Update volume and spike status for a Band or Pumper instance.
 * @param self - Band or Pumper instance
 * @param freqData - raw frequency data array
 * @param maxFreq - max frequency in the frequency data array
 * @private
 * @returns
 **/
function updateFromData(self: Pumper | Band, freqData: Uint8Array, maxFreq: number) {
    const rangeStart = Math.round((self.startFreq / maxFreq) * (freqData.length - 1));
    const rangeEnd = Math.round((self.endFreq / maxFreq) * (freqData.length - 1));
    const total = freqData.slice(rangeStart, rangeEnd + 1).reduce((a, b) => a + b, 0);
    const volume = (total / (rangeEnd - rangeStart)) * self.volScale;
    const spike = volume - self.volume;

    self.volume = volume;
    if (spike > self.spikeTolerance) {
        self.isSpiking = true;
        self._onSpike(spike);
    } else {
        self.isSpiking = false;
    }
    if (volume > self.threshold) {
        self.isOverThreshold = true;
        self._onThreshold();
    } else {
        self.isOverThreshold = false;
    }
}

/**
 * 'Band' (frequency range) class.
 **/
class Band {
    startFreq: number;
    endFreq: number;
    threshold: number;
    spikeTolerance: number;
    volScale: number;
    volume: number;
    isOverThreshold: boolean;
    isSpiking: boolean;

    /**
     * @param startFreq - frequency range start
     * @param endFreq - frequency range end
     * @param threshold - arbitrary threshold value for volume level
     * @param spikeTolerance - distance over which a volume change is considered a spike
     * @param volScale - optionally multiplies returned volume values
     * @constructor
     **/
    constructor(
        startFreq = 20,
        endFreq = 20000,
        threshold = DEFAULTS.threshold,
        spikeTolerance = DEFAULTS.spikeTolerance,
        volScale = 1
    ) {
        this.startFreq = startFreq;
        this.endFreq = endFreq;
        this.threshold = threshold;
        this.spikeTolerance = spikeTolerance;
        this.volScale = volScale;
        this.volume = 0;
        this.isOverThreshold = false;
        this.isSpiking = false;
    }

    _onSpike(spikeAmount: number) {
        // TODO: fire event
    }

    _onThreshold() {
        const over = this.volume - this.threshold;
        // TODO: fire event
    }
}

class Pumper {
    volume: number;
    isSpiking: boolean;
    isOverThreshold: boolean;
    threshold: number;
    spikeTolerance: number;
    volScale: number;

    timeData: Uint8Array;
    freqData: Uint8Array;

    bands: Band[] = [];

    AUDIO!: AudioContext;
    source!: MediaStreamAudioSourceNode | MediaElementAudioSourceNode;
    analyzer!: AnalyserNode;
    startFreq!: number;
    endFreq!: number;

    /**
     * @param startFreq - global frequency range start
     * @param endFreq - global frequency range end
     * @param precision - number of lookups the analyzer will have
     * @constructor
     * @throws {Error} if AudioContext is not supported
     **/
    constructor(start = 880, end = 7720, precision = 12) {
        this.startFreq = start;
        this.endFreq = end;
        this.volume = 0.0;
        this.isSpiking = false;
        this.isOverThreshold = false;
        this.threshold = DEFAULTS.threshold;
        this.spikeTolerance = DEFAULTS.spikeTolerance;
        this.volScale = 1;

        // Init Web Audio API context
        this.AUDIO = new window.AudioContext();
        if (!this.AUDIO) Pumper._err('Failed to create AudioContext');

        // Set up analyzer
        this.analyzer = this.AUDIO.createAnalyser();
        this.analyzer.fftSize = Math.pow(2, precision);
        this.analyzer.minDecibels = -90;
        this.analyzer.maxDecibels = -10;

        // Set up buffers
        this.timeData = new Uint8Array(this.analyzer.frequencyBinCount);
        this.freqData = new Uint8Array(this.analyzer.frequencyBinCount);
    }

    get maxFreq() {
        return this.AUDIO.sampleRate / 2;
    }

    static _err(msg: string) {
        throw new Error(`Pumper error: ${msg}`);
    }

    static _warn(msg: string) {
        console.warn(`Pumper: ${msg}`);
    }

    _onSpike(spikeAmount: number) {
        // TODO: fire event
    }

    _onThreshold() {
        const over = this.volume - this.threshold;
        // TODO: fire event
    }

    /**
     * Load a source.
     * @param srcValue - media URL or 'mic'
     **/
    async load(srcValue: string) {
        if (!srcValue) {
            const ipt = getURLParam('input');
            if (ipt) {
                srcValue = ipt;
            } else {
                Pumper._err('Missing "input" param');
            }
        }

        if (srcValue === 'mic') {
            try {
                // Request mic access, create source node and connect to analyzer
                console.log('Pumper: requesting mic stream');
                const stream = await getLowLatencyMedia();
                const audioTracks = stream.getAudioTracks();
                console.log('Using audio device: ' + audioTracks[0].label);
                // TODO: throw 'ready' event
                this.source = this.AUDIO.createMediaStreamSource(stream);
                this.source.connect(this.analyzer); // Don't connect mic to output
                console.log('Pumper: mic stream ready', this.source);
            } catch (error) {
                Pumper._err(`Error opening microphone stream ${error}`);
            }
        } else {
            // Load track, create source node and connect to analyzer
            const track = document.createElement('audio');
            track.setAttribute('src', srcValue);
            track.crossOrigin = 'anonymous';
            this.source = this.AUDIO.createMediaElementSource(track);
            this.source.connect(this.analyzer);
            // Because element, connect to output
            this.analyzer.connect(this.AUDIO.destination);

            // TODO: throw 'ready' event
            return new Promise<void>(resolve => {
                track.addEventListener(
                    'loadeddata',
                    () => {
                        console.log('Pumper: track ready', this.source);
                        resolve();
                    },
                    false,
                );
            });
        }
    }

    /**
     * Play the source node if it's a media element.
     * @return - true if successful
     **/
    play() {
        if (this.source instanceof MediaElementAudioSourceNode) {
            return this.source.mediaElement.play();
        } else {
            Pumper._warn('Source is not a media element');
            return false;
        }
    }

    /**
     * Resumes the audio context.
     **/
    resume() {
        this.AUDIO.resume();
    }

    /**
     * Create a new freq watcher (band)
     * @param start - start frequency
     * @param end - end frequency
     * @param threshold - volume threshold
     * @param spikeTolerance - spike tolerance
     * @param volScale - volume scale
     * @return - the new band
     **/
    createBand(
        start: number = 20,
        end: number = 20000,
        threshold: number = DEFAULTS.threshold,
        spikeTolerance: number = DEFAULTS.spikeTolerance,
        volScale: number = 1,
    ) {
        // Range check start and end
        if (start < 0 || start > this.maxFreq) Pumper._err(`Invalid start frequency: ${start}`);
        if (end < 0 || end > this.maxFreq) Pumper._err(`Invalid end frequency: ${end}`);
        if (start > end) Pumper._err(`Start frequency must be less than end frequency: ${start} > ${end}`);

        const band = new Band(start, end, threshold, spikeTolerance, volScale);
        this.bands.push(band);
        return band;
    }

    /**
     * Create a range of bands over the global scale
     * @param start - start frequency
     * @param end - end frequency
     * @param count - number of bands to create
     * @param volStart - start volume
     * @param volEnd - end volume
     * @param bleed - bleed factor
     * @return - the new bands
     **/
    createBands(
        start: number = 20,
        end: number = 20000,
        count: number = 1,
        volStart: number = 1,
        volEnd: number = 1,
        bleed: number = 0.5
    ) {
        // Range check start and end
        if (start < 0 || start > this.maxFreq) Pumper._err(`Invalid start frequency: ${start}`);
        if (end < 0 || end > this.maxFreq) Pumper._err(`Invalid end frequency: ${end}`);
        if (start > end) Pumper._err(`Start frequency must be less than end frequency: ${start} > ${end}`);

        const freqRange = end - start;
        const volRange = volEnd - volStart;
        const bleedVal = (freqRange / count) * bleed;

        const bands = [];
        for (let i = 0; i < count; i++) {
            const band = this.createBand(
                start + (freqRange * i) / count - bleedVal, // start
                start + (freqRange * (i + 1)) / count + bleedVal, // end
                this.threshold,
                this.spikeTolerance,
                volStart + (volRange * i) / count, // volScale
            );
            bands.push(band);
        }
        return bands;
    }

    /**
     * Perform analysis on the current audio, and update any registered bands.
     * @return - true if successful
     * @throws {Error} - if source is not ready, a media element, or stream
     **/
    update() {
        // Throw error is source is not ready
        if (this.source instanceof MediaElementAudioSourceNode || this.source instanceof MediaStreamAudioSourceNode) {

            this.analyzer.getByteFrequencyData(this.freqData);
            this.analyzer.getByteTimeDomainData(this.timeData);

            // Calc global volume
            // TODO: fire global events
            updateFromData(this, this.freqData, this.maxFreq);

            // Calc band volume levels
            this.bands.forEach(band => {
                updateFromData(band, this.freqData, this.maxFreq);
            });

            return true;
        } else {
            throw new Error('Source is not ready, a media element, or stream' + this.source);
        }
    }
}

export { Pumper }
