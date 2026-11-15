"""Starts the server:  python -m shield"""
import logging
import signal
import sys
import threading

from .config import SettingsError, load_settings
from .detector import DeepSeekClient, find_sponsors
from .http_api import ShieldApp, make_server
from .service import ShieldService
from .store import Store
from .youtube import YouTubeChecker


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    try:
        settings = load_settings()
    except SettingsError as error:
        sys.exit(f"Cannot start: {error}")

    client = DeepSeekClient(settings.deepseek_api_key)

    def detect(title, lines, description, paid_label):
        return find_sponsors(client, title, lines, description, paid_label)

    store = Store(settings.database_path)
    service = ShieldService(settings, store, YouTubeChecker(settings.youtube_api_key), detect)
    server = make_server(ShieldApp(settings, service))

    # systemd stops the service with SIGTERM: finish cleanly instead of dying mid-write.
    def stop(*_):
        threading.Thread(target=server.shutdown, daemon=True).start()
    signal.signal(signal.SIGTERM, stop)

    logging.getLogger("shield").info("listening on %s:%d", settings.host, settings.port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        service.close()
        store.close()


if __name__ == "__main__":
    main()
