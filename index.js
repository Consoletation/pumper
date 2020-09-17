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
 * - Pumper.start(source, start = 0.04, end = 0.35, fftSize = 2048)
 *      - source can be a media URL or 'mic'
 *      - 'start' and 'end' define the global frequency ranges
 *      - fftSize will decide how many sections the analyzer will have
 *
 * - Pumper.update()
 *      - updates all exposed properties with latest data
 *
 * - Pumper.createBand(start, end, threshold, spikeTolerance, volScale = 1)
 *      - creates a new frequency range monitor and returns the instance
 *      - 'start' and 'end' define the band frequency ranges (0-1)
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

// Force the use of the mic, ignoring any start() params
var FORCE_MIC = false;

var DEFAULTS = {
    threshold: 127,
    spikeTolerance: 30
};

function __err(msg) {
    throw 'Pumper error: ' + msg;
}

function __warn(msg) {
    throw 'Pumper: ' + msg;
}

function getURLParam(name, url) {
    if (!url) url = location.href
    name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
    var regexS = "[\\?&]" + name + "=([^&#]*)";
    var regex = new RegExp(regexS);
    var results = regex.exec(url);
    return results == null ? null : results[1];
}

function rangeCheck(range) {
    if (range >= 0 && range <= 1) {
        return range;
    } else {
        throw 'Pumper error: Range ' + range + ' is out of bounds!'
    }
}

var AUDIO, source, analyzer,
    timeData, freqData,
    timeDataLength, freqDataLength,
    micStream;


/**
 * 'Band' (frequency range) class.
 **/
function Band(
    start = 0, end = 1, threshold = DEFAULTS.threshold,
    spikeTolerance = DEFAULTS.spikeTolerance, volScale = 1
) {
    this.start = rangeCheck(start);
    this.end = rangeCheck(end);
    this.volScale = volScale;

    this.volume = 0;

    this.isOverThreshold = false;
    this.isSpiking = false;

    this._onSpike = function(spikeAmount) {
        // TODO: fire event

    };

    this._onThreshold = function() {
        var over = this.volume - this.threshold;
        // TODO: fire event

    };
}

var Pumper = {};

Pumper.volume = 0;
Pumper.isSpiking = false;
Pumper.isOverThreshold = false;
Pumper.globalThreshold = DEFAULTS.threshold;
Pumper.globalSpikeTolerance = DEFAULTS.spikeTolerance;
Pumper.sensitivity = 1;

Pumper.timeData = null;
Pumper.timeDataLength = 0;
Pumper.freqData = null;
Pumper.freqDataLength = 0;

Pumper.bands = [];

/**
 * Start the engine.
 * @param source - audio URL or 'mic'
 **/
Pumper.start = function(srcValue, start = 0.04, end = 0.35, fftSize = 2048) {
    if (!srcValue) __err('Missing "source" param');
    Pumper.start = rangeCheck(start);
    Pumper.end = rangeCheck(end);
    Pumper.fftSize = fftSize;

    var ipt = getURLParam('input');
    console.log('URL PARAM', ipt);
    if (ipt === 'mic') FORCE_MIC = true;


    // Init Web Audio API context
    AUDIO = new(window.AudioContext || window.webkitAudioContext)();
    if (!AUDIO) __err('Web Audio API not supported :(');

    // Set up analyzer and buffers
    analyzer = AUDIO.createAnalyser();
    analyzer.fftSize = Pumper.fftSize;
    analyzer.minDecibels = -90;
    analyzer.maxDecibels = -10;

    Pumper.freqDataLength = freqDataLength = analyzer.frequencyBinCount;
    Pumper.timeDataLength = timeDataLength = analyzer.frequencyBinCount;

    Pumper.freqData = freqData = new Uint8Array(freqDataLength);
    Pumper.timeData = timeData = new Uint8Array(timeDataLength);

    if (FORCE_MIC || srcValue === 'mic') {
        // Request mic access, create source node and connect to analyzer
        navigator.getMedia = (navigator.getUserMedia || navigator
            .webkitGetUserMedia || navigator.mozGetUserMedia || navigator
            .msGetUserMedia);
        navigator.getMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                },
                video: false
            },
            function(stream) {
                micStream = stream;
                // TODO: throw 'ready' event
                source = AUDIO.createMediaStreamSource(stream);
                source.connect(analyzer); // Don't connect mic to output
                console.log('Pumper: mic stream ready');
            },
            function(error) {
                __err('Error opening microphone stream');
            }
        );
    } else {
        // Load track, create source node and connect to analyzer
        var track = document.createElement('audio');
        track.setAttribute('src', srcValue);
        track.crossOrigin = 'anonymous';
        source = AUDIO.createMediaElementSource(track);
        source.connect(analyzer);
        analyzer.connect(AUDIO.destination);

        track.addEventListener('loadeddata', function() {
            // TODO: throw 'ready' event
            console.log('Pumper: track ready', source);
        }, false);
    }
};

/**
 * Plays the source node if it's a media element.
 **/
Pumper.play = function() {
    if (!source instanceof MediaElementAudioSourceNode) {
        __warn('Source is not ready or is not a media element');
        return false;
    }
    source.mediaElement.play();
};

/**
 * Resumes the audio context.
 **/
Pumper.resume = function() {
    AUDIO.resume();
};

/**
 * Create a new freq watcher (band)
 **/
Pumper.createBand = function(
    start = 0, end = 1, threshold = DEFAULTS.threshold,
    spikeTolerance = DEFAULTS.spikeTolerance, volScale = 1
) {
    // Scale band sizes to global
    var range = Pumper.end - Pumper.start;
    var band = new Band(
        Pumper.start + range * start,
        Pumper.start + range * end,
        threshold, spikeTolerance,
        volScale
    );
    Pumper.bands.push(band);
    return band;
};

/**
 * Create a range of bands over the global scale
 **/
Pumper.createBands = function(count, volStart = 1, volEnd = 1) {
    // Scale volume over created bands
    var volRange = volEnd - volStart;
    for (var band = 0; band < count; band++) {
        Pumper.createBand(
            band / count, // start
            (band + 1) / count, // end
            Pumper.globalThreshold,
            Pumper.globalSpikeTolerance,
            volStart + volRange * band / count // volScale
        );
    }
}

/**
 * Performs analysis on the current audio, updates any registered bands.
 **/
Pumper.update = function() {

    analyzer.getByteFrequencyData(freqData);
    Pumper.freqData = freqData;

    analyzer.getByteTimeDomainData(timeData);
    Pumper.timeData = timeData;

    // Calc global volume
    var rangeStart = Math.floor(Pumper.start * Pumper.fftSize);
    var rangeEnd = Math.floor(Pumper.end * Pumper.fftSize);

    var globTotal = 0;
    for (var i = rangeStart; i < rangeEnd; i++) {
        globTotal += freqData[i];
    }
    // TODO: add sensitivity control

    // TODO: fire global events
    var globalVolume = globTotal / (rangeEnd - rangeStart);
    if (globalVolume - Pumper.volume > Pumper.globalSpikeTolerance) {
        Pumper.isSpiking = true;
    } else {
        Pumper.isSpiking = false;
    }
    Pumper.volume = globalVolume;
    if (Pumper.volume >= Pumper.globalThreshold) {
        Pumper.isOverThreshold = true;
    } else {
        Pumper.isOverThreshold = false;
    }

    // Calc band volume levels
    Pumper.bands.forEach(function(band) {
        var bRangeStart = Math.floor(band.start * Pumper.fftSize);
        var bRangeEnd = Math.floor(band.end * Pumper.fftSize);
        var bandTotal = 0;
        for (var i = bRangeStart; i < bRangeEnd; i++) {
            bandTotal += freqData[i];
        }
        var bandVolume = bandTotal / (bRangeEnd - bRangeStart);
        bandVolume = bandVolume * band.volScale;
        if (bandVolume - band.volume > band.spikeTolerance) {
            band.isSpiking = true;
            band._onSpike(bandVolume - band.volume);
        } else {
            band.isSpiking = false;
        }
        band.volume = bandVolume;
        if (band.volume >= band.threshold) {
            band.isOverThreshold = true;
            band._onThreshold();
        } else {
            band.isOverThreshold = false;
        }
    });

};


module.exports = Pumper;
