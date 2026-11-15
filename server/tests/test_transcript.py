import json
import unittest

from shield.transcript import BadSubmission, parse_submission

from helpers import payload


class ParseSubmissionTests(unittest.TestCase):
    def test_accepts_a_normal_submission_and_cleans_it(self):
        raw = payload(lines=[[12.34, "  two\n words "], [1, "first"], [5, "   "]], paid=True)
        submission = parse_submission(raw)
        self.assertEqual(submission.lines, ((1.0, "first"), (12.3, "two words")))  # sorted, cleaned, blank dropped
        self.assertIs(submission.paid_label, True)
        self.assertEqual(submission.last_line_seconds, 12.3)

    def test_same_inputs_give_same_hash_whatever_the_order_or_install(self):
        a = parse_submission(payload(lines=[[1, "a"], [2, "b"]], install="install-aaaaaaaaaaaa"))
        b = parse_submission(payload(lines=[[2, "b"], [1, "a"]], install="install-bbbbbbbbbbbb"))
        self.assertEqual(a.transcript_hash, b.transcript_hash)

    def test_description_and_label_change_the_hash(self):
        # A fake description must not be able to ride on the real captions.
        base = parse_submission(payload())
        self.assertNotEqual(base.transcript_hash, parse_submission(payload(description="fake sponsor link")).transcript_hash)
        self.assertNotEqual(base.transcript_hash, parse_submission(payload(paid=True)).transcript_hash)
        self.assertNotEqual(base.transcript_hash, parse_submission(payload(video="abcdefghijk")).transcript_hash)

    def test_rejects_bad_input(self):
        bad = [
            "not an object",
            payload(video="short"),
            payload(video="../../etc/pa"),
            payload(install="tiny"),
            payload(language="english please"),
            payload(lines=[]),
            payload(lines=[["10", "time as text"]]),
            payload(lines=[[True, "boolean time"]]),
            payload(lines=[[-1, "negative"]]),
            payload(lines=[[float("nan"), "nan"]]),
            payload(lines=[[99999999, "too late"]]),
            payload(lines=[[1, "x" * 1001]]),
            payload(lines=[[1, 5]]),
            payload(lines=[[1, "   "]]),
            payload(lines=[[1, "a", "extra"]]),
            payload(lines=[[i, "y" * 1000] for i in range(901)]),
            payload(description=["not text"]),
            payload(paid="yes"),
        ]
        for raw in bad:
            with self.subTest(raw=str(raw)[:80]):
                with self.assertRaises(BadSubmission):
                    parse_submission(raw)

    def test_nan_from_real_json_is_rejected(self):
        raw = json.loads('{"videoId":"dQw4w9WgXcQ","installId":"install-aaaaaaaaaaaa","language":"en","lines":[[NaN,"x"]]}')
        with self.assertRaises(BadSubmission):
            parse_submission(raw)

    def test_long_description_is_cut_not_rejected(self):
        self.assertEqual(len(parse_submission(payload(description="d" * 9000)).description), 5000)


if __name__ == "__main__":
    unittest.main()
