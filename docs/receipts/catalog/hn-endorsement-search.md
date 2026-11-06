# Hacker News endorsement search

Date: 2026-11-06. Endpoint: `https://hn.algolia.com/api/v1/search`. No comment text or usernames were saved. The seed was not changed.

The seed items checked were the four Open Library works (`OL66554W`, `OL66513W`, `OL66562W`, `OL66534W`), the four LibriVox recordings (`lv:253`, `lv:86`, `lv:620`, `lv:219`), the shows Jane Austen Stories, A Jane Austen Year, and The Python Show, and the episode The Future of Python Security. A hit qualifies only when it positively recommends that exact item, by name or by link. A novel title alone is not the Open Library work and not the LibriVox recording. A show name is not the one seeded episode.

## Queries and hit counts

| Query | Scope | Hits |
|---|---|---|
| `librivox.org` | story URL | 14 |
| `librivox.org` | comment | 153 (first page read) |
| `pride-and-prejudice-by-jane-austen` | all | 13 |
| `emma-by-jane-austen` | all | 2 |
| `sense-and-sensibility-by-jane-austen` | all | 1 |
| `northanger-abbey-by-jane-austen` | all | 0 |
| `openlibrary.org/works/OL66554W` | all | 0 |
| `openlibrary.org/works/OL66513W` | all | 0 |
| `openlibrary.org/works/OL66562W` | all | 0 |
| `openlibrary.org/works/OL66534W` | all | 0 |
| `"The Python Show"` | all | 0 |
| `"Jane Austen Stories"` | all | 0 |
| `"A Jane Austen Year"` | all | 0 |
| `"Future of Python Security"` | all | 0 |
| `podcasts.apple.com the-python-show` | all | 0 |
| `id1840669662` | all | 0 |
| `id1788168257` | all | 0 |
| `id1691189730` | all | 0 |
| `1000797776212` | all | 0 |
| `librivox "pride and prejudice"` | comment | 3 |
| `librivox austen` | comment | 3 |
| `librivox.org/pride-and-prejudice` | all | 2 |
| `recommend "pride and prejudice"` | comment | 8 |
| `"pride and prejudice" audiobook` | comment | 2 |
| `"sense and sensibility" recommend` | comment | 3 |
| `"northanger abbey"` | comment | 5 |
| `"the python show" podcast` | all | 0 |
| `realpython podcast` | comment | 12 |
| `"Real Python Podcast"` | all | 6 |
| `Seth Larson python security podcast` | comment | 0 |

## Near misses that do not qualify

- Stories whose URL is `https://librivox.org/` or `/search` recommend the site, not one seeded recording. Examples: `29382006`, `23558686`, `44153738`.
- Comment `29930009` (2022-01-14, story `29915326`) is positive about reading the novel Pride and Prejudice. It does not link `https://openlibrary.org/works/OL66554W` or `https://librivox.org/pride-and-prejudice-by-jane-austen/`. The seed has both a book and a recording under that title, so the comment does not pick one item.
- Comment `39043286` recommends a narrator and says three Austen titles were sampled. It does not link a seeded LibriVox URL, and the seed does not record narrators.
- Comment `44153948` praises one narrator's Austen novels in general. It does not link a seeded recording.
- Comment `14854360` discusses Northanger Abbey and is not a positive recommendation.
- Comments `38114762` and `35222440` name The Real Python Podcast in a list. That show is not a seed item. The seeded episode title does not appear.
- Story `22655032` announces The Real Python Podcast. It is not the seeded episode.

No comment or story both named or linked one current seed item and was positive about that item. Nothing was attached.
