# Pumper - Web Audio API analysis & monitoring library

This lib wraps the Web Audio API.  It is designed to make realtime analysis of
a web audio stream (media or microphone) easier. Created it for this project so
we can easily react to volume levels and frequency spikes for reactive Canvas/GL
visualizations.

Instantiated as a singleton - pass it around the app via require().

## API:
- `Pumper.start(source, doAutoplay, fftSize=256, start=0.04, end=0.35)`
     - source can be a media URL or 'mic'

- `Pumper.update()`
     - updates all exposed properties with latest data

- `Pumper.createBand(start, end, threshold, spikeTolerance, volScale=1, globalRange=true)`
     - creates a new frequency range monitor and returns the instance

Exposed properties:
- `Pumper.bands` - array of all Band instances in the order they were created
- `Pumper.volume` - current global average volume level. Set via Pumper.update()
- `Pumper.globalSpikeTolerance` - distance over which a volume change is considered a spike
- `Pumper.globalThreshold` - arbitrary threshold value for global volume level
- `Pumper.isSpiking` - true if there was a volume spike since the last time update() was called
- `Pumper.isOverThreshold` - true if the current global volume exceeds the set global threshold
- `Pumper.freqData` - raw frequency data array
- `Pumper.timeData` - raw time domain data array
