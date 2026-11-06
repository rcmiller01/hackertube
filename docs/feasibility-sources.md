# Source feasibility

Checked November 6, 2026. This file records live reads, display terms, and the frozen demo seed. It is not legal clearance. The receipt for these probes is the captured responses under `tests/fixtures/captured/` and the normalized seed in `hackertube_core/seed/catalog.json`.

Robert confirmed the catalog rule: Hacker News is evidence on a media card only. There is no Hacker News media type and no Hacker News card.

The demo question the seed can answer is: **What can I read or listen to by Jane Austen?** Books, audiobooks, and two podcast shows match. Videos may come back empty. The Python show and the Python episode stay in the podcast section for browsing and do not match that question.

## Live reads

No API key was stored. Reddit was not requested. One unauthenticated YouTube Data API call returned no video resource.

| Source | Request | Result |
|---|---|---|
| Hacker News Algolia | `GET https://hn.algolia.com/api/v1/search` for story `44314423` and the three comment queries below | HTTP 200. Story and comment records saved. Rate limit on the [API page](https://hn.algolia.com/api) is 10,000 requests per IP per hour. |
| YouTube Data API | `GET https://www.googleapis.com/youtube/v3/videos?part=snippet&id=jNQXAC9IVRw` with no key | HTTP 403. Body: "Method doesn't allow unregistered callers (callers without established identity)." Saved as `youtube_videos_list_error.json`. Not a metadata receipt. |
| YouTube oEmbed | `GET https://www.youtube.com/oembed?format=json` for `LCEmiRjPEtQ`, `Dr20f19czeE`, and `gm0b_ijaYMQ` | HTTP 200 at 12:22:23 UTC. Titles and channel names only. Player HTML and thumbnail URLs were not copied into the seed. |
| Apple iTunes Search | lookup and search URLs in `tests/fixtures/captured/manifest.json` | HTTP 200. Shows and one episode. |
| Podcast Index | `GET https://api.podcastindex.org/api/1.0/search/byterm?q=python` with no key | HTTP 401. Body says the Authorization header is blank. Adapter does not send another request. |
| Open Library | `GET https://openlibrary.org/search.json?q=jane+austen` | HTTP 200 at 12:22:21 UTC. |
| LibriVox | author search plus four `coverart=1` record reads | HTTP 200 at 12:22:21 UTC. |
| Reddit | none | Disabled. No live call. |

YouTube oEmbed is not the Data API. No YouTube page was found that says responses from `https://www.youtube.com/oembed` may be stored as catalog metadata. The seed therefore keeps only the title and channel name, drops player HTML and thumbnails, and expires those fields after 30 days. That window is the non-authorized metadata ceiling in the developer policies, applied here because a longer oEmbed grant was not found. It is not a claim that oEmbed is YouTube API Data. The Data API adapter still refuses to call `videos.list` unless a key is passed into that function.

## Quota and YouTube terms

The [quota calculator](https://developers.google.com/youtube/data/determine_quota_cost), last updated 2026-11-03 UTC, says projects get 100 `search.list` calls per day, 100 `videos.insert` calls per day, and 10,000 units per day for the other endpoints. `search.list` and `videos.insert` each cost 1 in their own bucket. `videos.list` costs 1 unit. Every request, including an invalid one, costs at least one point. Daily quotas reset at midnight Pacific Time. `docs/sources.md` matches this page. The older v3 quota URL redirects here.

[Developer Policies](https://developers.google.com/youtube/terms/developer-policies) section III.E, as retrieved November 6, 2026:

- Do not download, import, backup, cache, or store YouTube audiovisual content without written approval.
- Non-authorized API data may be stored only as long as needed and no longer than 30 calendar days, then deleted or refreshed.
- Statistics retrieved as non-authorized data follow that 30-day limit. This adapter does not request `statistics`.
- Stored data related to a user must be deletable and removed within 7 calendar days of a user request. The demo path does not request authorized user data.
- On loss of access, API data must be deleted. Revocation deletions must happen within 30 days of the user revoking consent.

[API Services Terms](https://developers.google.com/youtube/terms/api-services-terms-of-service) section 10.3 requires attribution that follows the YouTube Branding Guidelines when YouTube brand features are used. Seeded video cards link to `https://www.youtube.com/watch?v={id}` and name YouTube. They do not store the embed iframe.

Those oEmbed evidence rows carry `refresh_after`. When that time is reached, the video card drops even if a Hacker News link is still present, because a card needs unexpired catalog evidence.

## Obligations

| Source | Attribution and display | Retention | Deletion | Seed decision |
|---|---|---|---|---|
| [Hacker News Algolia](https://hn.algolia.com/api) | The API page documents search and item reads and the hourly cap. It states no reuse license, so `design.md` does not allow storing comment content. The display line is our text, `Recommended in Hacker News`, and only when a hand-verified fixture names that exact video URL. | Comment id, permalink, retrieval time, and the display line. Fixtures do not keep comment text, highlights, or usernames. | No deletion API was found. Comment text is not stored. | Enabled for that narrow evidence. Not a format. |
| [YouTube Data API](https://developers.google.com/youtube/terms/developer-policies) and [terms](https://developers.google.com/youtube/terms/api-services-terms-of-service) | Link to the watch page and name YouTube. Do not download audiovisual content. oEmbed has no cited storage grant, so the same 30-day ceiling is used for the title and channel only. | Title and channel. No statistics, player HTML, or thumbnails. | Delete or refresh the stored title and channel within 30 calendar days. | Data API live call blocked on a missing key. |
| [Apple iTunes Search API](https://performance-partners.apple.com/search-api) | The page says the API is for placing search fields and displaying results, and for ID lookups that map a library to the store. Promotional content, including album art, may be used only to promote the associated store content, next to an approved store badge, and not as independent entertainment. Song and music-video previews must be attributed "provided courtesy of iTunes" and must be streamed, not downloaded or cached. | Text identity fields are kept with `retrieved_at`. No maximum text-retention period was stated. Apple recommends caching for large sites. | Remove promotional assets immediately if Apple asks. None are stored. | Enabled for show and episode identity. Artwork omitted. |
| [Podcast Index terms v2.0](https://api.podcastindex.org/tos_v2.0.html) (effective October 4, 2026) | Free for lawful use, including commercial use. Do not proxy the API or scrape it for bulk data. Requests need a key, a secret, and an honest User-Agent. Rate limits are unpublished. | Nothing stored. | Nothing stored. | Blocked. The no-key probe returned HTTP 401. |
| [Open Library APIs](https://openlibrary.org/developers/api) and [data FAQ](https://openlibrary.org/help/faq/using) | Catalog data is dedicated to the public domain; contributions are requested under [CC0](https://creativecommons.org/publicdomain/zero/1.0/). Identify the app. Unidentified calls are limited to 1 per second; identified calls, 3 per second. Do not use the API as a bulk backend. [Cover guidance](https://openlibrary.org/dev/docs/api/covers) asks for hotlinked images, no cover crawling, and a courtesy link. | Metadata may be cached. Cover files are not cached. | No deletion window for CC0 metadata. | Enabled. Registration is requested by Open Library and has not been submitted. |
| [LibriVox API](https://librivox.org/api/info), [About](https://librivox.org/pages/about-librivox/), and the [September 16, 2026 update](https://librivox.org/2026/09/16/librivox-api-update/) | The About page dedicates recordings to the public domain. The API names `coverart_jpg` as a URL and does not grant display or hotlinking of cover images. Cards are text and link to the catalog page. | Metadata is kept. Audio files and cover files are not stored. | No deletion window was stated for the recordings. | Enabled for four recordings. Covers are not shown. |
| [Reddit Data API terms](https://redditinc.com/policies/data-api-terms) and the [Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy) | Not re-fetched this lane. `docs/sources.md` records the November 5 read: OAuth, explicit approval, scoped subreddits, no model training, and limited display. | Would be short-lived and only after approval. The wiki recommends deleting stored user content within about 48 hours. | Nothing is stored. | Disabled. `reddit.fetch` sends no request. |

## Art

Missing art is allowed. A URL is stored only when the source terms allow a hotlink, caching is not allowed, and a GET on November 6, 2026 returned `image/jpeg`.

| Records | Hotlink | Cache | Check |
|---|---|---|---|
| Four Open Library books | Yes. Courtesy link is the work page. | No | HTTP 200, `image/jpeg`, 8–32 KB |
| Four LibriVox recordings | No. An API URL and an HTTP 200 are not a display license. The About page covers the recordings, not the cover images. | No | Not displayed |
| Three YouTube videos | No. Thumbnail URLs from oEmbed were not copied. | No | Not displayed |
| Four Apple podcasts | No. Artwork needs an approved store badge beside it. This package has no badge. | No | Not displayed |

## Frozen seed

Capture order is the feed order. Times are the HTTP `Date` of the capture that supplied the record.

| Order | Format | Record | Catalog capture |
|---|---|---|---|
| 1 | video | Andrej Karpathy: Software Is Changing (Again) | oEmbed 12:22:23 UTC. Hand-verified comment `44314766` names `LCEmiRjPEtQ`. |
| 2 | video | Breakthrough discovery in astronomy: first ever image of a black hole | oEmbed 12:22:23 UTC. Hand-verified comment `19628894` names `Dr20f19czeE`. |
| 3 | video | Watch NASA’s Perseverance Rover Land on Mars! | oEmbed 12:22:23 UTC. No Hacker News line. Comment `26188584` names `W0NakShgbHY`, not this video. |
| 4 | podcast show | Jane Austen Stories | iTunes lookup 12:22:22 UTC |
| 5 | podcast show | A Jane Austen Year | iTunes lookup 12:22:22 UTC. `trackTimeMillis` of 1422 is ignored. |
| 6 | podcast show | The Python Show | iTunes lookup 12:24:15 UTC. `trackTimeMillis` of 2571 is ignored. |
| 7 | podcast episode | The Future of Python Security | iTunes search 12:24:15 UTC. Duration 4257 seconds from `trackTimeMillis` 4257000. |
| 8–11 | book | Pride and Prejudice, Emma, Sense and Sensibility, Northanger Abbey | Open Library search 12:22:21 UTC. CC0 catalog metadata. |
| 12–15 | audiobook | The LibriVox recording with the lowest id that shares a Project Gutenberg id with that book | LibriVox author search 12:22:21 UTC. Durations are `totaltimesecs`: 47204, 64950, 43869, 29522. |

Show duration stays unknown. Video duration stays unknown. Book duration stays unknown. Nothing is estimated from a comment, a section count, or a show-level `trackTimeMillis`.

Edition links, one per shared Gutenberg id: 1342, 158, 161, and 121. The book and the recording stay separate items.

## Record schema

`hackertube.catalog/1` in `hackertube_core/seed/catalog.json`.

Media item: `item_id`, `format` (`video`, `podcast_episode`, `podcast_show`, `book`, `audiobook`), `title`, `destination`, `contributors`, `duration_seconds`, `availability`, `identifiers`, `show_id`, `capture_order`, `captured_at`, `art_url`, `art_hotlink`, `art_cache`, `art_reason`, `art_checked_at`, `art_http_status`.

Evidence: `evidence_id`, `item_id`, `source_id`, `retrieved_at`, `destination`, `excerpt`, `endorsement` (`established`, `mention`, `criticism`, `none`, `not_applicable`), `kind` (`community`, `catalog`, `web`), `display_line`, `refresh_after`.

The only allowed `display_line` is `Recommended in Hacker News`. It requires `source_id` `hn`, `kind` `community`, `endorsement` `established`, and an https comment URL. Endorsement is established only when the fixture sets `hand_verified` and its `endorsed_url` is that video. Keyword praise is not enough. A story hit stays a mention and creates no media item.

Source: `source_id`, `name`, `role`, `enabled`, `blocked_reason`, `attribution`, `retention`, `deletion`, `refresh_after`, `last_success_at`, `last_error`, `formats`.

Edition: `work_id`, `book_item_id`, `audio_item_id`.

## Adapter contract

Ignored fields stay out of the item. In particular:

- YouTube Data API: description, tags, statistics, player HTML, and published time are ignored. Duration is parsed only from ISO 8601 `contentDetails.duration`. A private video is rejected. The doc-shaped sample is `tests/fixtures/doc/youtube_video_list.json`, not a live response.
- YouTube oEmbed: `html`, `thumbnail_url`, `width`, and `height` are ignored. Height and width are not a duration.
- Hacker News: the stored fixture is an id, timestamps, the comment URL, and `endorsed_url` with `hand_verified`. Comment text and usernames are not in the fixture. The line is attached only when that URL is the card's video.
- iTunes: artwork, preview, and episode media URLs are ignored. Show rows do not read `trackTimeMillis`.
- Open Library: `first_publish_year`, `edition_count`, and the cover key are not metadata of the work's length or availability. The cover key is used only to build a hotlink after the image check.
- LibriVox: `num_sections` and `copyright_year` are not a duration and not an availability flag.
- Podcast Index and Reddit: no parser output. Both fetch functions return a blocked result and do not open a socket.

Package `hackertube_core` uses the Python standard library only. It does not register a Hermes manifest, dashboard, or route.
