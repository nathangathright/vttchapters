function secondsToTimestamp(startTime) {
  var hours = Math.floor(startTime / 3600);
  var minutes = Math.floor((startTime - (hours * 3600)) / 60);
  var seconds = Math.floor(startTime - (hours * 3600) - (minutes * 60));
  var milliseconds = Math.floor((startTime - Math.floor(startTime)) * 1000);
  hours = hours < 10 ? '0' + hours : hours;
  minutes = minutes < 10 ? '0' + minutes : minutes;
  seconds = seconds < 10 ? '0' + seconds : seconds;
  milliseconds = milliseconds < 10 ? '00' + milliseconds : milliseconds < 100 ? '0' + milliseconds : milliseconds;
  return hours + ':' + minutes + ':' + seconds + '.' + milliseconds;
}

function generateVTT(fileContents) {
  var payload = document.querySelector('input[name="payload"]:checked').id;
  var json = JSON.parse(fileContents);
  var chapters = json.chapters;

  if (payload === "chapters") {
    chapters = chapters.filter(function(chapter) {
      return chapter.toc !== false;
    });
  }

  for (var i = 0; i < chapters.length; i++) {
    var start = chapters[i].startTime;
    var end = chapters[i].endTime || (chapters[i + 1] ? chapters[i + 1].startTime : start + 10);
    var timestamp = secondsToTimestamp(start) + ' --> ' + secondsToTimestamp(end);
    chapters[i].timestamp = timestamp;
    delete chapters[i].startTime;
    delete chapters[i].endTime;
  }

  var output = document.getElementById('output');
  output.textContent = 'WEBVTT\n\n';

  // if any chapter with toc==false was removed, add a note to the output
  if (json.chapters.length !== chapters.length) {
    output.textContent += 'NOTE\nThis file has been modified to remove chapters with "toc": false\n\n';
  }

  for (var i = 0; i < chapters.length; i++) {
    output.textContent += (i + 1) + '\n' + chapters[i].timestamp + '\n';

    if (payload === "metadata") {
      var chapter = JSON.parse(JSON.stringify(chapters[i]));
      delete chapter.timestamp;
      output.textContent += JSON.stringify(chapter,null,2) + '\n\n';
    }
    else if (payload === "chapters") {
      output.textContent += chapters[i].title + '\n\n';
    }
  }

  var blob = new Blob([output.textContent], {type: 'text/vtt;charset=utf-8'});
  var url = URL.createObjectURL(blob);
  var a = document.getElementById('download');
  a.href = url;
  a.download = `${payload}.vtt`;
  a.textContent = `Download ${payload}.vtt`;
}

function processUpload() {
  if (document.getElementById('dropzone-file').files.length === 0) {
    return;
  }

  var file = document.getElementById('dropzone-file').files[0]
  var reader = new FileReader();
  reader.onload = function(progressEvent) {
    generateVTT(this.result);
  };
  reader.readAsText(file);
}

function requestURL(remoteURL){
  var xhr = new XMLHttpRequest();
  xhr.open('GET', remoteURL, true);
  xhr.responseType = 'blob';
  xhr.onload = function() {
    if (this.status === 200) {
      var reader = new FileReader();
      reader.onload = function(progressEvent) {
        generateVTT(this.result);
      };
      reader.readAsText(this.response);
    }
  };
  xhr.send();
}

var urlParams = new URLSearchParams(window.location.search);
var payload = urlParams.get('payload');
var url = urlParams.get('url');

if (payload) {
  document.getElementById(payload).checked = true;
}

if (url) {
  document.getElementById('dropzone').style.display = 'none';
  document.getElementById('home').classList.add('underline');
  requestURL(url);
}

document.getElementById('dropzone-file').onchange = function() {
  processUpload();
};

document.querySelectorAll('input[name="payload"]').forEach(function(radio) {
  radio.addEventListener('change', function() {
    if (url) {
      requestURL(url);
    }
    else if (document.getElementById('dropzone-file').files.length > 0) {
      processUpload();
    }
  });
});

let dropzone = document.getElementById('dropzone');

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  dropzone.addEventListener(eventName, function(event){
    event.preventDefault()
    event.stopPropagation()
  }, false)
});

['dragenter', 'dragover'].forEach(eventName => {
  dropzone.addEventListener(eventName, dropzone.classList.add('highlight'), false)
});

['dragleave', 'drop'].forEach(eventName => {
  dropzone.addEventListener(eventName, dropzone.classList.remove('highlight'), false)
});

dropzone.addEventListener('drop', function(event) {
  document.getElementById('dropzone').style.display = 'none';
  document.getElementById('home').classList.add('underline');

  let file = event.dataTransfer.files[0]
  let reader = new FileReader()
  reader.onload = function(progressEvent) {
    generateVTT(this.result);
  }
  reader.readAsText(file)
  document.getElementById('dropzone-file').files = event.dataTransfer.files;
}, false);