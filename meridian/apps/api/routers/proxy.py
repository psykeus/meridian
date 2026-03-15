"""Article proxy — fetches external pages and strips frame-blocking headers.

Used by the frontend ArticleViewer to embed news articles that set
Content-Security-Policy frame-ancestors or X-Frame-Options: DENY.
Also provides a YouTube live stream video-ID resolver.
"""

import logging
import re
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query, Response

router = APIRouter(prefix="/proxy", tags=["proxy"])
logger = logging.getLogger(__name__)

_BLOCKED_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0", "::1", "api", "redis", "db"}
_MAX_BODY = 5 * 1024 * 1024  # 5 MB

# Script injected into proxied pages to auto-dismiss cookie consent banners.
# Targets common consent frameworks (CMP): OneTrust, Cookiebot, Didomi,
# Quantcast, generic GDPR banners.  Clicks the "reject all" or "necessary
# only" button if available, otherwise the primary "accept" button.
_COOKIE_DISMISS_SCRIPT = r"""
<script data-meridian-proxy>
(function(){
  var attempts = 0;
  function dismiss(){
    if(attempts++ > 20) return;
    // ── OneTrust ──
    var ot = document.getElementById('onetrust-reject-all-handler')
          || document.querySelector('.onetrust-close-btn-handler');
    if(ot){ ot.click(); return; }
    // ── Cookiebot ──
    var cb = document.getElementById('CybotCookiebotDialogBodyButtonDecline')
          || document.getElementById('CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll');
    if(cb){ cb.click(); return; }
    // ── Didomi ──
    var di = document.querySelector('[class*="didomi"] button[class*="disagree"]')
          || document.querySelector('#didomi-notice-disagree-button');
    if(di){ di.click(); return; }
    // ── Quantcast (GDPR) ──
    var qc = document.querySelector('.qc-cmp2-summary-buttons button[mode="secondary"]')
          || document.querySelector('.qc-cmp-button[data-tracking="reject-all"]');
    if(qc){ qc.click(); return; }
    // ── Generic patterns ──
    var btns = document.querySelectorAll(
      'button, [role="button"], a[class*="cookie"], a[class*="consent"]'
    );
    for(var i=0;i<btns.length;i++){
      var t = (btns[i].textContent||'').trim().toLowerCase();
      if(/^(reject\s*(all)?|decline|deny|refuse|necessary\s*only|essential\s*only)$/i.test(t)){
        btns[i].click(); return;
      }
    }
    // Second pass — accept minimum if no reject button found
    for(var j=0;j<btns.length;j++){
      var t2 = (btns[j].textContent||'').trim().toLowerCase();
      if(/^(accept\s*(all)?|agree|allow|ok|i\s*agree|got\s*it|continue|accept\s*(&|and)\s*close)$/i.test(t2)){
        btns[j].click(); return;
      }
    }
    setTimeout(dismiss, 500);
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(dismiss, 300); });
  } else {
    setTimeout(dismiss, 300);
  }
})();
</script>
"""


def _is_safe_url(url: str) -> bool:
    """Block internal/private URLs to prevent SSRF."""
    try:
        parsed = urlparse(url)
    except Exception:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    host = (parsed.hostname or "").lower()
    if host in _BLOCKED_HOSTS:
        return False
    # Block RFC-1918 / link-local
    if host.startswith("10.") or host.startswith("192.168.") or host.startswith("172."):
        return False
    if host.startswith("169.254."):
        return False
    return True


@router.get("/article")
async def proxy_article(url: str = Query(..., min_length=10, max_length=2048)) -> Response:
    """Fetch an external article page and return it with frame-blocking
    headers removed so the frontend can embed it in an iframe."""
    if not _is_safe_url(url):
        raise HTTPException(400, "Invalid or blocked URL")

    parsed = urlparse(url)
    origin = f"{parsed.scheme}://{parsed.netloc}"

    _BROWSER_HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Sec-CH-UA": '"Chromium";v="134", "Google Chrome";v="134", "Not:A-Brand";v="24"',
        "Sec-CH-UA-Mobile": "?0",
        "Sec-CH-UA-Platform": '"Windows"',
        "Upgrade-Insecure-Requests": "1",
        "DNT": "1",
        "Referer": origin + "/",
    }

    try:
        async with httpx.AsyncClient(
            timeout=15,
            follow_redirects=True,
            limits=httpx.Limits(max_connections=10),
        ) as client:
            resp = await client.get(url, headers=_BROWSER_HEADERS)
    except httpx.TimeoutException:
        raise HTTPException(504, "Upstream timeout")
    except Exception as exc:
        logger.warning("proxy_article fetch error: %s", exc)
        raise HTTPException(502, "Failed to fetch article")

    content_type = resp.headers.get("content-type", "text/html")

    # Some sites (e.g. NDTV) return 403 but still include full HTML body.
    # Only hard-fail on 4xx/5xx if the body is empty or not HTML.
    if resp.status_code >= 400:
        has_html_body = resp.content and "html" in content_type.lower() and len(resp.content) > 512
        if not has_html_body:
            logger.info("proxy_article upstream %s for %s (body %d bytes)", resp.status_code, parsed.netloc, len(resp.content))
            raise HTTPException(resp.status_code, "Upstream error")

    # Only proxy HTML pages
    if "html" not in content_type.lower():
        raise HTTPException(415, "Not an HTML page")

    body = resp.content
    if len(body) > _MAX_BODY:
        raise HTTPException(413, "Response too large")

    # Inject cookie-dismiss script before </head> or at start of body
    text = body.decode("utf-8", errors="replace")
    inject_point = text.lower().find("</head>")
    if inject_point != -1:
        text = text[:inject_point] + _COOKIE_DISMISS_SCRIPT + text[inject_point:]
    else:
        body_point = text.lower().find("<body")
        if body_point != -1:
            # Insert after the <body ...> tag
            close_bracket = text.find(">", body_point)
            if close_bracket != -1:
                text = text[:close_bracket + 1] + _COOKIE_DISMISS_SCRIPT + text[close_bracket + 1:]
        else:
            text = _COOKIE_DISMISS_SCRIPT + text

    # Inject <base> tag so relative CSS/image URLs resolve against the original site
    base_tag = f'<base href="{origin}/">'
    head_pos = text.lower().find("<head")
    if head_pos != -1:
        close = text.find(">", head_pos)
        if close != -1:
            text = text[:close + 1] + base_tag + text[close + 1:]
    else:
        text = base_tag + text

    return Response(
        content=text.encode("utf-8"),
        media_type="text/html; charset=utf-8",
        headers={
            # Explicitly allow framing by our app
            "X-Frame-Options": "ALLOWALL",
            "Content-Security-Policy": "frame-ancestors *",
            # Prevent caching of proxied content
            "Cache-Control": "no-store",
        },
    )


# ── YouTube live stream resolver ─────────────────────────────────────────────

# Cache resolved video IDs for 5 minutes to avoid hammering YouTube
_yt_cache: dict[str, tuple[float, str | None]] = {}
_YT_CACHE_TTL = 300  # seconds

# Patterns to extract live video ID from a YouTube channel page
_YT_VIDEO_ID_PATTERNS = [
    # canonicalBaseUrl / live player config
    re.compile(r'"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"'),
]


@router.get("/youtube-live")
async def resolve_youtube_live(channel_id: str = Query(..., min_length=5, max_length=60)) -> dict:
    """Resolve a YouTube channel ID to its current live stream video ID.

    Fetches the channel's /live page and extracts the video ID from the HTML.
    Returns {"video_id": "..."} or {"video_id": null} if no live stream found.
    Results are cached for 5 minutes.
    """
    import time
    now = time.time()

    # Check cache
    if channel_id in _yt_cache:
        cached_time, cached_id = _yt_cache[channel_id]
        if now - cached_time < _YT_CACHE_TTL:
            return {"video_id": cached_id, "cached": True}

    video_id = None
    url = f"https://www.youtube.com/channel/{channel_id}/live"

    try:
        async with httpx.AsyncClient(
            timeout=10,
            follow_redirects=True,
            limits=httpx.Limits(max_connections=5),
        ) as client:
            resp = await client.get(url, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
            })

        if resp.status_code == 200:
            html = resp.text
            # Check if the page indicates a live stream is active
            is_live = '"isLive":true' in html or '"isLiveNow":true' in html
            if is_live:
                for pattern in _YT_VIDEO_ID_PATTERNS:
                    match = pattern.search(html)
                    if match:
                        video_id = match.group(1)
                        break
    except Exception as exc:
        logger.warning("youtube-live resolve error for %s: %s", channel_id, exc)

    _yt_cache[channel_id] = (now, video_id)
    return {"video_id": video_id, "cached": False}
