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
/* global pitchDetect, console*/
( function( requestAnimationFrame ) {
    "use strict";

    var DEBUGCANVAS = null,
        waveCanvas,
        rafID
    ;

    function redrawCanvas() {
        var buf;
        if (pitchDetect.isPlaying()) {
            buf = pitchDetect.getAnalysedBuffer();
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

    function fetchAudoFile() {
		var request = new XMLHttpRequest();
		request.open("GET", "../sounds/whistling3.ogg", true);
		request.responseType = "arraybuffer";
		request.onload = function() {
            pitchDetect.decode(request.response);
		};
		request.send();
	}

    window.addEventListener("load", function() {

        var detectorElem,
            prev = "dragenter dragstart dragend dragleave dragover drag drop".split(" "),
            i
        ;

        //Fetch demo whistling
        fetchAudoFile();

        detectorElem = document.getElementById("detector");
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
                var reader = new FileReader();
                reader.onload = function(event) {
                    pitchDetect.decode(event.target.result);
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
            redrawCanvas()
		}

    });
}(
    window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame
) );
