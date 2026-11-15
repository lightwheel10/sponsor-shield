"""Finds paid sponsor parts in a transcript with DeepSeek: the 3-step method.

1. First pass: read the whole transcript and mark anything that looks like a
   paid sponsor part. (No description here: in testing, giving it the
   description caused many wrong flags.)
2. Fallback: if YouTube's paid-promotion label is on but step 1 found
   nothing, look again with the description, which often reveals sponsors
   that never say the word "sponsor".
3. Second check: show the AI every flag at once, with 45 seconds of context
   around each, plus the description, and keep only the truly paid parts.

These prompts are the exact ones from the 14 Nov 2026 tests (22/22 sponsor
parts found on unseen videos, 0 wrong flags once empty replies are retried).
"""
import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from string import Template

API_URL = "https://api.deepseek.com/chat/completions"
MODEL = "deepseek-flash"
# Peak prices in US dollars per million tokens (DeepSeek pricing page, 14 Nov
# 2026). Off-peak is half price, so using peak prices over-counts, which is
# the safe direction for the daily budget.
PRICE_PER_MILLION = {"cache_hit": 0.006, "cache_miss": 0.30, "output": 1.20}
CONTEXT_SECONDS = 45
MAX_BRAND_CHARS = 80
MAX_PARTS = 40

FIRST_PASS_PROMPT = Template("""Below is the transcript of a YouTube video, one caption line per row, each starting with its time in seconds.

Find every PAID SPONSOR part: anywhere the creator talks about a company or product because that company paid or sponsored them. This includes:
- full ad reads ("this video is sponsored by", "thanks to X for sponsoring", discount codes, "link below"), including the lead-in sentence that transitions into them;
- short sponsor mentions on their own, even a single sentence, e.g. an early "our sponsor today is X, more on them later".
Do NOT count: the creator's own products, store, merch, Patreon, courses or channel plugs; products the video itself is reviewing or discussing; parody or made-up ads, or ads the creator says fell through or were cancelled, because no company actually paid for them.

If the sponsor talk is interrupted by normal video content, return each sponsor part separately. Never include normal content inside a sponsor part.

For each part give start = time of the first line of the part, end = time of the first line AFTER the part ends (when normal content resumes), and the brand.
Reply with only JSON: {"sponsors": [{"start": 0.0, "end": 0.0, "brand": "..."}]}  (empty list if there are none)

Video title: $title

Transcript:
$lines""")

DESCRIPTION_PASS_PROMPT = Template("""Below is the transcript of a YouTube video, one caption line per row, each starting with its time in seconds.

Find every PAID SPONSOR part: anywhere the creator talks about a company or product because that company paid or sponsored them. This includes:
- full ad reads ("this video is sponsored by", "thanks to X for sponsoring", discount codes, "link below"), including the lead-in sentence that transitions into them;
- short sponsor mentions on their own, even a single sentence, e.g. an early "our sponsor today is X, more on them later".
Do NOT count: the creator's own products, store, merch, Patreon, courses or channel plugs; products the video itself is reviewing or discussing; parody or made-up ads, or ads the creator says fell through or were cancelled, because no company actually paid for them.
Also do NOT count: a brand only thanked for lending or sending the product the video reviews; other people in the video (shop staff, guests, friends, family) describing or recommending a product, unless it is said to be paid.
Only report a part if its brand is actually named in the transcript or the description. Never guess or invent a brand name.
The video description and YouTube's paid-promotion label are given below. A paid sponsor may never say the word "sponsor": a segment about a product that the description links with a referral/affiliate/discount link or promotes at the top, especially when the paid-promotion label is on, is a sponsor part. The label only says that something in the video is paid, not where.

If the sponsor talk is interrupted by normal video content, return each sponsor part separately. Never include normal content inside a sponsor part.

For each part give start = time of the first line of the part, end = time of the first line AFTER the part ends (when normal content resumes), and the brand.
Reply with only JSON: {"sponsors": [{"start": 0.0, "end": 0.0, "brand": "..."}]}  (empty list if there are none)

Video title: $title
YouTube paid-promotion label: $paid_label
Video description:
$description

Transcript:
$lines""")

CHECK_PROMPT = Template("""A first pass flagged the transcript lines marked with * below (from one YouTube video) as possible PAID SPONSOR parts. Several excerpts from the same video may be shown; read them all together, because a disclosure in one (e.g. "this video is sponsored by X") also explains a short reminder about X in another. Check each flag carefully: it may be wrong, or its edges may include normal content.

A paid sponsor part is where the creator talks about a company or product because that company paid them: ad reads, sponsor shout-outs (even one sentence, like "our sponsor today is X"), and paid integrations that may never say the word "sponsor" (the description or YouTube's paid-promotion label can reveal those).
NOT paid sponsor parts: the creator's own products, store, merch, Patreon, courses or channel plugs; products the video reviews or discusses as its normal content; a brand only thanked for lending or sending the product being reviewed; other people in the video (shop staff, guests, friends, family) talking about a product; casually using or mentioning a product in normal conversation, even if that brand sponsors the channel elsewhere; shopping or affiliate links on their own; parody, made-up or cancelled ads.
The brand must be named in the excerpt or the description. Never invent a brand.

Return only the truly paid parts inside these excerpts, with exact edges: start = time of the first line of the part, end = time of the first line after it (when normal content resumes). Return an empty list if none of the flagged lines are a paid sponsor part.
Reply with only JSON: {"parts": [{"start": 0.0, "end": 0.0, "brand": "..."}], "why": "one short sentence"}

Video title: $title
YouTube paid-promotion label: $paid_label
Video description:
$description

Transcript excerpts (time in seconds):
$excerpts""")


class DetectionFailed(RuntimeError):
    """The AI could not give a usable answer. Carries what was spent anyway."""

    def __init__(self, message, cost_usd=0.0):
        super().__init__(message)
        self.cost_usd = cost_usd


@dataclass
class Usage:
    cache_hit_tokens: int = 0
    cache_miss_tokens: int = 0
    output_tokens: int = 0

    def add(self, raw):
        """Adds the 'usage' block of one DeepSeek reply."""
        prompt = int(raw.get("prompt_tokens", 0))
        hit = int(raw.get("prompt_cache_hit_tokens", 0))
        miss = int(raw.get("prompt_cache_miss_tokens", prompt - hit))
        self.cache_hit_tokens += hit
        self.cache_miss_tokens += miss
        self.output_tokens += int(raw.get("completion_tokens", 0))

    @property
    def cost_usd(self):
        return (self.cache_hit_tokens * PRICE_PER_MILLION["cache_hit"]
                + self.cache_miss_tokens * PRICE_PER_MILLION["cache_miss"]
                + self.output_tokens * PRICE_PER_MILLION["output"]) / 1_000_000


@dataclass
class Detection:
    parts: list  # [{"start": float, "end": float, "brand": str}], sorted, no overlaps
    why: str = ""
    usage: Usage = field(default_factory=Usage)
    seconds: float = 0.0


def _post_json(url, body, headers, timeout):
    request = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), headers=headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


class DeepSeekClient:
    """Sends one prompt and returns the JSON object the model replied with."""

    def __init__(self, api_key, effort="low", timeout=300, attempts=3, post_json=_post_json, sleep=time.sleep):
        self._api_key = api_key
        self._effort = effort
        self._timeout = timeout
        self._attempts = attempts
        self._post_json = post_json
        self._sleep = sleep

    def ask_json(self, prompt, usage, max_tokens):
        body = {
            "model": MODEL,
            "reasoning_effort": self._effort,
            "max_tokens": max_tokens,
            "response_format": {"type": "json_object"},
            "messages": [{"role": "user", "content": prompt}],
        }
        headers = {"Authorization": "Bearer " + self._api_key, "Content-Type": "application/json"}
        problem = "no attempts made"
        for attempt in range(1, self._attempts + 1):
            try:
                reply = self._post_json(API_URL, body, headers, self._timeout)
                usage.add(reply.get("usage", {}))
                # DeepSeek sometimes returns an empty message (about 1 call in
                # 12 in testing). Asking again fixes it.
                answer = json.loads(reply["choices"][0]["message"]["content"])
                if isinstance(answer, dict):
                    return answer
                problem = "reply was not a JSON object"
            except urllib.error.HTTPError as error:
                problem = f"HTTP {error.code}"
                if error.code not in (429, 500, 502, 503, 504):
                    break  # e.g. a bad key: retrying will not help.
            except (urllib.error.URLError, TimeoutError, KeyError, IndexError, TypeError, ValueError, AttributeError) as error:
                # ValueError covers empty or broken JSON in the reply.
                problem = type(error).__name__
            if attempt < self._attempts:
                self._sleep(2 * attempt)
        # Never include the request or headers here: they hold the key.
        raise DetectionFailed(f"DeepSeek gave no usable answer ({problem})", usage.cost_usd)


def _numbered_lines(lines):
    return "\n".join(f"[{seconds}] {text}" for seconds, text in lines)


def _paid_label_text(paid_label):
    return {True: "on", False: "off"}.get(paid_label, "unknown")


def clean_parts(raw_parts, video_end):
    """Keeps only well-formed parts inside the video, merged and sorted."""
    parts = []
    if not isinstance(raw_parts, list):
        return parts
    for raw in raw_parts[:MAX_PARTS]:
        if not isinstance(raw, dict):
            continue
        start, end, brand = raw.get("start"), raw.get("end"), raw.get("brand")
        if isinstance(start, bool) or isinstance(end, bool):
            continue
        if not isinstance(start, (int, float)) or not isinstance(end, (int, float)):
            continue
        start, end = max(0.0, float(start)), min(float(end), video_end)
        if not start < end:
            continue
        brand = " ".join(str(brand or "").split())[:MAX_BRAND_CHARS] or "Sponsor"
        parts.append({"start": round(start, 1), "end": round(end, 1), "brand": brand})
    parts.sort(key=lambda part: part["start"])
    merged = []
    for part in parts:
        if merged and part["start"] <= merged[-1]["end"]:
            merged[-1]["end"] = max(merged[-1]["end"], part["end"])
        else:
            merged.append(part)
    return merged


def _excerpts(lines, parts):
    """Each flag with CONTEXT_SECONDS around it; flagged lines start with '*'."""
    blocks = []
    for number, part in enumerate(parts, 1):
        rows = [f"{'*' if part['start'] <= seconds < part['end'] else ' '} [{seconds}] {text}"
                for seconds, text in lines
                if part["start"] - CONTEXT_SECONDS <= seconds <= part["end"] + CONTEXT_SECONDS]
        blocks.append(f"--- excerpt {number} ---\n" + "\n".join(rows))
    return "\n".join(blocks)


def _inside_any(part, windows):
    return any(window["start"] - CONTEXT_SECONDS <= part["start"] and part["end"] <= window["end"] + CONTEXT_SECONDS
               for window in windows)


def find_sponsors(client, title, lines, description, paid_label):
    """Runs the 3 steps. Returns a Detection, or raises DetectionFailed."""
    started = time.monotonic()
    usage = Usage()
    # Allow a part to end shortly after the last caption line.
    video_end = (lines[-1][0] if lines else 0.0) + 60
    values = {
        "title": title,
        "lines": _numbered_lines(lines),
        "description": description or "(not available)",
        "paid_label": _paid_label_text(paid_label),
    }

    # Step 1: first pass, transcript only.
    reply = client.ask_json(FIRST_PASS_PROMPT.substitute(values), usage, max_tokens=32_000)
    flags = clean_parts(reply.get("sponsors"), video_end)

    # Step 2: the paid label says something is paid, but nothing was found.
    if not flags and paid_label is True:
        reply = client.ask_json(DESCRIPTION_PASS_PROMPT.substitute(values), usage, max_tokens=32_000)
        flags = clean_parts(reply.get("sponsors"), video_end)

    if not flags:
        return Detection(parts=[], why="No paid sponsor found.", usage=usage, seconds=time.monotonic() - started)

    # Step 3: second check of every flag together. If this step fails we do
    # NOT keep the unchecked flags: in testing those held most wrong flags.
    reply = client.ask_json(CHECK_PROMPT.substitute(values, excerpts=_excerpts(lines, flags)), usage, max_tokens=8_000)
    checked = [part for part in clean_parts(reply.get("parts"), video_end) if _inside_any(part, flags)]
    why = " ".join(str(reply.get("why") or "").split())[:300]
    return Detection(parts=checked, why=why, usage=usage, seconds=time.monotonic() - started)
