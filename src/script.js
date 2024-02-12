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

function generateVTT() {
  // get value of selected payload radio button
  var payload = document.querySelector('input[name="payload"]:checked').id;
  if (document.getElementById('dropzone-file').files.length === 0) {
    return;
  }

  var file = document.getElementById('dropzone-file').files[0];
  var reader = new FileReader();
  reader.onload = function(progressEvent) {
    var json = JSON.parse(this.result);
    var chapters = json.chapters;

    if (payload === "chapters") {
      chapters = chapters.filter(function(chapter) {
        return chapter.toc !== false;
      });

      // If a toc==false chapter is the first chapter, we need to add a dummy chapter at the beginning
      if (json.chapters[0].toc === false) {
        chapters.unshift({
          title: 'Start',
          startTime: 0,
        });
      }
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
  };
  reader.readAsText(file);
}

document.getElementById('dropzone-file').onchange = function() {
  generateVTT();
};

// Listen for changes to the payload radio buttons
document.querySelectorAll('input[name="payload"]').forEach(function(radio) {
  radio.addEventListener('change', function() {
    generateVTT();
  });
});