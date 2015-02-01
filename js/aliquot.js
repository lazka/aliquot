// AliquotUtil
// ----------------------------------------------------------------------------

var AliquotUtil = {};


AliquotUtil.endsWith = function(str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
};


AliquotUtil.setStatus = function(msg) {
    $("#status").html(msg);
};


AliquotUtil.uniq = function(array) {
    return array.filter(function(item, pos, array) {
        return array.indexOf(item) == pos;
    });
};


AliquotUtil.numSort = function(array) {
    var func = function (a, b) { return a - b; };
    return array.sort(func);
};


// Source
// ----------------------------------------------------------------------------

var Source = function(uri, bitrate, codec, channels) {
    this.uri = uri;
    this.bitrate = bitrate;
    this.codec = codec;
    this.channels = channels;
};


Source.prototype.getDesc = function() {
    return this.codec + " | " + this.bitrate + " kpbs | " + this.channels + " chan";
};


// Station
// ----------------------------------------------------------------------------

var Station = function(index, id) {
    this._stations = index.stations;
    this._genres = index.genres;
    this._codecs = index.codecs;
    this.id = id;
};


Station.prototype.getSources = function() {
    var urls = this._stations[this.id][3];
    var sources = []
    for(var i in urls) {
        var url = urls[i];
        var codec = this._codecs[url[2]];
        var source = new Source(url[0], url[1], codec, url[3]);
        sources.push(source);
    }
    return sources;
};


Station.prototype.getGenre = function() {
    return this._genres[this._stations[this.id][2]];
};


Station.prototype.getTitle = function() {
    return this._stations[this.id][0];
};


Station.prototype.getWebsite = function() {
    return this._stations[this.id][1];
};


Station.prototype.getFormatInfos = function() {
    var codecs = this._codecs;
    var urls = this._stations[this.id][3];
    var formats = {};

    for(var i in urls) {
        var url = urls[i];
        var bitrate = url[1];
        var codec_idx = url[2];
        var codec = codecs[codec_idx];
        if(!(codec in formats))
            formats[codec] = [];
        formats[codec].push(bitrate);
    }

    var results = [];
    for (var key in formats) {
        var bitrates = formats[key];
        AliquotUtil.numSort(bitrates);
        bitrates = AliquotUtil.uniq(bitrates);
        var text = key + " ("
        if (bitrates.length == 1)
            text += bitrates[0];
        else
            text += bitrates[0] + '-' + bitrates.slice(-1)[0];
        text += ")"
        results.push(text)
    }

    return results.sort();
};


// Player
// ----------------------------------------------------------------------------

var Player = function() {
    this._audio = new Audio();
    this._station = null;
    var parent = this;

    this._audio.addEventListener('loadstart', function (e) {
        AliquotUtil.setStatus("Loading started");
    });

    this._audio.addEventListener('stalled', function (e) {
        AliquotUtil.setStatus("Loading stalled");
    });

    this._audio.addEventListener('playing', function (e) {
        AliquotUtil.setStatus(
            parent.getActiveStation().getTitle() + "<br>" + parent.getActiveSource().getDesc());
    });

    this._audio.addEventListener('error', function (e) {
        var error = e.target.error;

        if(!error)
            return;

        switch (error.code) {
            case error.MEDIA_ERR_ABORTED:
                AliquotUtil.setStatus("Playback aborted.");
                break;
            case error.MEDIA_ERR_NETWORK:
                AliquotUtil.setStatus("Network error");
                break;
            case error.MEDIA_ERR_DECODE:
                AliquotUtil.setStatus("Decoding error");
                break;
            case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                AliquotUtil.setStatus("Format not supported");
                break;
        }
    }, true);
};


Player.prototype.getActiveStation = function() {
    return this._station;
}


Player.prototype.getActiveSource = function() {
    var station = this.getActiveStation();
    if(station == null)
        return null;
    var currentSrc = this._audio.currentSrc;
    // remove shoutcast hack
    currentSrc = currentSrc.replace(/;$/, '').replace(/\/$/, '');
    var sources = station.getSources();
    var a = document.createElement('a');
    for(var i in sources) {
        var source = sources[i];
        a.href = source.uri;
        // normalize uri, remove shoutcast hack
        var uri = a.href.replace(/;$/, '').replace(/\/$/, '');
        if(uri == currentSrc)
            return source;
    }
    return null;
}


Player.prototype.playStation = function(station) {
    var audio = this._audio;
    this._station = station;

    audio.pause();
    AliquotUtil.setStatus("");

    var fixup_shoutcast = function(urls) {
        // work around shoutcast browser detection
        var sources = [];
        for(var i in urls) {
            var url = urls[i];
            if(AliquotUtil.endsWith(url, "/"))
                sources.push(url + ";");
            else if(!AliquotUtil.endsWith(url, ";"))
                sources.push(url + "/;");
            sources.push(url);
        }
        return sources;
    };

    while (audio.firstChild) {
        audio.removeChild(audio.firstChild);
    }

    var sources = station.getSources();
    var urls = [];
    for(var i in sources) {
        var source = sources[i];
        urls.push(source.uri);
    }
    urls = fixup_shoutcast(urls);

    for (var i in urls) {
        var elm = document.createElement('source');
        elm.src = urls[i];
        audio.appendChild(elm);
    }

    audio.load();
    audio.play();
};


// Search
// ----------------------------------------------------------------------------

var Search = function() {
    this._index = null;
    this._active_query = null;
    this._queued_query = null;
    this._result_ids = null;
};


Search.prototype.loadIndex = function(url) {
    $.ajax({
        type: "GET",
        url: url,
        data: null,
        dataType: "script",
        cache: true,
        complete: function(jqxhr, textstatus) {
        if (textstatus != "success") {
            document.getElementById("searchindexloader").src = url;
        }
        },
    });
};


Search.prototype.setIndex = function(index) {
    this._index = index;
    var query = this._queued_query;

    if (query !== null) {
      this._queued_query = null;
      this._query(query);
    }
};


Search.prototype.getStation = function(idx) {
      return new Station(this._index, idx);
};


Search.prototype.getRandomResultStation = function() {
      if(this._result_ids == null)
        return null;
      var ids = this._result_ids;
      var rand = ids[Math.floor(Math.random() * ids.length)];
      return this.getStation(rand);
};


Search.prototype.performSearch = function(query) {
    if (query == this._active_query)
        return;
    this._active_query = query;

    if (this._index != null)
      this._query(query);
    else
        this._queued_query = query;
};


Search.prototype._query = function(query) {
    var output = $('#search-results');
    output.empty();

    var parts = query.toLowerCase().split(/\s+/);
    parts = parts.filter(function(e){ return e; });

    var index = this._index;
    var stations = index.stations;
    var codecs = index.codecs;
    var genres = index.genres;

    this._result_ids = [];
    var results = [];

    var temp = new Station(this._index);
    for(var i in stations) {
        temp.id = i;

        var title = temp.getTitle();
        var website = temp.getWebsite();
        var genre = temp.getGenre();

        var genre_low = genre.toLowerCase();
        var title_low = title.toLowerCase();
        var website_low = website.toLowerCase();

        var ok = true;
        for(var j in parts) {
            var part = parts[j];
            if (genre_low.indexOf(part) == -1 &&
                    title_low.indexOf(part) == -1 &&
                    website_low.indexOf(part) == -1) {
                ok = false;
                break;
            }
        }

        if (ok) {
            var uri = temp.getSources()[0].uri;
            var format = temp.getFormatInfos().join(" | ");

            this._result_ids.push(i);
            var res;
            res = '<div class="result">';
            res += '<a class="station" id="station-' + i + '" href="">';
            res += '<i class="fa fa-music"></i>'
            res += '<div class="station-title">' + title + '</div>';
            res += '<div class="station-website">' + website + '</div>';
            res += '<div class="station-details">' + format + ' | ' + genre + '</div>'
            res += '</a></div>';
            results.push(res);
         }
         $("#stats").html("#" + results.length);
      }

    var parent = this;
    var show_first = 20;
    var results_len = results.length;

    var displayNextItem = function(query) {
        if (query !== parent._active_query || !results.length)
            return;

        var item = $(results.pop()).hide();
        output.append(item);

        if(results.length > (results_len - 20)) {
            item.show();
            displayNextItem(query);
        } else {
            item.slideDown(5, function() {
              displayNextItem(query);
            });
        }
    }

    displayNextItem(query);
    $('#content').scrollTop(0);
};


// Aliquot
// ----------------------------------------------------------------------------

var Aliquot = function() {
    this._player = new Player();
    this._search = new Search();
}


Aliquot.prototype.start = function(index_url) {
    var player = this._player;
    var search = this._search;

    $('#search-field').focus();

    var delay = (function(){
      var timer = 0;
      return function(callback, ms){
        clearTimeout(timer);
        timer = setTimeout(callback, ms);
      };
    })();

    $('#search-field').keyup(function(){
        var val = $(this).val()
        delay(function(){
            search.performSearch(val);
        }, 200);
    });

    $('#random').click(function () {
        var station = search.getRandomResultStation();
        if(station != null)
            player.playStation(station);
        return false;
    });

    $("#search-results").on("click", ".station", function() {
        var id = $(this).attr("id");
        var index = parseInt(id.split("-").slice(-1)[0]);
        var station = search.getStation(index);
        player.playStation(station);
        return false;
    });

    search.loadIndex(index_url);
};


Aliquot.prototype.setIndex = function(index) {
    this._search.setIndex(index);
};
