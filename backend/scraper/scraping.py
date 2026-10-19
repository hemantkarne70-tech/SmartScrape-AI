import ipaddress
import json
import socket
import time
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from django.conf import settings

USER_AGENT = (
    "Mozilla/5.0 (compatible; SmartScrapeAI/1.0; "
    "+respectful public web data extraction)"
)
DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.8",
}


class ScrapeError(Exception):
    """Raised when a page cannot be safely or successfully scraped."""


def validate_public_url(url):
    """Validate URLs and reject localhost/private/reserved destinations."""
    parsed = urlparse(url or "")
    if parsed.scheme not in {"http", "https"}:
        raise ScrapeError("Only http:// and https:// URLs are supported.")
    if not parsed.hostname:
        raise ScrapeError("Please enter a valid URL.")

    host = parsed.hostname.lower().rstrip(".")
    if host in {"localhost", "localhost.localdomain"} or host.endswith(".local"):
        raise ScrapeError("Localhost and local-network URLs are not allowed.")

    try:
        addresses = socket.getaddrinfo(
            host,
            parsed.port or (443 if parsed.scheme == "https" else 80),
            type=socket.SOCK_STREAM,
        )
    except socket.gaierror as exc:
        raise ScrapeError("The domain could not be resolved.") from exc

    for item in addresses:
        ip = ipaddress.ip_address(item[4][0].split("%")[0])
        if not ip.is_global:
            raise ScrapeError(
                "Private, reserved, or local network addresses are not allowed."
            )
    return url


def _max_results():
    return max(1, int(getattr(settings, "SCRAPER_MAX_RESULTS", 100)))


def _meta_content(soup, *names):
    """Return the first non-empty matching meta content."""
    wanted = {name.lower() for name in names}
    for tag in soup.find_all("meta"):
        key = (tag.get("property") or tag.get("name") or tag.get("itemprop") or "").lower()
        content = (tag.get("content") or "").strip()
        if key in wanted and content:
            return content
    return ""


def _absolute_url(base_url, candidate):
    candidate = (candidate or "").strip()
    if not candidate or candidate.startswith(("data:", "javascript:", "blob:")):
        return ""
    absolute = urljoin(base_url, candidate)
    if urlparse(absolute).scheme not in {"http", "https"}:
        return ""
    return absolute


def _image_candidate(tag):
    """Prefer useful lazy-load attributes and fall back to src/srcset."""
    for attr in ("src", "data-src", "data-original", "data-lazy-src", "data-image"):
        value = tag.get(attr)
        if value:
            return value

    # Choose the last srcset candidate, usually the largest available variant.
    srcset = tag.get("srcset") or tag.get("data-srcset")
    if srcset:
        candidates = [item.strip().split()[0] for item in srcset.split(",") if item.strip()]
        if candidates:
            return candidates[-1]
    return ""


def _extract_json_ld(soup, limit):
    """Extract structured JSON-LD objects without changing the response schema."""
    items = []
    for script in soup.find_all("script", type="application/ld+json"):
        raw = script.string or script.get_text()
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            continue

        stack = data if isinstance(data, list) else [data]
        while stack and len(items) < limit:
            item = stack.pop(0)
            if isinstance(item, dict):
                items.append(item)
                graph = item.get("@graph")
                if isinstance(graph, list):
                    stack.extend(graph)
            elif isinstance(item, list):
                stack.extend(item)
    return items


def scrape_page(url, selectors=None):
    """Scrape public HTML and metadata; JavaScript-only content may not be available."""
    validate_public_url(url)
    started = time.perf_counter()

    try:
        current_url = url
        response = None

        # Validate every redirect destination before requesting it.
        for _ in range(6):
            validate_public_url(current_url)
            response = requests.get(
                current_url,
                headers=DEFAULT_HEADERS,
                timeout=getattr(settings, "SCRAPER_TIMEOUT", 20),
                allow_redirects=False,
            )
            if response.is_redirect or response.is_permanent_redirect:
                location = response.headers.get("Location")
                if not location:
                    raise ScrapeError(
                        "The server returned a redirect without a destination."
                    )
                current_url = urljoin(current_url, location)
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
    if "html" not in content_type.lower() and "xhtml" not in content_type.lower():
        raise ScrapeError("The URL did not return an HTML document.")

    soup = BeautifulSoup(response.text, "html.parser")
    limit = _max_results()

    # Use document title first, then Open Graph / Twitter metadata.
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    title = title or _meta_content(soup, "og:title", "twitter:title")

    description = _meta_content(
        soup, "description", "og:description", "twitter:description"
    )

    headings = {
        f"h{i}": [
            node.get_text(" ", strip=True)
            for node in soup.find_all(f"h{i}")
            if node.get_text(" ", strip=True)
        ][:limit]
        for i in range(1, 7)
    }

    links = []
    seen_links = set()
    for node in soup.find_all("a", href=True):
        link_url = _absolute_url(response.url, node.get("href"))
        if not link_url or link_url in seen_links:
            continue
        seen_links.add(link_url)
        links.append({
            "text": node.get_text(" ", strip=True) or (node.get("aria-label") or "").strip(),
            "url": link_url,
        })
        if len(links) >= limit:
            break

    images = []
    seen_images = set()

    # og:image and Twitter preview images are useful when a page contains no <img>.
    meta_image_values = [
        _meta_content(soup, "og:image", "og:image:url"),
        _meta_content(soup, "twitter:image", "twitter:image:src"),
    ]
    for value in meta_image_values:
        image_url = _absolute_url(response.url, value)
        if image_url and image_url not in seen_images:
            seen_images.add(image_url)
            images.append({"alt": title, "url": image_url})

    for node in soup.find_all("img"):
        image_url = _absolute_url(response.url, _image_candidate(node))
        if not image_url or image_url in seen_images:
            continue
        seen_images.add(image_url)
        images.append({
            "alt": (node.get("alt") or node.get("aria-label") or "").strip(),
            "url": image_url,
        })
        if len(images) >= limit:
            break
    images = images[:limit]

    custom = {}
    for key, selector in (selectors or {}).items():
        if not isinstance(key, str) or not isinstance(selector, str):
            continue
        if len(key) > 80 or len(selector) > 500:
            continue
        try:
            nodes = soup.select(selector)[:limit]
            custom[key] = [node.get_text(" ", strip=True) for node in nodes]
        except Exception as exc:
            raise ScrapeError(f"Invalid CSS selector for '{key}': {exc}") from exc

    # Keep existing output fields compatible while exposing structured metadata.
    structured_data = _extract_json_ld(soup, limit)
    if structured_data:
        custom.setdefault("structured_data", structured_data)

    # Helpful diagnostics for sites that return only a shell/login page.
    if not links and not images:
        page_text = soup.get_text(" ", strip=True).lower()
        if "facebook.com" in urlparse(response.url).netloc.lower():
            custom.setdefault(
                "scrape_note",
                [
                    "Facebook may render profile content with JavaScript or require "
                    "authentication. Only content available in the returned public "
                    "HTML could be extracted."
                ],
            )
        elif not page_text:
            custom.setdefault(
                "scrape_note",
                ["The response contains little readable HTML content."],
            )

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
