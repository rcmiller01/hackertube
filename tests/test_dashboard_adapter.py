"""Shape checks for the dashboard catalog fixture adapter."""

import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ADAPTER = ROOT / "hackertube" / "dashboard" / "catalog_adapter.py"


def load_adapter():
    spec = importlib.util.spec_from_file_location("hackertube_catalog_adapter_test", ADAPTER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class CatalogAdapterTest(unittest.TestCase):
    def setUp(self):
        self.adapter = load_adapter()

    def test_view_is_marked_fixture(self):
        view = self.adapter.load_view()
        self.assertTrue(view["fixture"])
        self.assertEqual(view["catalog"]["schema"], "hackertube.catalog/1")

    def test_seed_shape_has_four_formats_and_no_hn_card(self):
        catalog = self.adapter.load_catalog()
        self.assertEqual(catalog["demo_question"], "What can I read or listen to by Jane Austen?")
        formats = {}
        for item in catalog["items"]:
            self.assertFalse(item["item_id"].startswith("hn:"))
            self.assertNotEqual(item["format"], "hn")
            formats[item["format"]] = formats.get(item["format"], 0) + 1
        self.assertEqual(formats["video"], 3)
        self.assertEqual(formats["book"], 4)
        self.assertEqual(formats["audiobook"], 4)
        self.assertEqual(formats["podcast_show"] + formats["podcast_episode"], 4)
        self.assertEqual(len(catalog["items"]), 15)
        endorsed = [
            row for row in catalog["evidence"]
            if row.get("display_line") == "Recommended in Hacker News"
        ]
        self.assertEqual(len(endorsed), 3)
        self.assertTrue(all(row["source_id"] == "hn" and row["endorsement"] == "established" for row in endorsed))


if __name__ == "__main__":
    unittest.main()
