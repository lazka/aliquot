
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

x = filter(lambda i: i.get("~#listenerpeak", 800) > 150, x)

keys = set()
for i in x:
    keys.update(i.keys())
keys = sorted(keys)


values = dict((v, []) for v in keys)

stations = []
for i in x:
    t = []
    for k in keys:
        value = i.get(k, "")
        tag_values = values[k]

        try:
            t.append(tag_values.index(value))
        except ValueError:
            t.append(len(tag_values))
            tag_values.append(value)
    stations.append(t)

values = [x[1] for x in sorted(values.items())]
keys = dict((k, keys.index(k)) for k in keys)

import json
print "Search.setIndex(" + json.dumps({"keys": keys, "values": values, "stations": stations}) + ");"
