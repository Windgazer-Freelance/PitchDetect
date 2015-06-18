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

	var tracks = null;
	var buflen = 1024;

	var noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

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

	var MIN_SAMPLES = 0;  // will be initialized when AudioContext is created.

	function autoCorrelate( buf, sampleRate ) {
		var SIZE = buf.length;
		var MAX_SAMPLES = Math.floor(SIZE/2);
		var bestOffset = -1;
		var bestCorrelation = 0;
		var rms = 0;
		var foundGoodCorrelation = false;
		var correlations = new Array(MAX_SAMPLES);
		var i;

		for (i=0;i<SIZE;i++) {
			var val = buf[i];
			rms += val*val;
		}
		rms = Math.sqrt(rms/SIZE);
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

	function Pitch( frequency ) {
		this.frequency = frequency;
		this.noteNum = Math.round( 1200 * (Math.log( frequency / 440 )/Math.log(2) )) / 100;
		this.baseFrequency = Pitch.frequencyFromNoteNumber( Math.round(this.noteNum) );
		this.offset = Math.floor(
			1200 * Math.log( this.frequency / this.baseFrequency)/Math.log(2)
		);
	}

	Pitch.prototype = {
		getFrequency: function() {
			return this.frequency;
		},
		getOffset: function() {
			return this.offset;
		},
		getNote: function() {
			return this.noteNum;
		},
		toInt: function() {
			return Math.round(this.noteNum);
		},
		toString: function() {
			var i = (this.toInt() + 9) % 12;
			return noteStrings[i];
		}
	};

	Pitch.frequencyFromNoteNumber = function ( noteNum ) {
		return 440 * Math.pow(2,( noteNum )/12);
	};

	function PitchDetect( context ) {
		this.context = context;
		this.analyser = context.createAnalyser();
		this.analyser.fftSize = 2048;
		// corresponds to a 5kHz signal
		//this.MAX_SIZE = Math.max(4,Math.floor( context.sampleRate/5000 ));
		this.buf = new Float32Array( buflen );

	}

	PitchDetect.prototype = {

		getAnalyser: function( ) {
			return this.analyser;
		},
		getAnalysedBuffer: function() {
			return this.buf;
		},
		autoCorrelate: function() {
			this.analyser.getFloatTimeDomainData( this.buf );
			return new Pitch( autoCorrelate( this.buf, this.context.sampleRate ) );
		},
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
