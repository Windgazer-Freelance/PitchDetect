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
/* global Pitch, console*/
var pitchDetect = ( function( AudioContext, requestAnimationFrame, cancelAnimationFrame ) {
    "use strict";

    var DEBUGCANVAS = null,
        audioContext = new AudioContext(),
        analyser = audioContext.createAnalyser(),
        pitch = new Pitch( analyser ),
        sourceNode = null,
        theBuffer = null,
        waveCanvas,
        canvasElem,
		pitchElem,
		noteElem,
		detuneElem,
        detuneAmount,
        isPlaying = false,
		mediaStreamSource = null,
		isLiveInput,
        ui
	;

    function error() {
	    window.alert('Stream generation failed.');
	}

    function redrawCanvas() {
        var buf = pitch.buf;
        if (ui.isPlaying()) {
            waveCanvas.clearRect(0,0,512,256);
            waveCanvas.strokeStyle = "red";
            waveCanvas.beginPath();
            waveCanvas.moveTo(0,0);
            waveCanvas.lineTo(0,256);
            waveCanvas.moveTo(128,0);
            waveCanvas.lineTo(128,256);
            waveCanvas.moveTo(256,0);
            waveCanvas.lineTo(256,256);
            waveCanvas.moveTo(384,0);
            waveCanvas.lineTo(384,256);
            waveCanvas.moveTo(512,0);
            waveCanvas.lineTo(512,256);
            waveCanvas.stroke();
            waveCanvas.strokeStyle = "black";
            waveCanvas.beginPath();
            waveCanvas.moveTo(0,buf[0]);
            for (var i=1;i<512;i++) {
                waveCanvas.lineTo(i,128+(buf[i]*128));
            }
            waveCanvas.stroke();
        }
		rafID = requestAnimationFrame( redrawCanvas );
    }

    function updatePitch( time ) {
		pitch = new Pitch( analyser );
		// TODO: Paint confidence meter on canvasElem here.

	 	if (pitch.getFrequency() == -1) {
			pitchElem.parentNode.parentNode.className = "vague";
		 	pitchElem.innerText = "--";
			noteElem.innerText = "-";
			detuneElem.className = "";
			detuneAmount.innerText = "--";
	 	} else {
			pitchElem.parentNode.parentNode.className = "confident";
		 	pitchElem.innerText = Math.round( pitch.getFrequency() ) ;
			noteElem.innerHTML = pitch.toString();
			var detune = pitch.getOffset();
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
        analyser.disconnect();
        // Connect it to the destination. But not to output...
		ui.connect( mediaStreamSource );
	}

	var rafID = null;
    function fetchAudoFile() {
		var request = new XMLHttpRequest();
		request.open("GET", "../sounds/whistling3.ogg", true);
		request.responseType = "arraybuffer";
		request.onload = function() {
            ui.decode(request.response);
		};
		request.send();
	}

    window.addEventListener("load", function() {

        var detectorElem,
            prev = "dragenter dragstart dragend dragleave dragover drag drop".split(" "),
            i
        ;

        analyser.connect( audioContext.destination );
        //Get UI elements
        canvasElem = document.getElementById( "output" );
		pitchElem = document.getElementById( "pitch" );
		noteElem = document.getElementById( "note" );
		detuneElem = document.getElementById( "detune" );
		detuneAmount = document.getElementById( "detune_amt" );
        detectorElem = document.getElementById("detector");

        //Fetch demo whistling
        fetchAudoFile();

        for (i = 0; i < prev.length; ++i) {
            detectorElem.addEventListener(prev[i], function(e) {
                e.preventDefault();
                return false;
            });
        }

        //Setup drag/drop handling for dropping in a custom audio file.
        detectorElem.addEventListener("dragenter", function(e) {
            this.classList.add("droptarget");
        });
        detectorElem.addEventListener("dragleave", function(e) {
            e.preventDefault();
        });
        detectorElem.addEventListener("drop", function(e) {
            e.stopPropagation();
            e.preventDefault();
            this.classList.remove("droptarget");
            console.log("Attempting to stop browser from navigating...");

            try {
                ui.stop();
                var reader = new FileReader();
                reader.onload = function(event) {
                    console.log("decoding dropped audio!");
                    ui.decode(event.target.result);
                };
                reader.onerror = function(event) {
                    window.alert("Error: " + reader.error);
                };
                reader.readAsArrayBuffer(e.dataTransfer.files[0]);
            } catch (E) {
                console.warn(E);
            }
        });

        //Check for existence of debugging canvas (to display frequency wave)
        DEBUGCANVAS = document.getElementById( "waveform" );
		if (DEBUGCANVAS) {
			waveCanvas = DEBUGCANVAS.getContext("2d");
			waveCanvas.strokeStyle = "black";
			waveCanvas.lineWidth = 1;
            redrawCanvas();
		}

    });

    return ui = {

        decode: function( data ) {
			audioContext.decodeAudioData(
				data,
                function(buffer) {
                    theBuffer = buffer;
                },
                function() {
                    window.alert("error loading!");
                }
            );
		},

        stop: function() {
			if (isPlaying||isLiveInput) {
		        //stop playing and return
		        if (isPlaying) {
					sourceNode.stop( 0 );
				}
				sourceNode.disconnect();
		        sourceNode = null;
                analyser.connect( audioContext.destination ); //safe moment to reconnect
				isLiveInput = false;
		        isPlaying = false;
		        if ( !!rafID ) {
                    cancelAnimationFrame( rafID );
                    rafID = null;
                }
				this.setPlaying("Nothing");
		        return true;
		    }
			return false;
		},

        connect: function( source ) {
            source.connect( analyser );
            sourceNode = source;
            //analyser.connect( this.context.destination );
            updatePitch();
            return analyser;
        },

		setPlaying: function( sourceName ) {
			document.body.className = document.body.className.replace(/isPlaying\w+/, "");
			document.body.className += " isPlaying" + sourceName;
		},

        isPlaying: function() {
			return isPlaying || isLiveInput;
		},

        toggleOscillator: function () {
            var source = audioContext.createOscillator();
            //source.frequency.value = 110.00; //A2
			if ( this.stop() ) {
				return false;
			}

			this.connect( source );
		    source.start(0);
            isPlaying = true;
			this.setPlaying("Oscillator");
		},

		toggleLiveInput: function () {
			if ( this.stop() ) {
				return false;
			}
            if (mediaStreamSource === null ) {
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
            } else {
                analyser.disconnect();
                this.connect( mediaStreamSource );
            }
            isLiveInput = true;
			this.setPlaying("LiveInput");
		},

		togglePlayback: function () {
			if ( this.stop() ) {
				return false;
			}

		    var source = audioContext.createBufferSource();
		    source.buffer = theBuffer;
		    source.loop = true;

            this.connect( source );
		    source.start( 0 );
		    isPlaying = true;
			this.setPlaying("Playback");
		}

    };
}(
    window.AudioContext ||
	window.webkitAudioContext,
    window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame,
    window.cancelAnimationFrame ||
    window.webkitCancelAnimationFrame ||
    window.mozCancelAnimationFrame
) );
