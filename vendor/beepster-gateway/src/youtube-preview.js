// Only recognized YouTube video URLs can initiate a public thumbnail fetch.
// Never follow arbitrary message URLs or redirects into private networks.
export function youtubeVideoID(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return '';
    const host = url.hostname.toLowerCase();
    let id = '';
    if (host === 'youtu.be') id = url.pathname.split('/')[1];
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
      id = url.pathname === '/watch' ? url.searchParams.get('v') :
        /^\/(shorts|live|embed)\//.test(url.pathname) ? url.pathname.split('/')[2] : '';
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id || '') ? id : '';
  } catch { return ''; }
}

export function youtubePreview(message) {
  const links = (message.links || []).filter(link => youtubeVideoID(link.url) || youtubeVideoID(link.originalURL));
  const link = links[0];
  const urls = String(message.text || '').replace(/&amp;/g, '&').match(/https?:\/\/[^\s<>"']+/g) || [];
  const id = link ? youtubeVideoID(link.url) || youtubeVideoID(link.originalURL) : urls.map(youtubeVideoID).find(Boolean);
  if (!id) return null;
  const localImage = /^(file|mxc|localmxc):\/\//.test(link?.img || '') ? link.img : '';
  return { title: String(link?.title || 'YouTube video'),
    sourceURL: localImage || `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    thumbnailFallback: localImage ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : '',
    publicThumbnail: !localImage };
}

export async function downloadYouTubeThumbnail(url, fetchImpl = globalThis.fetch) {
  if (!/^https:\/\/i\.ytimg\.com\/vi\/[A-Za-z0-9_-]{11}\/mqdefault\.jpg$/.test(url)) throw new Error('Invalid thumbnail URL');
  const response = await fetchImpl(url, {redirect: 'error', signal: AbortSignal.timeout(10000)});
  if (!response.ok || !/^image\//i.test(response.headers.get('content-type') || '')) throw new Error('YouTube thumbnail unavailable');
  const limit = 2 * 1024 * 1024;
  if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw new Error('Thumbnail too large'); }
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw new Error('Thumbnail too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
