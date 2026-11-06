"""Adapters against captured responses, doc samples, and hostile payloads."""

import json
from pathlib import Path

import pytest

from hackertube_core.adapters import hn, itunes, librivox, openlibrary, podcastindex, reddit, youtube
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


def test_endorsement_attaches_only_to_the_linked_video():
    wrong = _load("hn_comment_26188584.json")
    missed = hn.parse_verified_comment(wrong, "gm0b_ijaYMQ", NOW)
    assert missed.evidence == ()
    assert missed.rejected == ("different-item:W0NakShgbHY",)
    matched = hn.parse_verified_comment(wrong, "W0NakShgbHY", NOW)
    assert matched.evidence[0].item_id == "youtube:W0NakShgbHY"
    assert matched.evidence[0].display_line == "Recommended in Hacker News"
    assert matched.evidence[0].excerpt is None
    karpathy = hn.parse_verified_comment(_load("hn_comment_44314766.json"), "LCEmiRjPEtQ", NOW)
    assert karpathy.evidence[0].item_id == "youtube:LCEmiRjPEtQ"
    assert hn.parse_verified_comment(_load("hn_comment_44314766.json"), "gm0b_ijaYMQ", NOW).evidence == ()
    unverified = dict(wrong)
    unverified["hand_verified"] = False
    assert hn.parse_verified_comment(unverified, "W0NakShgbHY", NOW).evidence == ()


def test_hn_fixtures_do_not_keep_comment_text_or_usernames():
    for path in CAPTURED.glob("hn_*.json"):
        text = path.read_text()
        assert "comment_text" not in text
        assert "author" not in text
        assert "loved the analogies" not in text
        assert "michaelwilson" not in text


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


def test_oembed_fetch_is_disabled():
    seen = {}

    class Opener:
        def open(self, request, timeout=None):
            seen["called"] = True
            raise AssertionError("network")

    blocked = youtube.fetch_oembed("LCEmiRjPEtQ", opener=Opener())
    assert blocked == {"called": False, "enabled": False, "blocked_reason": "unresolved-terms"}
    assert "called" not in seen
    from hackertube_core.adapters import REGISTRY

    assert REGISTRY["youtube"]["blocked_reason"] == "unresolved-terms"
    assert REGISTRY["youtube"]["enabled"] is False


def test_oembed_parser_keeps_thirty_day_expiry_for_later():
    parsed = youtube.parse_oembed(_load("oembed_LCEmiRjPEtQ.json"), "LCEmiRjPEtQ", NOW)
    item = parsed.items[0]
    assert item.duration_seconds is None
    assert item.art_url is None
    assert parsed.evidence[0].refresh_after == "2026-12-06T12:22:23Z"
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
