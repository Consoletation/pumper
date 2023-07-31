/**
 * Pumper - Web Audio API analysis & monitoring library
 * @author njmcode
 *
 * This lib wraps the Web Audio API.  It is designed to make realtime analysis of
 * a web audio stream (media or microphone) easier. Created it for this project so
 * we can easily react to volume levels and frequency spikes for reactive Canvas/GL
 * visualizations.
 *
 * Instantiated as a singleton - pass it around the app via require().
 *
 * API:
 * - Pumper.start(source, start = 1920, end = 16800, precision = 12)
 *      - source can be a media URL or 'mic'
 *      - 'start' and 'end' define the global frequency ranges
 *      - precision will decide how many lookups the analyzer will have
 *
 * - Pumper.update()
 *      - updates all exposed properties with latest data
 *
 * - Pumper.createBand(start, end, threshold, spikeTolerance, volScale = 1)
 *      - creates a new frequency range monitor and returns the instance
 *      - 'start' and 'end' define the band frequency ranges
 *      - frequency range is scaled to global values
 *      - 'volScale' optionally multiplies returned volume values
 *
 * Exposed properties:
 * - Pumper.bands - array of all Band instances in the order they were created
 * - Pumper.volume - current global average volume level. Set via Pumper.update()
 * - Pumper.globalSpikeTolerance - distance over which a volume change is considered a spike
 * - Pumper.globalThreshold - arbitrary threshold value for global volume level
 * - Pumper.isSpiking - true if there was a volume spike since the last time update() was called
 * - Pumper.isOverThreshold - true if the current global volume exceeds the set global threshold
 * - Pumper.freqData - raw frequency data array
 * - Pumper.timeData - raw time domain data array
 **/

import 'webrtc-adapter';

const DEFAULTS = Object.freeze({
    threshold: 127,
    spikeTolerance: 30,
});

function getURLParam(name, url = window.location.href) {
    const urlObj = new URL(url);
    return urlObj.searchParams.get(name);
}

/**
 * 'Band' (frequency range) class.
 **/
class Band {
    /**
     * @param start - frequency range start
     * @param end - frequency range end
     * @param threshold - arbitrary threshold value for volume level
     * @param spikeTolerance - distance over which a volume change is considered a spike
     * @param volScale - optionally multiplies returned volume values
     **/
    constructor(
        start = 20,
        end = 20000,
        threshold = DEFAULTS.threshold,
        spikeTolerance = DEFAULTS.spikeTolerance,
        volScale = 1,
    ) {
        this.startFreq = start;
        this.endFreq = end;
        this.volScale = volScale;

        this.volume = 0;

        this.isOverThreshold = false;
        this.isSpiking = false;
    }

    _onSpike(spikeAmount) {
        // TODO: fire event
    }

    _onThreshold() {
        var over = this.volume - this.threshold;
        // TODO: fire event
    }
}

class Pumper {
    constructor() {
        this.volume = 0.0;
        this.isSpiking = false;
        this.isOverThreshold = false;
        this.globalThreshold = DEFAULTS.threshold;
        this.globalSpikeTolerance = DEFAULTS.spikeTolerance;
        this.sensitivity = 1;

        this.timeData = null;
        this.timeDataLength = 0;
        this.freqData = null;
        this.freqDataLength = 0;

        this.bands = [];
    }

    static _err(msg) {
        throw new Error(`Pumper error: ${msg}`);
    }

    static _warn(msg) {
        console.warn(`Pumper: ${msg}`);
    }

    /**
     * Start the engine.
     * @param srcValue - media URL or 'mic'
     * @param startFreq - global frequency range start
     * @param endFreq - global frequency range end
     * @param precision - number of lookups the analyzer will have
     * @returns {Promise<void>}
     **/
    async start(srcValue, start = 880, end = 7720, precision = 12) {
        if (!srcValue) Pumper._err('Missing "source" param');

        const ipt = getURLParam('input');
        console.log('URL PARAM', ipt);
        if (ipt === 'mic') this.FORCE_MIC = true;

        // Init Web Audio API context
        this.AUDIO = new (window.AudioContext || window.webkitAudioContext)();
        if (!this.AUDIO) Pumper._err('Web Audio API not supported :(');

        // Set up analyzer and buffers
        this.analyzer = this.AUDIO.createAnalyser();
        this.maxFreq = this.AUDIO.sampleRate / 2;
        this.analyzer.fftSize = Math.pow(2, precision);
        this.analyzer.minDecibels = -90;
        this.analyzer.maxDecibels = -10;
        console.debug(`analyser: ${this.analyzer}`);

        this.startFreq = start;
        this.endFreq = end;

        this.freqDataLength = this.analyzer.frequencyBinCount;
        this.timeDataLength = this.analyzer.frequencyBinCount;

        this.freqData = new Uint8Array(this.freqDataLength);
        this.timeData = new Uint8Array(this.timeDataLength);

        if (this.FORCE_MIC || srcValue === 'mic') {
            try {
                // Request mic access, create source node and connect to analyzer
                console.log('Pumper: requesting mic stream');
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: false,
                        noiseSuppression: false,
                        autoGainControl: false,
                        latency: {
                            exact: 0.003,
                            ideal: 0.003,
                        },
                    },
                    video: false,
                });
                window.stream = stream; // make stream available to console
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
            this.analyzer.connect(this.AUDIO.destination);

            return new Promise(resolve => {
                track.addEventListener(
                    'loadeddata',
                    () => {
                        // TODO: throw 'ready' event
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
     * @return {boolean} - true if successful
     **/
    play() {
        if (this.source instanceof MediaElementAudioSourceNode || this.source instanceof MediaStreamAudioSourceNode) {
            this.source.mediaElement.play();
            return true;
        } else {
            Pumper._warn('Source is not ready or is not a media element');
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
     * @return {Band} - the new band
     **/
    createBand(
        start = 20,
        end = 20000,
        threshold = DEFAULTS.threshold,
        spikeTolerance = DEFAULTS.spikeTolerance,
        volScale = 1,
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
     * @return {Band[]} - the new bands
     **/
    createBands(start = 20, end = 20000, count = 1, volStart = 1, volEnd = 1, bleed = 0.5) {
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
                this.globalThreshold,
                this.globalSpikeTolerance,
                volStart + (volRange * i) / count, // volScale
            );
            bands.push(band);
        }
        return bands;
    }

    /**
     * Perform analysis on the current audio, and update any registered bands.
     * @return {boolean} - true if successful
     * @throws {Error} - if source is not ready, a media element, or stream
     **/
    update() {
        if (this.source instanceof MediaElementAudioSourceNode || this.source instanceof MediaStreamAudioSourceNode) {
            // Update maxFreq in case it's changed
            this.maxFreq = this.AUDIO.sampleRate / 2;

            this.analyzer.getByteFrequencyData(this.freqData);
            this.analyzer.getByteTimeDomainData(this.timeData);

            // Calc global volume
            const rangeStart = Math.round((this.startFreq / this.maxFreq) * (this.freqDataLength - 1));
            const rangeEnd = Math.round((this.endFreq / this.maxFreq) * (this.freqDataLength - 1));

            let globTotal = 0;
            for (let i = rangeStart; i <= rangeEnd; i++) {
                globTotal += this.freqData[i];
            }

            // TODO: add sensitivity control
            // TODO: fire global events

            const globalVolume = globTotal / (rangeEnd - rangeStart);
            if (globalVolume - this.volume > this.globalSpikeTolerance) {
                this.isSpiking = true;
            } else {
                this.isSpiking = false;
            }
            this.volume = globalVolume;
            if (this.volume > this.globalThreshold) {
                this.isOverThreshold = true;
            } else {
                this.isOverThreshold = false;
            }

            // Calc band volume levels
            // TODO: optimize this
            this.bands.forEach(band => {
                const bRangeStart = Math.round((band.startFreq / this.maxFreq) * (this.freqDataLength - 1));
                const bRangeEnd = Math.round((band.endFreq / this.maxFreq) * (this.freqDataLength - 1));

                let bandTotal = 0;
                for (let i = bRangeStart; i <= bRangeEnd; i++) {
                    bandTotal += this.freqData[i];
                }

                const bandVolume = (bandTotal / (bRangeEnd - bRangeStart)) * band.volScale;
                if (bandVolume - band.volume > band.spikeTolerance) {
                    band.isSpiking = true;
                    band._onSpike(bandVolume - band.volume);
                } else {
                    band.isSpiking = false;
                }
                band.volume = bandVolume;
                if (band.volume > band.threshold) {
                    band.isOverThreshold = true;
                    band._onOverThreshold();
                } else {
                    band.isOverThreshold = false;
                }
            });

            return true;
        } else {
            throw new Error('Source is not ready, a media element, or stream', this.source);
        }
    }
}

export { Pumper }
