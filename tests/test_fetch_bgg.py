import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import fetch_bgg  # noqa: E402

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


def fixture(name):
    with open(os.path.join(FIXTURES, name), "rb") as f:
        return f.read()


class ParseTests(unittest.TestCase):
    def test_collection(self):
        games = fetch_bgg.parse_collection(fixture("collection.xml"))
        self.assertEqual(set(games), {146228, 13})
        self.assertEqual(games[146228]["myRating"], 8.0)
        self.assertEqual(games[146228]["plays"], 3)
        self.assertIsNone(games[13]["myRating"])  # "N/A"

    def test_thing(self):
        things = fetch_bgg.parse_things(fixture("thing.xml"))
        g = things[146228]
        self.assertEqual((g["minPlayers"], g["maxPlayers"]), (3, 6))
        self.assertEqual((g["minTime"], g["maxTime"]), (120, 180))
        self.assertEqual(g["weight"], 3.46)
        self.assertEqual(g["bggRating"], 7.61)
        self.assertEqual(g["rank"], 2345)
        self.assertEqual(g["playerPoll"]["6"], {"best": 1, "rec": 4, "not": 11})
        self.assertIn("6+", g["playerPoll"])
        self.assertEqual(g["categories"], ["Economic"])

        catan = things[13]
        self.assertIsNone(catan["rank"])  # "Not Ranked"
        self.assertIsNone(catan["weight"])
        self.assertEqual(catan["playerPoll"], {})


if __name__ == "__main__":
    unittest.main()
