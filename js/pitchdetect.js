/*
The MIT License (MIT)

Copyright (c) 2014 Chris Wilson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
var PitchDetect = (function( requestAnimationFrame ) {
	"use strict";

	var buflen = 1024;

	var noteStrings = ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"];

	// this is a float version of the algorithm below - but it's not currently used.
	/*
	function autoCorrelateFloat( buf, sampleRate ) {
		var MIN_SAMPLES = 4;	// corresponds to an 11kHz signal
		var MAX_SAMPLES = 1000; // corresponds to a 44Hz signal
		var SIZE = 1000;
		var bestOffset = -1;
		var bestCorrelation = 0;
		var rms = 0;

		if (buf.length < (SIZE + MAX_SAMPLES - MIN_SAMPLES))
			return -1;  // Not enough data

		for (var i=0;i<SIZE;i++)
			rms += buf[i]*buf[i];
		rms = Math.sqrt(rms/SIZE);

		for (var offset = MIN_SAMPLES; offset <= MAX_SAMPLES; offset++) {
			var correlation = 0;

			for (var i=0; i<SIZE; i++) {
				correlation += Math.abs(buf[i]-buf[i+offset]);
			}
			correlation = 1 - (correlation/SIZE);
			if (correlation > bestCorrelation) {
				bestCorrelation = correlation;
				bestOffset = offset;
			}
		}
		if ((rms>0.1)&&(bestCorrelation > 0.1)) {
			console.log(
				"f = " +
				 sampleRate/bestOffset +
				 "Hz (rms: " + rms + " confidence: " +
				 bestCorrelation +
				 ")"
			);
		}
	//	var best_frequency = sampleRate/bestOffset;
	}
	*/

	/**
	 * RMS is (to engineers anyway) a meaningful way of calculating the average of values
	 * over a period of time. With audio, the signal value (amplitude) is squared,
	 * averaged over a period of time, then the square root of the result is calculated.
	 * The result is a value, that when squared, is related (proportional) to the
	 * effective power of the signal.
	 *
	 * @param {Array} buf A buffer of meanungfull numerical data
	 * @returns {float} The 'Root Mean square' of the provided numerical data.
	 */
	function getRMS( buf ) {
		var rms = 0,
			i
		;

		for (i = 0; i < buf.length; ++i) {
			rms+= Math.pow( buf[i], 2 );
		}

		return Math.sqrt( rms / buf.length );
	}

	function getCorrelation( buf, offset ) {
		var correlation = 0,
			SIZE = buf.length,
			MAX_SAMPLES = Math.floor(SIZE/2),
			i
		;

		for (i=0; i<MAX_SAMPLES; i++) {
			correlation += Math.abs((buf[i])-(buf[i+offset]));
		}

		correlation = 1 - (correlation/MAX_SAMPLES);
	}

	function autoCorrelate( buf, sampleRate ) {
		var SIZE = buf.length,
			MAX_SAMPLES = Math.floor(SIZE/2),
			MIN_SAMPLES = 0,
			bestOffset = -1,
			bestCorrelation = 0,
			rms = getRMS( buf ),
			foundGoodCorrelation = false,
			correlations = new Array(MAX_SAMPLES),
			i
		;

		if (rms<0.01) { // not enough signal
			return -1;
		}

		var lastCorrelation=1;
		for (var offset = MIN_SAMPLES; offset < MAX_SAMPLES; offset++) {
			var correlation = 0;

			for (i=0; i<MAX_SAMPLES; i++) {
				correlation += Math.abs((buf[i])-(buf[i+offset]));
			}
			correlation = 1 - (correlation/MAX_SAMPLES);
			// store it, for the tweaking we need to do below.
			correlations[offset] = correlation;
			if ((correlation>0.9) && (correlation > lastCorrelation)) {
				foundGoodCorrelation = true;
				if (correlation > bestCorrelation) {
					bestCorrelation = correlation;
					bestOffset = offset;
				}
			} else if (foundGoodCorrelation) {
				// short-circuit - we found a good correlation, then a bad one, so we'd
				// just be seeing copies from here.  Now we need to tweak the offset - by
				// interpolating between the values to the left and right of the best
				// offset, and shifting it a bit.  This is complex, and HACKY in this code
				// (happy to take PRs!) - we need to do a curve fit on correlations[]
				// around bestOffset in order to better determine precise (anti-aliased)
				// offset.

				// we know bestOffset >=1,
				// since foundGoodCorrelation cannot go to true until the second pass
				// (offset=1), and we can't drop into this clause until the following pass
				// (else if).
				var shift = ( correlations[bestOffset+1] - correlations[bestOffset-1] ) /
					correlations[bestOffset]
				;
				return sampleRate/(bestOffset+(8*shift));
			}
			lastCorrelation = correlation;
		}
		if (bestCorrelation > 0.01) {
			// console.log(
			// 	"f = " +
			// 	 sampleRate/bestOffset +
			// 	 "Hz (rms: " + rms +
			// 	 " confidence: " + bestCorrelation +
			// 	 ")"
			// );
			return sampleRate/bestOffset;
		}
		return -1;
	//	var best_frequency = sampleRate/bestOffset;
	}

	/**
	 * Pitch is an Object that wraps around a frequency and pertains all relevant bits and
	 * pieces of information. Most useful information is most likely the `toString()`
	 * method, which returns the pitch as a String.
	 *
	 * @param {number} frequency The frequency of the Pitch.
	 * @constructor
	 */
	function Pitch( frequency ) {
		this.frequency = frequency;
		this.noteNum = Math.round( 1200 * (Math.log( frequency / 440 )/Math.log(2) )) / 100;
		this.baseFrequency = Pitch.frequencyFromNoteNumber( Math.round(this.noteNum) );
		this.offset = Math.floor(
			1200 * Math.log( this.frequency / this.baseFrequency)/Math.log(2)
		);
	}

	Pitch.prototype = {
		/**
		 * Return the frequency that was used to construct this `Pitch`.
		 *
		 * @returns {number} The frequency.
		 */
		getFrequency: function() {
			return this.frequency;
		},
		/**
		 * Returns the offset of this pitch as compared to the closest matching actual
		 * note. This indecates the degree the frequence is 'off tune'.
		 *
		 * @returns {number} Offset of this pitch.
		 */
		getOffset: function() {
			return this.offset;
		},
		/**
		 * Returns the note of this frequency as a `float`, compared to a 440Hz 'A4'. This
		 * numerical value is 0-based for 'A4' and increased by 1 for each half-note. So
		 * 1 represents 'A#' or 'Bb', 2 is the 'B' and so on...
		 *
		 * (Have not yet tested how notes below A4 are being represented)
		 *
		 * @returns {float} Numerical value of the Pitch as a note.
		 */
		getNote: function() {
			return this.noteNum;
		},
		/**
		 * The rounded of numerical value of this Frequency as a 'note'. This should then
		 * represent the note that is perceived.
		 *
		 * @returns {number} The whole numerical value of the Pitch as a note.
		 */
		toInt: function() {
			return Math.round(this.noteNum);
		},
		/**
		 * Human-readable presentation of the Pitch as a 'note'. Thus for 440Hz the value
		 * returned would be 'A'.
		 *
		 * TODO Add numbers to indicate octave. So 440Hz should be 'A4'...
		 *
		 * @returns {String} Human-readable reprentation of the Pitch.
		 */
		toString: function() {
			var i = this.toInt() % 12;
			return noteStrings[i];
		}
	};

	/**
	 * Get the frequency of a note. This reverses the process by calculating the frequency
	 * of a 0-based note.
	 *
	 * @param {number} The numerical value of a note, where 0 is 'A4' and 2 is 'B4', etc.
	 * @returns {number} The frequency.
	 */
	Pitch.frequencyFromNoteNumber = function ( noteNum ) {
		return 440 * Math.pow(2,( noteNum )/12);
	};

	/**
	 * This is a pitch-detector. It parses frequency information using an AnalyserNode and
	 * attempts to figure out what pitch is being sounded.
	 *
	 * TODO Let this class behave as if it is an AnalyserNode, but with extra methods for
	 * pitch detection.
	 *
	 * @param {WebAudioContext} context This allows you to use this analyser in your own pipeline.
	 * @constructor
	 */
	function PitchDetect( context ) {
		this.context = context;
		this.analyser = context.createAnalyser();
		this.analyser.fftSize = 2048;
		// corresponds to a 5kHz signal
		//this.MAX_SIZE = Math.max(4,Math.floor( context.sampleRate/5000 ));
		this.buf = new Float32Array( buflen );

	}

	PitchDetect.prototype = {

		/**
		 * Get low-level access to the underlying `AnalyserNode`.
		 *
		 * @returns {AnalyserNode} The underlying node.
		 */
		getAnalyser: function( ) {
			return this.analyser;
		},
		/**
		 * Returns the last buffer that was analysed.
		 *
		 * @returns {Float32Array} The last buffer.
		 */
		getAnalysedBuffer: function() {
			return this.buf;
		},
		/**
		 * Parse the contents of the `AnalyserNode` and return a `Pitch` Object for further
		 * handling.
		 *
		 * @param
		 * @returns
		 */
		autoCorrelate: function() {
			this.analyser.getFloatTimeDomainData( this.buf );
			return new Pitch( autoCorrelate( this.buf, this.context.sampleRate ) );
		},
		/**
		 * Connect an AudioNode to the AnalyserNode and the AnalyserNode to the
		 * destination. This method currently cleans up any existing source node and also
		 * connects to the `WebAudioContext.destination`. I would like to rework this to
		 * make it act as a real `AudioNode` to be used in any WebAudioContext pipeline.
		 *
		 * @param {AudioNode} source The new source node.
		 * @returns {AnalyserNode} The underlying `AnalyserNode`.
		 */
		connect: function( source ) {
			var analyser = this.analyser;
			if ( !!this.oldSource ) {
				this.oldSource.disconnect();
				this.oldSource = null;
			}
			source.connect( analyser );
			this.oldSource = source;
			//analyser.connect( this.context.destination );
			return analyser;
		}

	};

	//AMD module trickery, this way people using AMD can require...
	if ( typeof define === "function" && define.amd ) { //jshint ignore:line
	    define( "pitchdetect", [], function() { //jshint ignore:line
	        return PitchDetect;
	    });
	}
	return PitchDetect;

}(
	window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame
));
