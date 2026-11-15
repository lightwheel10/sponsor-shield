import io
import json
import unittest
import urllib.error

from shield.detector import DeepSeekClient, DetectionFailed, Usage, clean_parts, find_sponsors

LINES = ((0.0, "hi"), (10.0, "this video is sponsored by Acme"), (25.0, "use code X"), (40.0, "back to the video"), (300.0, "bye"))


def reply(content, prompt_tokens=1000, output_tokens=100):
    return {"choices": [{"message": {"content": content}}],
            "usage": {"prompt_tokens": prompt_tokens, "prompt_cache_hit_tokens": 0,
                      "prompt_cache_miss_tokens": prompt_tokens, "completion_tokens": output_tokens}}


class ScriptedDeepSeek:
    """Plays back a list of replies (or exceptions) and records each prompt."""

    def __init__(self, *replies):
        self.replies = list(replies)
        self.prompts = []

    def __call__(self, url, body, headers, timeout):
        self.prompts.append(body["messages"][0]["content"])
        assert headers["Authorization"] == "Bearer secret-key"
        item = self.replies.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


def client(fake):
    return DeepSeekClient("secret-key", post_json=fake, sleep=lambda seconds: None)


class DeepSeekClientTests(unittest.TestCase):
    def test_empty_reply_is_retried(self):
        fake = ScriptedDeepSeek(reply(""), reply('{"sponsors": []}'))
        usage = Usage()
        self.assertEqual(client(fake).ask_json("p", usage, 100), {"sponsors": []})
        self.assertEqual(len(fake.prompts), 2)
        self.assertEqual(usage.cache_miss_tokens, 2000)  # Both calls are paid for.

    def test_gives_up_after_three_bad_replies_and_reports_cost(self):
        fake = ScriptedDeepSeek(reply(""), reply("[]"), reply("not json"))
        with self.assertRaises(DetectionFailed) as caught:
            client(fake).ask_json("p", Usage(), 100)
        self.assertGreater(caught.exception.cost_usd, 0)
        self.assertNotIn("secret-key", str(caught.exception))

    def test_bad_key_is_not_retried(self):
        error = urllib.error.HTTPError("u", 401, "no", {}, io.BytesIO(b""))
        fake = ScriptedDeepSeek(error, reply("{}"))
        with self.assertRaises(DetectionFailed):
            client(fake).ask_json("p", Usage(), 100)
        self.assertEqual(len(fake.prompts), 1)

    def test_server_error_is_retried(self):
        error = urllib.error.HTTPError("u", 503, "busy", {}, io.BytesIO(b""))
        fake = ScriptedDeepSeek(error, reply('{"ok": 1}'))
        self.assertEqual(client(fake).ask_json("p", Usage(), 100), {"ok": 1})


class CleanPartsTests(unittest.TestCase):
    def test_keeps_good_parts_merges_overlaps_and_drops_junk(self):
        raw = [
            {"start": 30, "end": 50, "brand": "B"},
            {"start": 10, "end": 35, "brand": "A"},
            {"start": 80, "end": 70, "brand": "backwards"},
            {"start": "1", "end": 5, "brand": "text time"},
            {"start": True, "end": 5},
            "junk",
            {"start": -5, "end": 2, "brand": None},
            {"start": 90, "end": 99999, "brand": "  long\nname  "},
        ]
        self.assertEqual(clean_parts(raw, video_end=120), [
            {"start": 0.0, "end": 2.0, "brand": "Sponsor"},
            {"start": 10.0, "end": 50.0, "brand": "A"},
            {"start": 90.0, "end": 120.0, "brand": "long name"},
        ])

    def test_not_a_list_gives_nothing(self):
        self.assertEqual(clean_parts({"start": 1}, 100), [])


class FindSponsorsTests(unittest.TestCase):
    def test_flag_then_check(self):
        fake = ScriptedDeepSeek(
            reply(json.dumps({"sponsors": [{"start": 10, "end": 40, "brand": "Acme"}, {"start": 300, "end": 310, "brand": "Bye"}]})),
            reply(json.dumps({"parts": [{"start": 10, "end": 40, "brand": "Acme"}], "why": "Bye is not paid."})))
        result = find_sponsors(client(fake), "Title", LINES, "desc", None)
        self.assertEqual(result.parts, [{"start": 10.0, "end": 40.0, "brand": "Acme"}])
        self.assertEqual(result.why, "Bye is not paid.")
        self.assertEqual(len(fake.prompts), 2)
        self.assertNotIn("desc", fake.prompts[0])  # First pass never sees the description.
        self.assertIn("* [10.0] this video is sponsored by Acme", fake.prompts[1])
        self.assertIn("  [0.0] hi", fake.prompts[1])  # Context around the flag is shown unmarked.

    def test_nothing_found_and_no_paid_label_is_one_call(self):
        fake = ScriptedDeepSeek(reply('{"sponsors": []}'))
        self.assertEqual(find_sponsors(client(fake), "T", LINES, "d", False).parts, [])
        self.assertEqual(len(fake.prompts), 1)

    def test_paid_label_with_nothing_found_uses_the_description(self):
        fake = ScriptedDeepSeek(
            reply('{"sponsors": []}'),
            reply('{"sponsors": [{"start": 10, "end": 40, "brand": "Acme"}]}'),
            reply('{"parts": [{"start": 10, "end": 40, "brand": "Acme"}]}'))
        result = find_sponsors(client(fake), "T", LINES, "Get Acme with my link", True)
        self.assertEqual(len(result.parts), 1)
        self.assertIn("Get Acme with my link", fake.prompts[1])
        self.assertIn("YouTube paid-promotion label: on", fake.prompts[1])

    def test_check_cannot_add_parts_outside_the_flags(self):
        fake = ScriptedDeepSeek(
            reply('{"sponsors": [{"start": 10, "end": 40, "brand": "Acme"}]}'),
            reply('{"parts": [{"start": 10, "end": 40, "brand": "Acme"}, {"start": 200, "end": 300, "brand": "Made up"}]}'))
        self.assertEqual([part["brand"] for part in find_sponsors(client(fake), "T", LINES, "", None).parts], ["Acme"])

    def test_failed_check_fails_the_whole_detection(self):
        # Unchecked flags caused most wrong flags in testing, so never keep them.
        fake = ScriptedDeepSeek(reply('{"sponsors": [{"start": 10, "end": 40, "brand": "Acme"}]}'),
                                reply(""), reply(""), reply(""))
        with self.assertRaises(DetectionFailed):
            find_sponsors(client(fake), "T", LINES, "", None)

    def test_transcript_text_cannot_break_the_prompt_template(self):
        tricky = ((0.0, "$title $lines ${description}"), (5.0, "{\"sponsors\": []}"))
        fake = ScriptedDeepSeek(reply('{"sponsors": []}'))
        find_sponsors(client(fake), "Real $title", tricky, "", None)
        self.assertIn("[0.0] $title $lines ${description}", fake.prompts[0])
        self.assertIn("Video title: Real $title", fake.prompts[0])


if __name__ == "__main__":
    unittest.main()
