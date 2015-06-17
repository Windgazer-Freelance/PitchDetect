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
var pitchDetect = (function( AudioContext, requestAnimationFrame ) {
	"use strict";

	var audioContext = null,
		isPlaying = false;
	var sourceNode = null;
	var analyser = null;
	var theBuffer = null;
	var mediaStreamSource = null;
	var canvasElem,
		pitchElem,
		noteElem,
		detuneElem,
		detuneAmount,
		isLiveInput,
		MAX_SIZE;

	window.addEventListener("load", function() {
		audioContext = new AudioContext();
		analyser = audioContext.createAnalyser();
	    analyser.fftSize = 2048;
		// corresponds to a 5kHz signal
		MAX_SIZE = Math.max(4,Math.floor(audioContext.sampleRate/5000));

		canvasElem = document.getElementById( "output" );
		pitchElem = document.getElementById( "pitch" );
		noteElem = document.getElementById( "note" );
		detuneElem = document.getElementById( "detune" );
		detuneAmount = document.getElementById( "detune_amt" );

	} );

	function error() {
	    window.alert('Stream generation failed.');
	}

	function connectAnalyser( source ) {
		if ( !!analyser.oldSource ) {
			analyser.oldSource.disconnect();
			analyser.oldSource = null;
		}
		source.connect( analyser );
		analyser.oldSource = source;
		analyser.connect( audioContext.destination );
		return analyser;
	}

	function getUserMedia(dictionary, callback) {
	    try {
	        navigator.getUserMedia =
	        	navigator.getUserMedia ||
	        	navigator.webkitGetUserMedia ||
	        	navigator.mozGetUserMedia;
	        navigator.getUserMedia(dictionary, callback, error);
	    } catch (e) {
			window.alert('getUserMedia threw exception :' + e);
	    }
	}

	function gotStream(stream) {
	    // Create an AudioNode from the stream.
	    mediaStreamSource = audioContext.createMediaStreamSource(stream);
		sourceNode = mediaStreamSource;
		isLiveInput = true;

	    // Connect it to the destination. But not to output...
		connectAnalyser( mediaStreamSource ).disconnect();
	    updatePitch();
	}

	var rafID = null;
	var tracks = null;
	var buflen = 1024;
	var buf = new Float32Array( buflen );

	var noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

	function noteFromPitch( frequency ) {
		var noteNum = 12 * (Math.log( frequency / 440 )/Math.log(2) );
		return Math.round( noteNum ) + 69;
	}

	function frequencyFromNoteNumber( note ) {
		return 440 * Math.pow(2,(note-69)/12);
	}

	function centsOffFromPitch( frequency, note ) {
		return Math.floor(
			1200 * Math.log( frequency / frequencyFromNoteNumber( note ))/Math.log(2)
		);
	}

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

	function updatePitch( time ) {
		var cycles = [];
		analyser.getFloatTimeDomainData( buf );
		var ac = autoCorrelate( buf, audioContext.sampleRate );
		var pitch;
		// TODO: Paint confidence meter on canvasElem here.

	 	if (ac == -1) {
			pitchElem.parentNode.parentNode.className = "vague";
		 	pitchElem.innerText = "--";
			noteElem.innerText = "-";
			detuneElem.className = "";
			detuneAmount.innerText = "--";
	 	} else {
			pitchElem.parentNode.parentNode.className = "confident";
		 	pitch = ac;
		 	pitchElem.innerText = Math.round( pitch ) ;
		 	var note =  noteFromPitch( pitch );
			noteElem.innerHTML = noteStrings[note%12];
			var detune = centsOffFromPitch( pitch, note );
			if (detune === 0 ) {
				detuneElem.className = "";
				detuneAmount.innerHTML = "--";
			} else {
				if (detune < 0)
					{detuneElem.className = "flat";}
				else
					{detuneElem.className = "sharp";}
				detuneAmount.innerHTML = Math.abs( detune );
			}
		}

		rafID = requestAnimationFrame( updatePitch );
	}

	function PitchDetect() {}

	PitchDetect.prototype = {

		stop: function() {
			if (isPlaying||isLiveInput) {
		        //stop playing and return
		        if (isPlaying) {
					sourceNode.stop( 0 );
				}
				sourceNode.disconnect();
		        sourceNode = null;
				analyser.oldSource = null;
				isLiveInput = false;
		        isPlaying = false;
				if (!window.cancelAnimationFrame)
					{window.cancelAnimationFrame = window.webkitCancelAnimationFrame;}
		        window.cancelAnimationFrame( rafID );
				this.setPlaying("Nothing");
		        return true;
		    }
			return false;
		},
		setPlaying: function( sourceName ) {
			document.body.className = document.body.className.replace(/isPlaying\w+/, "");
			document.body.className += " isPlaying" + sourceName;
		},
		setBuffer: function( newBuffer ) {
			theBuffer = newBuffer;
		},
		decode: function( data ) {
			var self = this;
			audioContext.decodeAudioData(
				data,
                function(buffer) {
                    self.setBuffer(buffer);
                },
                function() {
                    window.alert("error loading!");
                }
            );
		},
		getAnalyser: function( ) {
			return analyser;
		},
		getAnalysedBuffer: function() {
			return buf;
		},
		isPlaying: function() {
			return isPlaying || isLiveInput;
		},

		toggleOscillator: function () {
			if ( this.stop() ) {
				return false;
			}
		    sourceNode = audioContext.createOscillator();

			connectAnalyser( sourceNode );
		    sourceNode.start(0);
		    isPlaying = true;
		    updatePitch();
			this.setPlaying("Oscillator");
		},

		toggleLiveInput: function () {
			if ( this.stop() ) {
				return false;
			}
		    getUserMedia(
		    	{
		            "audio": {
		                "mandatory": {
		                    "googEchoCancellation": "false",
		                    "googAutoGainControl": "false",
		                    "googNoiseSuppression": "false",
		                    "googHighpassFilter": "false"
		                },
		                "optional": []
		            },
		        }, gotStream
			);
			this.setPlaying("LiveInput");
		},

		togglePlayback: function () {
			if ( this.stop() ) {
				return false;
			}

		    sourceNode = audioContext.createBufferSource();
		    sourceNode.buffer = theBuffer;
		    sourceNode.loop = true;

			connectAnalyser( sourceNode );
		    sourceNode.start( 0 );
		    isPlaying = true;
		    updatePitch();
			this.setPlaying("Playback");
		}

	};

	if ( typeof define === "function" && define.amd ) { //jshint ignore:line
	    define( "pitchdetect", [], function() { //jshint ignore:line
	        return PitchDetect;
	    });
	}
	return new PitchDetect();

}(
	window.AudioContext ||
	window.webkitAudioContext,
	window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame
));
