// Profile YouTube links as the old board stored them: "/@handle", "/channel/UC…", "/user/name",
// a bare handle or channel id, or (from bad input) a whole URL somewhere inside.
const CHANNEL_ID = /^UC[\w-]{22}$/;

// Path on youtube.com ("/@handle", "/channel/UC…", "/user/name"), or null when empty.
function channelPath(value) {
  let v = (value || "").trim();
  if (!v) return null;
  const inner = v.match(/youtube\.com(\/[^?#\s]*)/i);
  if (inner) v = inner[1];
  v = v.replace(/\/+$/, "");
  if (!v.startsWith("/")) {
    if (CHANNEL_ID.test(v)) return `/channel/${v}`;
    return `/@${v.replace(/^@/, "")}`;
  }
  if (/^\/(@|channel\/|user\/|c\/)/.test(v)) return v;
  return `/@${v.slice(1)}`;
}

export function youtubeChannelUrl(value) {
  const path = channelPath(value);
  return path ? `https://www.youtube.com${path}` : null;
}

// Short label: "@handle", "user/name", or the channel id.
export function youtubeChannelLabel(value) {
  const path = channelPath(value);
  if (!path) return "";
  if (path.startsWith("/@")) return path.slice(1);
  if (path.startsWith("/channel/")) return path.slice("/channel/".length);
  return path.slice(1);
}
