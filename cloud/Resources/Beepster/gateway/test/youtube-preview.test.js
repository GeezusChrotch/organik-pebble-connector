import test from 'node:test';
import assert from 'node:assert/strict';
import {youtubePreview, youtubeVideoID, downloadYouTubeThumbnail} from '../src/youtube-preview.js';
import {BeeperClient} from '../src/beeper-client.js';

test('YouTube watch, short, shorts and live links get constrained thumbnail sources', () => {
  for (const url of ['https://youtu.be/abcdefghijk?t=3','https://www.youtube.com/watch?v=abcdefghijk&x=1',
    'https://m.youtube.com/shorts/abcdefghijk','https://youtube.com/live/abcdefghijk']) {
    assert.equal(youtubeVideoID(url), 'abcdefghijk');
    assert.equal(youtubePreview({text:url}).sourceURL, 'https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg');
  }
  for (const url of ['https://youtube.com.evil.test/watch?v=abcdefghijk','https://youtube.com@127.0.0.1/watch?v=abcdefghijk',
    'file:///abcdefghijk','https://youtube.com:8794/watch?v=abcdefghijk','https://youtu.be/nope']) assert.equal(youtubeVideoID(url),'');
  assert.equal(youtubePreview({text:'<a href="https://youtu.be/abcdefghijk">Title</a>'}).publicThumbnail,true);
  assert.equal(youtubePreview({links:[{url:'https://youtu.be/abcdefghijk',title:'Video',img:'mxc://server/id'}]}).sourceURL,'mxc://server/id');
  assert.equal(youtubePreview({links:[{url:'https://youtu.be/abcdefghijk',img:'http://127.0.0.1/private'}]}).publicThumbnail,true);
});

test('thumbnail downloader rejects redirects, nonimages and oversized downloads without credentials', async () => {
  const url = 'https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg';
  let options;
  const bytes = await downloadYouTubeThumbnail(url, async (_url, opts) => {options = opts;return new Response('abc',{headers:{'content-type':'image/jpeg'}});});
  assert.equal(bytes.toString(),'abc');assert.equal(options.redirect,'error');assert.equal(options.headers,undefined);
  await assert.rejects(downloadYouTubeThumbnail('http://127.0.0.1/'),/Invalid/);
  await assert.rejects(downloadYouTubeThumbnail(url, async()=>new Response('html')),/unavailable/);
  await assert.rejects(downloadYouTubeThumbnail(url, async()=>new Response('x',{headers:{'content-type':'image/jpeg','content-length':'3000000'}})),/too large/);
});

test('YouTube cards preserve message identity, prefer real attachments and honor hide-links', async () => {
  const client = new BeeperClient({baseURL:'http://localhost:23373',accessToken:'test'});
  client.hydrateChatContext = async()=>{};
  client.request = async()=>({items:[{id:'a',text:'https://youtu.be/abcdefghijk',links:[{url:'https://youtu.be/abcdefghijk',title:'My video'}]}]});
  const result = await client.listMessages('chat',10);
  assert.equal(result.items[0].id,'a');assert.equal(result.items[0].attachment.kind,'video');assert.match(result.items[0].text,/My video/);
  const hidden = await client.listMessages('chat',10,'',true);
  assert.equal(hidden.items[0].attachment,null);
});

test('expired local YouTube preview retries only the same video thumbnail', async () => {
  const sources=[];
  const client=new BeeperClient({baseURL:'http://localhost:23373',accessToken:'test'});
  const attachment=client.rememberYouTube({id:'message',links:[{url:'https://youtu.be/abcdefghijk',img:'file:///expired-thumb.jpg'}]});
  client.createAttachmentPreview=async source=>{sources.push(source);if(!source.publicThumbnail)throw Error('expired');return {width:1,height:1,pixels:Buffer.from([255])};};
  assert.equal((await client.getAttachmentPreview(attachment.id)).width,1);
  assert.equal(sources.length,2);assert.equal(sources[1].sourceURL,'https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg');
  const photo=client.rememberAttachment('photo',{srcURL:'file:///photo.jpg',type:'img'},0);
  await assert.rejects(client.getAttachmentPreview(photo.id),/expired/);
});

test('Apple GIFs with no MIME type or GIF flag are recognized from filename or source extension',()=>{
  const client=new BeeperClient({baseURL:'http://localhost:23373',accessToken:'test'});
  assert.equal(client.rememberAttachment('a',{type:'img',fileName:'animation.GIF',srcURL:'file:///asset'},0).kind,'gif');
  assert.equal(client.rememberAttachment('b',{type:'img',srcURL:'file:///animation.gif'},0).kind,'gif');
  assert.equal(client.rememberAttachment('c',{type:'img',fileName:'gift.jpg',srcURL:'file:///gift.jpg'},0).kind,'image');
});
