# Pumper - Web Audio API analysis & monitoring library

<p align="center">
  <a href="https://www.npmjs.com/package/pumper"><img src="https://img.shields.io/npm/v/pumper.svg?style=flat"></a>
  <a href="https://www.npmjs.com/package/pumper"><img src="https://img.shields.io/npm/dt/pumper.svg"></a>
  <img src="https://img.shields.io/npm/l/pumper.svg">
</p>

This lib wraps the Web Audio API.  It is designed to make realtime analysis of
a web audio stream (media or microphone) easier. Created it for this project so
we can easily react to volume levels and frequency spikes for reactive Canvas/GL
visualizations.

Instantiated via new.

<p align="center"><b>
  <a href="https://github.com/Consoletation/stream-webvfx">Example Projects</a>
</b></p>

## API
- `Pumper.start(source, start = 1920, end = 16800, precision = 11)`
     - source can be a media URL or 'mic'
     - 'start' and 'end' define the global frequency ranges
     - precision will decide how many lookups the analyzer will have

- `Pumper.update()`
     - updates all exposed properties with latest data

- `Pumper.createBand(start, end, threshold, spikeTolerance, volScale = 1)`
     - creates a new frequency range monitor and returns the instance
     - 'start' and 'end' define the band frequency ranges
     - frequency range is scaled to global values
     - 'volScale' optionally multiplies returned volume values

Exposed properties:
- `Pumper.bands` - array of all Band instances in the order they were created
- `Pumper.volume` - current global average volume level. Set via Pumper.update()
- `Pumper.globalSpikeTolerance` - distance over which a volume change is considered a spike
- `Pumper.globalThreshold` - arbitrary threshold value for global volume level
- `Pumper.isSpiking` - true if there was a volume spike since the last time update() was called
- `Pumper.isOverThreshold` - true if the current global volume exceeds the set global threshold
- `Pumper.freqData` - raw frequency data array
- `Pumper.timeData` - raw time domain data array

## Examples
- `const pumper = new Pumper()`
  Creates a new instance of the Pumper class.
- `pumper.start('mic', 1160, 14000, 13)`
  Initializes Pumper and uses default audio input as source.
- `pumper.createBands(80, 220, 10, 1, 1.25, 0.5)`
  Create a set of bands (10) over bass frequencies:
     - Volume of first band is 1x, last band is 1.25x multiplied
     - Bleed amount of 0.5 (overlap halfway with each band)
- `pumper.update()`
  Updates the frequency data of global and band values, and calculates volume
- `pumper.bands[0].volume`
  Volume of the first bass band we created
