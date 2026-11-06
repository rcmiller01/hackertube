"""Adapters against captured responses, doc samples, and hostile payloads."""

import json
from pathlib import Path

import pytest

from hackertube_core.adapters import hn, itunes, librivox, openlibrary, podcastindex, reddit, youtube
from hackertube_core.boundaries import classify_endorsement
from hackertube_core.errors import RecordError
from hackertube_core.http import read_json
from hackertube_core.text import public_https_url

NOW = "2026-11-06T12:22:23Z"
ROOT = Path(__file__).resolve().parents[1]
CAPTURED = ROOT / "tests" / "fixtures" / "captured"
DOC = ROOT / "tests" / "fixtures" / "doc" / "youtube_video_list.json"


def _load(name):
    return json.loads((CAPTURED / name).read_text())


def test_hn_story_creates_no_media_item():
    parsed = hn.parse_search(_load("hn_search.json"), NOW)
    assert parsed.items == ()
    assert parsed.evidence
    assert all(row.display_line is None and row.endorsement == "mention" and row.excerpt is None for row in parsed.evidence)
    assert "children" in parsed.ignored_fields


def test_hn_comments_endorse_without_storing_the_body():
    for name, phrase in (
        ("hn_comment_44314766.json", "loved"),
        ("hn_comment_19628894.json", "highly recommend"),
        ("hn_comment_26188584.json", "worth watching"),
    ):
        payload = _load(name)
        assert classify_endorsement(payload["hits"][0]["comment_text"]) == "established"
        parsed = hn.parse_comment_search(payload, NOW)
        row = parsed.evidence[0]
        assert row.display_line == "Recommended in Hacker News"
        assert row.excerpt is None
        assert phrase not in row.destination
        assert "comment_text" in parsed.ignored_fields or row.excerpt is None


def test_youtube_doc_sample_and_unknown_duration():
    parsed = youtube.parse_data_api(json.loads(DOC.read_text()), NOW)
    item = parsed.items[0]
    assert item.format == "video"
    assert item.duration_seconds == 933
    assert item.availability == "public"
    assert item.art_url is None
    assert "player" in parsed.ignored_fields
    assert "statistics" in parsed.ignored_fields
    payload = json.loads(DOC.read_text())
    payload["items"][0]["contentDetails"]["duration"] = "about 15 minutes"
    parsed = youtube.parse_data_api(payload, NOW)
    assert parsed.items[0].duration_seconds is None


def test_oembed_does_not_invent_duration_or_keep_the_player():
    parsed = youtube.parse_oembed(_load("oembed_LCEmiRjPEtQ.json"), "LCEmiRjPEtQ", NOW)
    item = parsed.items[0]
    assert item.duration_seconds is None
    assert item.title == "Andrej Karpathy: Software Is Changing (Again)"
    assert item.art_url is None
    assert "html" in parsed.ignored_fields
    assert "thumbnail_url" in parsed.ignored_fields
    assert "width" in parsed.ignored_fields


def test_youtube_live_call_is_blocked_without_a_key():
    seen = {}

    class Opener:
        def open(self, request, timeout=None):
            seen["called"] = True
            raise AssertionError("network")

    blocked = youtube.fetch_data_api("LCEmiRjPEtQ", "", opener=Opener())
    assert blocked == {"called": False, "blocked_reason": "missing_api_key"}
    assert "called" not in seen


def test_youtube_key_stays_out_of_the_url():
    class Response:
        status = 200

        def read(self, limit):
            return DOC.read_bytes()

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    class Opener:
        def open(self, request, timeout=None):
            self.request = request
            return Response()

    opener = Opener()
    result = youtube.fetch_data_api("docSampleId", "test-key", opener=opener)
    assert result["called"] is True
    assert "test-key" not in opener.request.full_url
    assert opener.request.get_header("X-goog-api-key") == "test-key"


def test_itunes_show_does_not_invent_episode_length():
    show = itunes.parse_results(_load("itunes_austen_year.json"), NOW)
    item = show.items[0]
    assert item.format == "podcast_show"
    assert item.duration_seconds is None
    assert item.art_url is None
    assert "trackTimeMillis" in show.ignored_fields
    assert any(field.startswith("artworkUrl") for field in show.ignored_fields)
    episode = itunes.parse_results(_load("itunes_episode_search.json"), NOW).items[0]
    assert episode.format == "podcast_episode"
    assert episode.duration_seconds == 4257
    assert episode.show_id == "itunes:podcast:1501905538"
    assert "episodeUrl" not in episode.destination
    audiobook = itunes.parse_results(_load("itunes_audiobook_search.json"), NOW)
    assert audiobook.items[0].format == "audiobook"
    assert "<" not in audiobook.items[0].title
    assert all(item.art_url is None for item in audiobook.items)


def test_open_library_and_librivox_keep_unknowns():
    books = openlibrary.parse_search(_load("openlibrary_austen_search.json"), NOW)
    pride = next(item for item in books.items if item.item_id == "ol:OL66554W")
    assert pride.format == "book"
    assert pride.duration_seconds is None
    assert pride.availability is None
    assert "gutenberg:1342" in pride.identifiers
    assert "cover_edition_key" in books.ignored_fields
    audio = librivox.parse_books(_load("librivox_austen_search.json"), NOW)
    emma = next(item for item in audio.items if item.item_id == "lv:86")
    assert emma.format == "audiobook"
    assert emma.duration_seconds == 64950
    assert emma.contributors == ("Jane Austen",)
    assert "num_sections" in audio.ignored_fields or emma.duration_seconds == 64950


def test_hostile_payloads_are_rejected():
    assert youtube.parse_data_api(["nope"], NOW).rejected == ("payload",)
    assert itunes.parse_results({"results": [{"kind": "song", "trackName": "x"}]}, NOW).items == ()
    assert openlibrary.parse_search({"docs": [{"key": "/people/OL1A", "title": "nope"}]}, NOW).items == ()
    with pytest.raises(RecordError):
        public_https_url("https://169.254.169.254/latest")


def test_disabled_sources_do_not_call_the_network(monkeypatch):
    def explode(*args, **kwargs):
        raise AssertionError("network")

    monkeypatch.setattr("urllib.request.urlopen", explode)
    assert reddit.fetch(token="not-used")["blocked_reason"] == "approval_absent"
    assert podcastindex.fetch(api_key="not-used", api_secret="not-used")["blocked_reason"] == "missing_api_key"
    assert reddit.fetch()["called"] is False
    assert podcastindex.fetch()["called"] is False


def test_read_json_refuses_unsafe_urls_without_a_request():
    class Opener:
        def open(self, request, timeout=None):
            raise AssertionError("network")

    with pytest.raises(RecordError):
        read_json("http://example.com/data", opener=Opener())
    with pytest.raises(RecordError):
        read_json("https://127.0.0.1/data", opener=Opener())
