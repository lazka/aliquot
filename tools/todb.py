import json
from quodlibet.util import sanitize_tags
from quodlibet.util.string import decode, encode

def parse_taglist(data):
    """Parses a dump file like list of tags and returns a list of IRFiles

    uri=http://...
    tag=value1
    tag2=value
    tag=value2
    uri=http://...
    ...

    """

    stations = []
    station = None

    for l in data.split("\n"):
        key = l.split("=")[0]
        value = l.split("=", 1)[1]
        if key == "uri":
            if station:
                stations.append(station)
            station = {"~uri": value}
            continue

        value = decode(value)
        san = sanitize_tags({key: value}, stream=True).items()
        if not san:
            continue

        key, value = san[0]
        if key == "~listenerpeak":
            key = "~#listenerpeak"
            value = int(value)

        if isinstance(value, str):
            value = value.decode("utf-8")
            if value not in station.list(key):
                station.add(key, value)
        else:
            station[key] = value

    if station:
        stations.append(station)

    return stations


with open("radiolist", "rb") as h:
    x = parse_taglist(h.read())[:]

y = {}
for i in x:
    key = (i.get('organization', i.get("website", "")), i.get("website", ""))
    if key == ("", ""):
        continue
    y.setdefault(key, []).append(i)


final = {}
urls = {}
for k, v in y.iteritems():
    bitrates = []
    for station in v:
        bitrate = station["~#bitrate"]
        if "AAC" in station["audio-codec"]:
            bitrate *= 1.5
        bitrates.append(bitrate)
    if max(bitrates) < 50:
        continue

    final[k] = v


stations = []
codecs = []
genres = []
for k, v in final.iteritems():
    website = v[0].get("website", "")
    orga = v[0].get("organization", website)
    genre = " ".join(filter(None, set([i.get("genre", "") for i in v])))

    if genre not in genres:
        genre_idx = len(genres)
        genres.append(genre)
    else:
        genre_idx = genres.index(genre)

    urls = []
    for x in v:
        codec = x["audio-codec"]
        if codec == "MPEG 1 Audio, Layer 2":
            codec = "MP2"
        if "AAC" in codec:
            codec = "AAC"
        if codec not in codecs:
            codec_idx = len(codecs)
            codecs.append(codec)
        else:
            codec_idx = codecs.index(codec)

        channels = x.get("channel-mode", "stereo")
        if channels == "stereo":
            channels = 2
        elif channels == "mono":
            channels = 1
        else:
            assert 0, channels

        urls.append((x["~uri"], x["~#bitrate"], codec_idx, channels))

    def sort_key_urls(i):
        return (i[1] * 1.5 if codecs[codec_idx] == "AAC" else i[1], codecs[codec_idx] == "AAC", i[0])

    urls.sort(key=sort_key_urls, reverse=True)

    stations.append((orga, website, genre_idx, tuple(urls)))

stations.sort()

print "app.setIndex(" + json.dumps({"genres": genres, "codecs": codecs, "stations": stations}) + ");"
