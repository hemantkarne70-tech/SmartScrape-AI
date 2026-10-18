import ipaddress
import socket
import time
from urllib.parse import urlparse
import requests
from bs4 import BeautifulSoup
from django.conf import settings

USER_AGENT = "SmartScrapeAI/1.0 (+respectful public web data extraction)"

class ScrapeError(Exception):
    pass

def validate_public_url(url):
    parsed = urlparse(url or "")
    if parsed.scheme not in {"http", "https"}:
        raise ScrapeError("Only http:// and https:// URLs are supported.")
    if not parsed.hostname:
        raise ScrapeError("Please enter a valid URL.")
    host = parsed.hostname.lower().rstrip(".")
    if host in {"localhost", "localhost.localdomain"} or host.endswith(".local"):
        raise ScrapeError("Localhost and local-network URLs are not allowed.")
    try:
        addresses = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except socket.gaierror:
        raise ScrapeError("The domain could not be resolved.")
    for item in addresses:
        ip = ipaddress.ip_address(item[4][0].split("%")[0])
        if not ip.is_global:
            raise ScrapeError("Private, reserved, or local network addresses are not allowed.")
    return url

def scrape_page(url, selectors=None):
    validate_public_url(url)
    started = time.perf_counter()
    try:
        current_url = url
        response = None
        # Follow redirects manually so every destination is validated before a request is made.
        for _ in range(6):
            validate_public_url(current_url)
            response = requests.get(
                current_url,
                headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"},
                timeout=settings.SCRAPER_TIMEOUT,
                allow_redirects=False,
            )
            if response.is_redirect or response.is_permanent_redirect:
                location = response.headers.get("Location")
                if not location:
                    raise ScrapeError("The server returned a redirect without a destination.")
                current_url = requests.compat.urljoin(current_url, location)
                continue
            response.raise_for_status()
            break
        else:
            raise ScrapeError("Too many redirects (maximum 5).")
    except ScrapeError:
        raise
    except requests.RequestException as exc:
        raise ScrapeError(f"Request failed: {exc}") from exc

    if response is None:
        raise ScrapeError("The request did not return a response.")
    content_type = response.headers.get("Content-Type", "")
    if "html" not in content_type.lower():
        raise ScrapeError("The URL did not return an HTML document.")
    soup = BeautifulSoup(response.text, "html.parser")
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    description_tag = soup.find("meta", attrs={"name": lambda value: value and value.lower() == "description"})
    description = description_tag.get("content", "").strip() if description_tag else ""
    headings = {
        f"h{i}": [node.get_text(" ", strip=True) for node in soup.find_all(f"h{i}")[:settings.SCRAPER_MAX_RESULTS]]
        for i in range(1, 7)
    }
    links = []
    for node in soup.find_all("a", href=True)[:settings.SCRAPER_MAX_RESULTS]:
        links.append({"text": node.get_text(" ", strip=True), "url": requests.compat.urljoin(response.url, node["href"])})
    images = []
    for node in soup.find_all("img")[:settings.SCRAPER_MAX_RESULTS]:
        images.append({"alt": (node.get("alt") or "").strip(), "url": requests.compat.urljoin(response.url, node.get("src", "")) if node.get("src") else ""})

    custom = {}
    for key, selector in (selectors or {}).items():
        if not isinstance(key, str) or not isinstance(selector, str):
            continue
        if len(key) > 80 or len(selector) > 500:
            continue
        try:
            nodes = soup.select(selector)[:settings.SCRAPER_MAX_RESULTS]
            custom[key] = [node.get_text(" ", strip=True) for node in nodes]
        except Exception as exc:
            raise ScrapeError(f"Invalid CSS selector for '{key}': {exc}") from exc

    elapsed = int((time.perf_counter() - started) * 1000)
    return {
        "url": response.url,
        "status_code": response.status_code,
        "page_title": title,
        "meta_description": description,
        "headings": headings,
        "links": links,
        "images": images,
        "custom": custom,
        "stats": {
            "links_found": len(links),
            "images_found": len(images),
            "custom_fields": len(custom),
            "elapsed_ms": elapsed,
        },
    }, elapsed
