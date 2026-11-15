"""Owner tools, run on the server itself (there is no admin web page to attack).

    python -m shield.admin status            answers saved, money spent, AI on/off
    python -m shield.admin ai off            stop all new AI checks right away
    python -m shield.admin ai on             allow AI checks again
    python -m shield.admin forget VIDEO_ID   delete every saved answer for one video

Reads the database path from SHIELD_DATABASE, like the server.
"""
import json
import os
import sys

from .store import Store
from .transcript import is_video_id

USAGE = __doc__


def main(argv=None, out=sys.stdout):
    args = sys.argv[1:] if argv is None else argv
    store = Store(os.environ.get("SHIELD_DATABASE", "sponsor-shield.sqlite3"))
    try:
        if args == ["status"]:
            print(json.dumps(store.summary(), indent=2), file=out)
        elif len(args) == 2 and args[0] == "ai" and args[1] in ("on", "off"):
            store.set_ai_enabled(args[1] == "on")
            print(f"AI checks are now {args[1]}.", file=out)
        elif len(args) == 2 and args[0] == "forget" and is_video_id(args[1]):
            store.forget_video(args[1])
            print(f"Forgot every saved answer for {args[1]}.", file=out)
        else:
            print(USAGE, file=out)
            return 2
        return 0
    finally:
        store.close()


if __name__ == "__main__":
    sys.exit(main())
