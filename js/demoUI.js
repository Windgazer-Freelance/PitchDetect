/* global pitchDetect, console*/
(function() {
    "use strict";

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

        fetchAudoFile();

        detectorElem = document.getElementById("detector");
        for (i = 0; i < prev.length; ++i) {
            detectorElem.addEventListener(prev[i], function(e) {
                e.preventDefault();
                return false;
            });
        }

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

    });

}());
