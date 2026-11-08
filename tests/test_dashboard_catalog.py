"""The dashboard catalog is the seed hackertube_core loads."""

import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VIEW = ROOT / "hackertube" / "dashboard" / "catalog_view.py"
SEED = ROOT / "hackertube" / "hackertube_core" / "seed" / "catalog.json"


def load_view_module():
    spec = importlib.util.spec_from_file_location("hackertube_catalog_view_test", VIEW)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class DashboardCatalogTest(unittest.TestCase):
    def setUp(self):
        self.view_module = load_view_module()

    def test_page_catalog_matches_the_core_seed(self):
        view = self.view_module.load_view()
        self.assertEqual(set(view), {"catalog"})
        self.assertNotIn("fixture", view)
        seed = json.loads(SEED.read_text(encoding="utf-8"))
        self.assertEqual(view["catalog"], seed)
        self.assertEqual(view["catalog"]["schema"], "hackertube.catalog/1")
        self.assertEqual(
            view["catalog"]["demo_question"],
            "What can I read or listen to by Jane Austen?",
        )

    def test_seed_shape_has_four_formats_and_no_hn_card(self):
        catalog = self.view_module.catalog_dict()
        formats = {}
        for item in catalog["items"]:
            self.assertFalse(item["item_id"].startswith("hn:"))
            self.assertNotEqual(item["format"], "hn")
            formats[item["format"]] = formats.get(item["format"], 0) + 1
        self.assertNotIn("video", formats)
        self.assertEqual(formats["book"], 4)
        self.assertEqual(formats["audiobook"], 4)
        self.assertEqual(formats["podcast_show"] + formats["podcast_episode"], 4)
        self.assertEqual(len(catalog["items"]), 12)
        self.assertEqual(
            [item["capture_order"] for item in catalog["items"]],
            list(range(1, 13)),
        )
        self.assertEqual(catalog["formats_may_be_empty"], ["videos"])
        unavailable = catalog["unavailable_videos"]
        self.assertEqual(len(unavailable), 3)
        for row in unavailable:
            self.assertEqual(set(row), {"video_id", "destination", "reason"})
            self.assertNotIn("title", row)
            self.assertTrue(row["destination"].startswith("https://www.youtube.com/watch?v="))
            self.assertIn(row["video_id"], row["destination"])
        endorsed = [
            row for row in catalog["evidence"]
            if row.get("display_line") == "Recommended in Hacker News"
            or row.get("endorsement") == "established"
        ]
        self.assertEqual(endorsed, [])


if __name__ == "__main__":
    unittest.main()
