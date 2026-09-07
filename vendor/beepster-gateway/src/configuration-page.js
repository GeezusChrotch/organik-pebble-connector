// BEGIN ORGANIK SETTINGS UI
// Organik settings UI v1. Vendored by sync.py; no network or storage dependencies.
function organikSettingsHTML(html, options) {
  var script = '(' + organikSettingsClient.toString() + ')(' + JSON.stringify(options).replace(/</g, '\\u003c') + ');';
  // Run after the app's own controls and event handlers have been initialized.
  var at = html.lastIndexOf('</script>');
  return html.slice(0, at) + ';' + script + html.slice(at);
}
function organikSettingsClient(options) {
  var d = document, app = options.app;
  function id(name) { return d.getElementById(name); }
  function all(selector, root) { return Array.prototype.slice.call((root || d).querySelectorAll(selector)); }
  function el(tag, text, cls) { var n = d.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; }
  function button(text, fn) { var b = el('button', text); b.type = 'button'; b.onclick = fn; return b; }
  var style = el('style');
  style.textContent = 'html{color-scheme:light}*{box-sizing:border-box}body{font:17px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;background:#f2f2f7!important;color:#111!important;margin:0 auto!important;padding:20px 20px 40px!important;max-width:620px!important;line-height:1.45}.wrap{padding:0!important}h1{font-size:28px!important;color:#111!important;margin:4px 0 16px!important}h2{font-size:20px!important;margin:24px 0 12px}h3{font-size:17px}p,.hint{color:#61616b!important;font-size:14px;line-height:1.45}label{display:block;font-weight:600;margin:14px 0 6px}input,select,textarea{font:16px -apple-system,sans-serif!important;width:100%;min-width:0;padding:13px!important;border:1px solid #bbb!important;border-radius:10px!important;background:#fff!important;color:#111!important;margin:8px 0 16px!important}textarea{min-height:130px}input[type=checkbox]{width:auto!important;margin:0 10px 0 0!important;accent-color:#34a853}button{font:600 16px -apple-system,sans-serif!important;min-height:44px;padding:13px!important;border:0;border-radius:10px!important;background:#34a853;color:white;cursor:pointer}button:disabled{opacity:.5;cursor:default}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #0878d1;outline-offset:3px}.secondary,.palette-done{background:#e5e5ea!important;color:#111!important}.danger{background:#fff!important;color:#b42318!important;border:1px solid #d7d7dc!important}.card,.theme-card,.threads,details{background:white;border:1px solid #d7d7dc;border-radius:12px;padding:14px;margin:12px 0 20px}.card h2{margin-top:0}.organik-tabs{display:flex!important;gap:3px!important;padding:3px!important;background:#dedee3!important;border-radius:11px!important;margin:0 0 22px!important;position:static!important;overflow-x:auto}.organik-tabs button{flex:1;min-width:max-content;width:auto!important;font-size:14px!important;min-height:44px;padding:9px 12px!important;background:transparent!important;color:#555!important}.organik-tabs button[aria-selected=true]{background:white!important;color:#111!important;box-shadow:0 1px 3px #aaa}.organik-panel{padding:0!important}.organik-panel[hidden]{display:none!important}.organik-help{background:#fff7df;border:1px solid #e3bd5c;border-radius:12px;padding:13px;color:#604500!important;font-size:14px}.organik-preview{width:216px!important;height:244px!important;margin:16px auto 24px!important;border:8px solid #252525!important;border-radius:24px!important;overflow:hidden!important;padding:8px!important;box-shadow:0 8px 22px #ccc;line-height:1.2}.organik-preview .preview-row{padding:10px 4px;display:block;height:auto;min-height:47px}.organik-preview small{font:14px/1.3 Arial,sans-serif}.organik-palette-trigger{width:100%;height:58px;display:flex;align-items:center;gap:12px;background:white!important;color:#111!important;border:1px solid #bbb!important;margin:8px 0 16px;text-align:left}.organik-swatch{width:36px;height:36px;border-radius:7px;border:1px solid #888;flex:none}.organik-color-value{font:15px ui-monospace,monospace}.organik-overlay{position:fixed;inset:0;background:#0008;z-index:30;display:flex;align-items:center;justify-content:center;padding:14px}.organik-overlay[hidden]{display:none}.organik-dialog{background:#f2f2f7;border-radius:16px;padding:16px;max-width:390px;width:100%;max-height:90vh;overflow:auto}.organik-dialog h2{margin-top:0}.organik-colors{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:5px}.organik-colors button{min-height:32px;height:38px;padding:0!important;border:1px solid #888;border-radius:7px!important}.organik-colors button[aria-pressed=true]{outline:3px solid #0878d1;outline-offset:1px}.organik-dialog>button{width:100%;margin-top:16px}.organik-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}.organik-apply{background:#0878d1!important;color:white!important;width:100%;margin:14px 0}.error,[role=alert]{color:#b42318!important}.emoji-picker-card{background:#f2f2f7!important}.emoji-choice,.emoji-grid button{background:#fff!important;color:#111!important}.emoji-slot{grid-template-columns:28px minmax(0,1fr) 40px 40px}.emoji-slot button{padding:6px!important}.button-grid,.row,.grid,.swatches{min-width:0}.button-grid>*,.row>*,.grid>*,.swatches>*{min-width:0}@media(max-width:380px){body{padding:16px 12px 32px!important}.button-grid,.swatches{grid-template-columns:1fr!important}.organik-tabs button{padding:9px!important}}';
  d.body.setAttribute('data-organik-app',app);
  style.textContent += '[data-organik-app=pome] .organik-preview{padding:0!important}[data-organik-app=pome] .organik-preview .preview-row{display:flex;padding:0 3px 0 6px;min-height:0}';
  d.head.appendChild(style);
  var panels = {}, tabs, host = app === 'beepster' ? id('form') : d.body;
  function panel(name, title) { var p = el('section', '', 'organik-panel'); p.id = 'organik-' + name; p.setAttribute('aria-label', title); panels[name] = p; host.appendChild(p); return p; }
  function move(n, p) { if (n) p.appendChild(n); }
  function split(root, mapping, initial) {
    var dest = initial;
    Array.prototype.slice.call(root.children).forEach(function(n) {
      if (n.tagName === 'SCRIPT' || n.tagName === 'STYLE' || n.tagName === 'H1' || n === tabs || n.classList.contains('organik-panel')) return;
      if (n.tagName === 'H2' && mapping[n.textContent]) dest = mapping[n.textContent];
      move(n, panels[dest]);
    });
  }
  if (app === 'pome' || app === 'tesla') {
    ['setup','themes','shortcuts'].forEach(function(name) { panels[name] = id(name + 'Panel'); panels[name].classList.add('organik-panel'); });
    tabs = d.querySelector('.tabs');
    if (app === 'tesla') { var title = el('h1', 'Gandalf+Gilda'); d.body.insertBefore(title, tabs); }
  } else {
    tabs = el('nav');
    panel('setup', 'Setup'); panel('themes', 'Themes');
    if (app !== 'pebclaw') panel('shortcuts', 'Shortcuts');
    if (app === 'notesy') panel('vault', 'Vault');
    if (app === 'beepster') panel('replies', 'Replies');
    var heading = d.querySelector('h1'); heading.parentNode.insertBefore(tabs, heading.nextSibling);
    if (app === 'notesy') {
      var save = id('save'), status = id('status'), pending = id('pending').parentNode;
      split(d.body, {'Hidden folders':'vault','Dictation':'shortcuts','Button shortcuts':'shortcuts','Appearance':'themes'}, 'setup');
      move(id('auto').parentNode, panels.shortcuts); move(pending, panels.vault);
      d.body.appendChild(save); d.body.appendChild(status);
    } else if (app === 'reminderz') {
      all('body > .card').forEach(function(n) { var title = n.querySelector('h2').textContent; move(n, panels[title === 'Theme' ? 'themes' : title === 'Button actions' ? 'shortcuts' : 'setup']); });
      // Keep the original save action and status reachable from every tab.
      var save = all('body > button').filter(function(n) { return n.getAttribute('onclick') === 'save()'; })[0];
      move(save, d.body); move(id('status'), d.body);
    } else if (app === 'pebclaw') {
      var save = all('body > button').filter(function(n) { return n.getAttribute('onclick') === 'save()'; })[0];
      split(d.body, {'Appearance':'themes'}, 'setup'); d.body.appendChild(save); move(id('status'), d.body);
    } else {
      var oldTabs = id('generalTab').parentNode; oldTabs.parentNode.removeChild(oldTabs);
      split(id('generalPanel'), {'Saved themes':'themes','Theme editor':'themes','Quick replies':'replies','Emoji replies':'replies','Included services':'setup'}, 'setup');
      while (id('buttonsPanel').firstChild) move(id('buttonsPanel').firstChild, panels.shortcuts);
      move(id('pairing'), panels.setup);
      id('generalPanel').remove(); id('buttonsPanel').remove();
      host.appendChild(id('save')); host.appendChild(id('status'));
    }
  }
  tabs.className = 'organik-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Settings sections'); tabs.innerHTML = '';
  var keys = Object.keys(panels);
  function show(name, focus) {
    keys.forEach(function(key) { var selected = key === name, b = id('organik-tab-' + key), p = panels[key]; p.hidden = !selected; p.classList.toggle('active', selected); p.classList.remove('hidden'); b.setAttribute('aria-selected', String(selected)); b.tabIndex = selected ? 0 : -1; });
    if (focus) id('organik-tab-' + name).focus();
  }
  keys.forEach(function(name, index) {
    var b = button(name.charAt(0).toUpperCase() + name.slice(1), function() { show(name); }); b.id = 'organik-tab-' + name; b.setAttribute('role', 'tab'); b.setAttribute('aria-controls', panels[name].id);
    panels[name].setAttribute('role', 'tabpanel'); panels[name].setAttribute('aria-labelledby', b.id);
    b.onkeydown = function(e) { var i = index; if (e.key === 'ArrowRight') i = (i + 1) % keys.length; else if (e.key === 'ArrowLeft') i = (i + keys.length - 1) % keys.length; else if (e.key === 'Home') i = 0; else if (e.key === 'End') i = keys.length - 1; else return; e.preventDefault(); show(keys[i], true); }; tabs.appendChild(b);
  });
  // Reveal validation errors and expired pairing even when another tab is open.
  var observer = new MutationObserver(function() { all('.error,#buttonError,#status,#folder-status').forEach(function(n) { if (!n.textContent || !/error|failed|cannot|could not|keep move|expired|enter the current/i.test(n.textContent)) return; keys.forEach(function(key) { if (panels[key].contains(n)) show(key); }); }); if (id('pairing') && !id('pairing').classList.contains('hidden') && app === 'beepster') show('setup'); });
  ['status','buttonError','pairing'].forEach(function(name) { if(id(name)) observer.observe(id(name), {childList:true,subtree:true,attributes:true,attributeFilter:['class']}); });
  show('setup');
  all('label').forEach(function(label, i) { if (label.querySelector('input,select,textarea') || label.htmlFor) return; var next = label.nextElementSibling; if (next && /^(INPUT|SELECT|TEXTAREA)$/.test(next.tagName)) { if (!next.id) next.id = 'organik-control-' + i; label.htmlFor = next.id; } });
  all('#status,#buttonError,#folder-status').forEach(function(n) { n.setAttribute('role','status'); n.setAttribute('aria-live','polite'); });
  var themePanel = panels.themes;
  if (app !== 'pome') themePanel.insertBefore(el('p', 'Choose a preset or edit your own colors, font and size. The preview updates as you edit. Save and apply sends your settings to the watch.', 'organik-help'), themePanel.firstChild);
  var preview = id('preview');
  if (!preview) { preview = el('div'); preview.id = 'preview'; preview.innerHTML = '<div class="preview-title">Notesy</div><div class="preview-row selected">Meeting notes<small><br>Today · Pebble</small></div><div class="preview-row">Ideas<small><br>Capture a thought</small></div><div class="preview-row">Shopping list</div>'; }
  if(app==='pebclaw')preview.innerHTML='<strong>PebClaw</strong><div class=preview-row>You: What is next?</div><div class=preview-row>Agent: Review notes.</div>';
  preview.classList.add('organik-preview'); preview.setAttribute('aria-label', 'Watch theme preview'); themePanel.insertBefore(preview, themePanel.children[1] || null);
  var map = options.fields || {}, raw = [], watch = options.watchColors;
  for (var c = 0; c < 64; c++) raw.push('#' + [Math.floor(c/16),Math.floor(c/4)%4,c%4].map(function(v) { var s=(v*85).toString(16);return s.length<2?'0'+s:s; }).join(''));
  function colorIndex(hex) { if (!/^#[0-9a-f]{6}$/i.test(hex)) return 0; return Math.round(parseInt(hex.slice(1,3),16)/85)*16 + Math.round(parseInt(hex.slice(3,5),16)/85)*4 + Math.round(parseInt(hex.slice(5,7),16)/85); }
  function display(hex) { return watch[colorIndex(hex)]; }
  function value(key) { return id(map[key]) && id(map[key]).value; }
  function fire(control) { ['input','change'].forEach(function(type) { var e = d.createEvent('HTMLEvents'); e.initEvent(type, true, false); control.dispatchEvent(e); }); }
  var swatches = [];
  function refresh() {
    swatches.forEach(function(s) { s.swatch.style.background = display(s.input.value); s.value.textContent = s.input.value.toUpperCase(); });
    if (app === 'pome') {window.preview();return;}
    var text = value('text') || '#000000', bg = value('background') || '#ffffff', selected = value('selection') || value('accent') || '#000000';
    preview.style.color = display(text); preview.style.background = display(bg);
    var font = value('font'), families = {inter:'Inter,Arial,sans-serif',roboto:'Roboto,Arial,sans-serif','open-sans':'Open Sans,Arial,sans-serif',montserrat:'Montserrat,Arial,sans-serif',poppins:'Poppins,Arial,sans-serif','droid-serif':'Georgia,serif','3':'Georgia,serif','roboto-condensed':'Arial Narrow,Arial,sans-serif'};
    preview.style.fontFamily = families[font] || 'Arial,sans-serif'; preview.style.fontWeight = /^(gothic-bold|droid-serif|bitham-black|1|3|4)$/.test(font) ? '700' : '400'; preview.style.fontSize = (Number(value('size')) || 22) + 'px';
    all('.selected', preview).forEach(function(row) { row.style.background=display(selected); var h=display(selected), luminance=parseInt(h.slice(1,3),16)*299+parseInt(h.slice(3,5),16)*587+parseInt(h.slice(5,7),16)*114; row.style.color=luminance>=150000?'#000':'#fff'; });
    var muted=preview.querySelector('.preview-muted'), accent=preview.querySelector('.preview-button'); if(muted) muted.style.color=display(value('muted')||text); if(accent) {accent.style.background=display(selected);accent.style.color=display(value('accentText')||'#ffffff');}
  }
  var overlay = el('div','','organik-overlay'), dialog = el('div','','organik-dialog'), grid=el('div','','organik-colors'), target=null, returnFocus=null;
  overlay.hidden=true; dialog.setAttribute('role','dialog'); dialog.setAttribute('aria-modal','true'); dialog.setAttribute('aria-label','Choose a Pebble color'); dialog.appendChild(el('h2','Choose a Pebble color')); dialog.appendChild(grid);
  function close() {overlay.hidden=true;if(returnFocus)returnFocus.focus();}
  dialog.appendChild(button('Done',close)); overlay.appendChild(dialog); d.body.appendChild(overlay);
  raw.forEach(function(hex,index) {var b=button('',function(){target.value=hex;fire(target);refresh();close();});b.style.background=watch[index];b.setAttribute('aria-label','Pebble color '+hex.toUpperCase());b.dataset.color=hex;grid.appendChild(b);});
  overlay.onclick=function(e){if(e.target===overlay)close();}; overlay.onkeydown=function(e){if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){var bs=all('button',dialog),first=bs[0],last=bs[bs.length-1];if(e.shiftKey&&d.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&d.activeElement===last){e.preventDefault();first.focus();}}};
  Object.keys(map).forEach(function(key){if(['font','size'].indexOf(key)>=0)return;var input=id(map[key]);if(!input)return;
    if(input.tagName==='SELECT') { var selected=input.value; raw.forEach(function(hex){if(!all('option',input).some(function(o){return o.value.toLowerCase()===hex;})){var option=el('option',hex.toUpperCase());option.value=hex;input.appendChild(option);}});input.value=selected; }
    // Keep original form controls as the source of truth; the palette changes them through normal events.
    var previous=input.previousElementSibling;if(previous&&previous.classList.contains('palette-trigger')){previous.hidden=true;previous.style.setProperty('display','none','important');}
    input.hidden=true; input.style.setProperty('display','none','important');
    var b=button('',function(){target=input;returnFocus=b;all('button',grid).forEach(function(o){o.setAttribute('aria-pressed',String(o.dataset.color===raw[colorIndex(input.value)]));});overlay.hidden=false;grid.children[colorIndex(input.value)].focus();});b.className='organik-palette-trigger';b.setAttribute('aria-label','Choose '+key.replace(/([A-Z])/g,' $1').toLowerCase()+' color');var swatch=el('span','','organik-swatch'),label=el('span','','organik-color-value');b.appendChild(swatch);b.appendChild(label);input.parentNode.insertBefore(b,input.nextSibling);swatches.push({input:input,swatch:swatch,value:label});
  });
  if(app==='reminderz'){var preset=id('preset'),custom=el('option','Custom');custom.value='custom';custom.disabled=true;preset.appendChild(custom);themePanel.addEventListener('change',function(e){if(Object.keys(map).some(function(k){return map[k]===e.target.id;}))preset.value='custom';});}
  themePanel.addEventListener('input',refresh);themePanel.addEventListener('change',refresh);themePanel.addEventListener('click',function(){setTimeout(refresh,0);});
  // Older apps have presets but no custom library. Store only appearance fields in the app callback.
  if(options.library) {
    var library=Array.isArray(options.savedThemes)?options.savedThemes.slice(0,20):[],card=el('div','','theme-card'),menu=el('select'),name=el('input');menu.id='organik-saved-theme';name.id='organik-theme-name';name.maxLength=32;name.placeholder='My theme';
    var label=el('label','Saved custom themes');label.htmlFor=menu.id;card.appendChild(label);card.appendChild(menu);label=el('label','Theme name');label.htmlFor=name.id;card.appendChild(label);card.appendChild(name);
    function renderLibrary(){menu.innerHTML='';var o=el('option','Current preview');o.value='';menu.appendChild(o);library.forEach(function(t,i){var o=el('option',t.name);o.value=i;menu.appendChild(o);});}
    function readLibraryTheme(){var t={name:name.value.trim()||'My theme'};Object.keys(map).forEach(function(k){t[k]=value(k);});return t;}
    function setControl(input,v){if(!input)return;if(input.tagName==='SELECT'&&!all('option',input).some(function(o){return o.value===String(v)&&!o.disabled;}))return;input.value=v;fire(input);}
    menu.onchange=function(){if(menu.value==='')return;var t=library[Number(menu.value)];name.value=t.name;Object.keys(map).forEach(function(k){if(k==='size')return;var input=id(map[k]);if(input&&t[k]!==undefined){setControl(input,t[k]);}});if(id(map.size)){setControl(id(map.size),t.size);}refresh();};
    var row=el('div','','organik-actions');row.appendChild(button('Save custom theme',function(){var t=readLibraryTheme(),found=-1;library.forEach(function(v,i){if(v.name.toLowerCase()===t.name.toLowerCase())found=i;});if(found<0&&library.length>=20){alert('You can save up to 20 custom themes. Delete one first.');return;}if(found<0){library.push(t);found=library.length-1;}else library[found]=t;renderLibrary();menu.value=String(found);}));var remove=button('Delete custom theme',function(){if(menu.value==='')return;library.splice(Number(menu.value),1);renderLibrary();});remove.className='danger';row.appendChild(remove);card.appendChild(row);card.appendChild(el('p','Custom themes are kept on this phone when you save and apply settings. Built-in presets remain available below.'));renderLibrary();themePanel.insertBefore(card,preview.nextSibling);
    window.organikSavedThemes=function(){return library;};
  }
  if(options.apply) {var mainSave=id('save') || all('body > button').filter(function(n){return n.getAttribute('onclick')==='save()';})[0]; if(mainSave){mainSave.classList.add('organik-apply');if(app!=='beepster')mainSave.textContent='Save & Apply to Watch';}}
  refresh();
}

// END ORGANIK SETTINGS UI
export function configurationPage() {
  var html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Beepster settings</title><style>
:root{color-scheme:dark;font:17px system-ui}*{box-sizing:border-box}body{max-width:38rem;margin:0 auto;padding:22px;background:#101820;color:#f7fbff}
h1{margin-bottom:5px;color:#55d6be}h2{margin:28px 0 8px;font-size:1.08rem}label{display:block;margin:15px 0 6px}.hint{color:#b7c7d4;font-size:.9rem}.error{color:#ff9c9c}
input,select,button{width:100%;font:inherit;padding:11px;border-radius:10px;border:1px solid #789;background:#172633;color:inherit}button{border:0;background:#55d6be;color:#07120f;font-weight:700}.secondary{background:#314555;color:#fff}.danger{background:#742f3a;color:#fff}
.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.buttons{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:22px 0 8px}.tab{background:#314555;color:#fff}.tab.active{background:#55d6be;color:#07120f}.button-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}.button-grid label{min-width:0}.swatches{display:grid;grid-template-columns:1fr 1fr;gap:10px}.swatches label{margin-top:10px}.swatches input{height:46px;padding:4px}.services{display:grid;grid-template-columns:1fr 1fr;gap:2px 14px}.services label{display:flex;align-items:center;gap:9px;margin:7px 0}.services input{width:auto;accent-color:#55d6be}.apple-links{display:grid;gap:10px}.apple-link{padding:11px;border:1px solid #496171;border-radius:10px}.apple-link label{margin:0 0 7px;overflow-wrap:anywhere}.apple-link input{padding:9px}
.emoji-slots{display:grid;gap:8px}.emoji-slot{display:grid;grid-template-columns:34px 1fr 38px 38px;gap:7px;align-items:center;padding:7px;border:1px solid #496171;border-radius:10px}.emoji-slot button{padding:8px}.emoji-choice{text-align:left;background:#172633;color:inherit}.emoji-thumb{display:inline-block;width:24px;height:24px;background-image:url('/emoji/atlas.png?v=17-1');background-repeat:no-repeat}.emoji-picker{position:fixed;inset:0;z-index:10;padding:18px;background:#071018ee;overflow:auto}.emoji-picker-card{max-width:38rem;margin:0 auto;padding:17px;border-radius:14px;background:#101820}.emoji-picker-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.emoji-picker-head h2{margin:0}.emoji-picker-head button{width:auto}.emoji-filters{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:14px 0}.emoji-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(48px,1fr));gap:6px}.emoji-grid button{height:48px;padding:10px;background:#172633}.emoji-grid button:focus{outline:2px solid #55d6be}.emoji-empty{grid-column:1/-1;color:#b7c7d4}
#preview{margin:16px 0;padding:13px;border-radius:12px;min-height:132px}.preview-title{font-size:1.2rem;font-weight:700}.preview-body{margin-top:9px}.preview-muted{margin-top:9px;font-size:.85rem}.preview-button{display:inline-block;margin-top:12px;padding:6px 10px;border-radius:7px;font-weight:700}
#save{margin-top:22px}.hidden{display:none}</style></head>
<body><h1>Beepster</h1><p id="intro">Pair this Pebble with your private Mac companion.</p>
<form id="form"><div id="pairing"><label>One-time pairing code</label><input id="code" inputmode="numeric" autocomplete="one-time-code"></div>
<div class="tabs"><button type="button" id="generalTab" class="tab active">General</button><button type="button" id="buttonsTab" class="tab">Buttons</button></div>
<div id="generalPanel">
<h2>Saved themes</h2><label for="theme">Theme</label><select id="theme"></select>
<div class="buttons"><button type="button" id="newTheme" class="secondary">New custom theme</button><button type="button" id="deleteTheme" class="danger">Delete custom theme</button></div>
<p class="hint" id="deleteHint">Built-in themes cannot be deleted.</p>
<div id="preview"><div class="preview-title">Beepster preview</div><div class="preview-body">Alex: Dinner at seven? 😃</div><div class="preview-muted">2 minutes ago</div><div class="preview-button">Reply</div></div>
<h2>Theme editor</h2><label for="themeName">Theme name</label><input id="themeName" maxlength="32">
<div class="swatches"><label>Background<input type="color" id="background"></label><label>Text<input type="color" id="text"></label><label>Muted text<input type="color" id="muted"></label><label>Accent<input type="color" id="accent"></label><label>Accent text<input type="color" id="accentText"></label></div>
<div class="row"><label>Font<select id="font"><option value="inter">Inter</option><option value="roboto">Roboto</option><option value="open-sans">Open Sans</option><option value="montserrat">Montserrat</option><option value="poppins">Poppins</option></select></label><label>Font size<select id="size"><option value="14">14</option><option value="18">18</option><option value="22">22</option><option value="26">26</option><option value="30">30</option></select></label></div>
<h2>Quick replies</h2><p class="hint">Add up to eight replies. Text and emoji are sent exactly as entered; leave unused slots blank.</p><div id="quickReplies"></div>
<h2>Emoji replies</h2><p class="hint">Choose and order 15 bitmap emoji for the watch reply menu. Every choice sends the real emoji character.</p><div id="emojiSlots" class="emoji-slots"></div>
<h2>Included services</h2><p class="hint">Choose which services appear in the watch inbox. Changes apply without pairing again.</p><div id="services" class="services"></div>
<h2>Inbox sections</h2><p class="hint">Primary is recommended. Optionally browse Low Priority and Archived conversations after it.</p><div id="inboxes" class="services"></div>
<h2>Agent approvals</h2><div class="services"><label><input type="checkbox" id="openClawApprovals"> Show pending agent approvals</label></div><p class="hint">Optional Hermes and OpenClaw support. First open Agent Links in Beepster Connector on your Mac and explicitly link the agent session to its Telegram conversation. Pending action cards appear inside that chat with only Approve once and Deny. Expired or changed requests are rejected; no standing permission is created.</p>
<h2>Link Apple conversations</h2><p class="hint">If Apple Messages exposes the same person as separate email and phone chats, enter the same contact name beside both. Beepster will combine their history on the watch while preserving both Beeper destinations.</p><div id="appleLinks" class="apple-links"></div><p id="appleLinksEmpty" class="hint">No recent Apple conversations are available yet. Open the Beepster inbox once, then return to Settings.</p>
<label>Live refresh while open</label><select id="refresh"><option value="15">15 seconds — recommended</option><option value="30">30 seconds</option><option value="60">1 minute</option><option value="0">Manual only</option></select><p class="hint">Applies to both the conversation list and open chats. Polling pauses when Beepster is not visible.</p>
</div><div id="buttonsPanel" class="hidden"><h2>Button controls</h2><p class="hint">Choose separate press and hold actions for the conversation list and for an open chat. Press Back twice quickly for its shortcut (No action by default); single Back returns. Double Back does nothing on approval rows. Theme and button customization live here on the phone.</p><h2>Threads</h2><div id="threadButtons" class="button-grid"></div><h2>Chat</h2><div id="chatButtons" class="button-grid"></div><p class="hint">Scroll up and Scroll down move one text line per button press. Drag the chat to scroll continuously with your finger.</p></div>
<button id="save">Test connection &amp; pair</button><p id="status" class="hint">The code can be viewed or rotated on your Mac.</p></form>
<div id="emojiPicker" class="emoji-picker hidden"><div class="emoji-picker-card"><div class="emoji-picker-head"><h2>Choose emoji</h2><button type="button" id="closeEmojiPicker" class="secondary">Close</button></div><div class="emoji-filters"><input id="emojiSearch" type="search" placeholder="Search emoji"><select id="emojiGroup"><option value="">All categories</option></select></div><div id="emojiGrid" class="emoji-grid"></div></div></div>
<script>
const f=document.getElementById('form'),s=document.getElementById('status'),themeSelect=document.getElementById('theme');let initial={};
try{initial=JSON.parse(decodeURIComponent(location.hash.slice(1)||'%7B%7D'));}catch(e){}
const defaults=[
{id:'classic',name:'Classic',background:'#FFFFFF',text:'#000000',muted:'#555555',accent:'#0055AA',accentText:'#FFFFFF',font:'inter',size:22,builtIn:true},
{id:'dark',name:'Midnight',background:'#000000',text:'#FFFFFF',muted:'#AAAAAA',accent:'#00AAFF',accentText:'#000000',font:'roboto',size:22,builtIn:true},
{id:'ocean',name:'Ocean',background:'#001133',text:'#FFFFFF',muted:'#AAFFFF',accent:'#00AAFF',accentText:'#000000',font:'roboto',size:22,builtIn:true},
{id:'contrast',name:'High Contrast',background:'#FFFFFF',text:'#000000',muted:'#000000',accent:'#000000',accentText:'#FFFFFF',font:'open-sans',size:26,builtIn:true},
{id:'plum',name:'Plum',background:'#330033',text:'#FFFFFF',muted:'#FFAAFF',accent:'#AA00AA',accentText:'#FFFFFF',font:'poppins',size:30,builtIn:true},
{id:'forest',name:'Forest',background:'#003300',text:'#FFFFFF',muted:'#AAFFAA',accent:'#00AA55',accentText:'#000000',font:'open-sans',size:26,builtIn:true}
];
const fields=['themeName','background','text','muted','accent','accentText','font','size'];
// Double Back has separate slots after the original twelve bindings.
const buttonDefaults=['scroll_up','quick_reply','open_chat','dictate','scroll_down','delete','scroll_up','quick_reply','none','dictate','scroll_down','delete','main_top','main_top'],buttonSource=Array.isArray(initial.buttonBindings)?initial.buttonBindings:buttonDefaults,buttonLabels=['Top press','Top hold','Middle press','Middle hold','Bottom press','Bottom hold'],buttonActions=[['scroll_up','Scroll up'],['scroll_down','Scroll down'],['open_chat','Open selected chat'],['dictate','Dictate reply'],['quick_reply','Quick reply'],['pin_toggle','Pin / unpin'],['jump_newest','Jump to newest'],['main_top','Top of conversation list'],['delete','Delete'],['none','No action']];
function buildButtonControls(containerId,start){const container=document.getElementById(containerId),available=start===6?buttonActions.filter(action=>action[0]!=='open_chat'):buttonActions;buttonLabels.concat(['Double Back']).forEach((labelText,offset)=>{const slot=offset===6?(start===6?13:12):start+offset;const label=document.createElement('label'),select=document.createElement('select');label.textContent=labelText;select.id='buttonBinding'+slot;available.forEach(action=>{const option=document.createElement('option');option.value=action[0];option.textContent=action[0]==='delete'?(start===6?'Delete message':'Archive conversation'):action[1];select.appendChild(option);});select.value=available.some(action=>action[0]===buttonSource[slot])?buttonSource[slot]:buttonDefaults[slot];label.appendChild(select);container.appendChild(label);});}
buildButtonControls('threadButtons',0);buildButtonControls('chatButtons',6);
const quickDefaults=['Yes','No','On my way','Thanks! 👍'],quickSource=Array.isArray(initial.quickReplies)?initial.quickReplies:quickDefaults,quickContainer=document.getElementById('quickReplies');
for(let i=0;i<8;i++){const label=document.createElement('label'),input=document.createElement('input');label.textContent='Quick reply '+(i+1);input.id='quickReply'+i;input.maxLength=240;input.placeholder=i<quickDefaults.length?quickDefaults[i]:'Optional';input.value=quickSource[i]||'';label.appendChild(input);quickContainer.appendChild(label);}
const emojiDefaults=[
{key:'1f602',emoji:'😂',label:'face with tears of joy'},{key:'2764',emoji:'❤️',label:'red heart'},
{key:'1f60d',emoji:'😍',label:'smiling face with heart-eyes'},{key:'1f923',emoji:'🤣',label:'rolling on the floor laughing'},
{key:'1f60a',emoji:'😊',label:'smiling face with smiling eyes'},{key:'1f64f',emoji:'🙏',label:'folded hands'},
{key:'1f495',emoji:'💕',label:'two hearts'},{key:'1f62d',emoji:'😭',label:'loudly crying face'},
{key:'1f618',emoji:'😘',label:'face blowing a kiss'},{key:'1f44d',emoji:'👍',label:'thumbs up'},
{key:'1f605',emoji:'😅',label:'grinning face with sweat'},{key:'1f44f',emoji:'👏',label:'clapping hands'},
{key:'1f601',emoji:'😁',label:'beaming face with smiling eyes'},{key:'1f525',emoji:'🔥',label:'fire'},
{key:'1f494',emoji:'💔',label:'broken heart'}
];
let emojiCatalog=[],emojiByKey=new Map(),editingEmojiSlot=0;
let emojiReplies=(Array.isArray(initial.emojiReplies)&&initial.emojiReplies.length===15?initial.emojiReplies:emojiDefaults).map((value,index)=>typeof value==='object'&&value.key?value:emojiDefaults[index]).slice(0,15);
function emojiThumb(entry){const span=document.createElement('span'),id=Number(entry&&entry.id);span.className='emoji-thumb';if(Number.isFinite(id)){span.style.backgroundPosition=(-((id%64)*24))+'px '+(-Math.floor(id/64)*24)+'px';}else{span.style.backgroundImage='none';span.textContent=entry&&entry.emoji||'';}span.title=entry&&entry.label||'Emoji';return span;}
function resolveEmoji(value){return emojiByKey.get(value&&value.key)||value;}
function renderEmojiSlots(){const container=document.getElementById('emojiSlots');container.innerHTML='';emojiReplies.forEach((saved,index)=>{const entry=resolveEmoji(saved),row=document.createElement('div'),choose=document.createElement('button'),up=document.createElement('button'),down=document.createElement('button');row.className='emoji-slot';row.appendChild(emojiThumb(entry));choose.type='button';choose.className='emoji-choice';choose.textContent=(index+1)+'. '+(entry.label||'Choose emoji');choose.onclick=()=>openEmojiPicker(index);up.type=down.type='button';up.className=down.className='secondary';up.textContent='↑';down.textContent='↓';up.title='Move earlier';down.title='Move later';up.disabled=index===0;down.disabled=index===emojiReplies.length-1;up.onclick=()=>moveEmoji(index,-1);down.onclick=()=>moveEmoji(index,1);row.appendChild(choose);row.appendChild(up);row.appendChild(down);container.appendChild(row);});}
function moveEmoji(index,direction){const target=index+direction;if(target<0||target>=emojiReplies.length)return;const value=emojiReplies[index];emojiReplies[index]=emojiReplies[target];emojiReplies[target]=value;renderEmojiSlots();}
function openEmojiPicker(index){editingEmojiSlot=index;document.getElementById('emojiPicker').className='emoji-picker';document.getElementById('emojiSearch').value='';renderEmojiGrid();document.getElementById('emojiSearch').focus();}
function closeEmojiPicker(){document.getElementById('emojiPicker').className='emoji-picker hidden';}
function renderEmojiGrid(){const query=document.getElementById('emojiSearch').value.trim().toLowerCase(),group=document.getElementById('emojiGroup').value,grid=document.getElementById('emojiGrid');grid.innerHTML='';const matches=emojiCatalog.filter(entry=>(!group||entry.group===group)&&(!query||(entry.label+' '+entry.subgroup).toLowerCase().includes(query))).slice(0,240);matches.forEach(entry=>{const button=document.createElement('button');button.type='button';button.title=entry.label;button.setAttribute('aria-label',entry.label);button.appendChild(emojiThumb(entry));button.onclick=()=>{emojiReplies[editingEmojiSlot]=entry;renderEmojiSlots();closeEmojiPicker();};grid.appendChild(button);});if(!matches.length){const empty=document.createElement('div');empty.className='emoji-empty';empty.textContent='No matching emoji';grid.appendChild(empty);}}
renderEmojiSlots();document.getElementById('closeEmojiPicker').onclick=closeEmojiPicker;document.getElementById('emojiSearch').oninput=renderEmojiGrid;document.getElementById('emojiGroup').onchange=renderEmojiGrid;
fetch('/emoji/catalog.json?v=17-1').then(response=>response.json()).then(data=>{emojiCatalog=Array.isArray(data.entries)?data.entries:[];emojiByKey=new Map(emojiCatalog.map(entry=>[entry.key,entry]));emojiReplies=emojiReplies.map((entry,index)=>emojiByKey.get(entry.key)||emojiDefaults[index]);const groups=[...new Set(emojiCatalog.map(entry=>entry.group))],select=document.getElementById('emojiGroup');groups.forEach(group=>{const option=document.createElement('option');option.value=option.textContent=group;select.appendChild(option);});renderEmojiSlots();}).catch(()=>{});
const serviceOptions=[['apple_messages','Apple Messages'],['beeper','Beeper / Matrix'],['discord','Discord'],['google_chat','Google Chat'],['google_messages','Google Messages'],['google_voice','Google Voice'],['instagram','Instagram'],['line','LINE'],['linkedin','LinkedIn'],['messenger','Messenger'],['signal','Signal'],['slack','Slack'],['telegram','Telegram'],['x','X / Twitter'],['whatsapp','WhatsApp'],['other','Other services']],enabledSource=Array.isArray(initial.services)?initial.services:null,serviceContainer=document.getElementById('services');
serviceOptions.forEach(option=>{const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=option[0];input.checked=!enabledSource||enabledSource.includes(option[0]);label.appendChild(input);label.appendChild(document.createTextNode(option[1]));serviceContainer.appendChild(label);});
const inboxOptions=[['primary','Primary'],['low-priority','Low Priority'],['archive','Archived']],inboxSource=Array.isArray(initial.inboxes)&&initial.inboxes.length?initial.inboxes:['primary'],inboxContainer=document.getElementById('inboxes');
inboxOptions.forEach(option=>{const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=option[0];input.checked=inboxSource.includes(option[0]);label.appendChild(input);label.appendChild(document.createTextNode(option[1]));inboxContainer.appendChild(label);});
document.getElementById('openClawApprovals').checked=initial.openClawApprovals===true;
const appleAliases=initial.appleAliases&&typeof initial.appleAliases==='object'?initial.appleAliases:{},appleCandidates=Array.isArray(initial.appleCandidates)?initial.appleCandidates:[],appleLinks=document.getElementById('appleLinks');
appleCandidates.forEach(candidate=>{if(!candidate||!candidate.id)return;const box=document.createElement('div'),label=document.createElement('label'),input=document.createElement('input');box.className='apple-link';label.textContent=candidate.label||'Apple conversation';input.placeholder='Contact name (optional)';input.maxLength=56;input.value=appleAliases[candidate.id]||candidate.alias||'';input.dataset.chatId=candidate.id;box.appendChild(label);box.appendChild(input);appleLinks.appendChild(box);});document.getElementById('appleLinksEmpty').className=appleCandidates.length?'hidden':'hint';
let themes=defaults.concat((initial.themes||[]).filter(t=>!t.builtIn&&!defaults.some(d=>d.id===t.id))).slice(0,26),currentId=(initial.theme&&initial.theme.id)||'classic';
function selected(){return themes.find(t=>t.id===currentId)||themes[0];}
function renderOptions(){themeSelect.innerHTML='';themes.forEach(t=>{const o=document.createElement('option');o.value=t.id;o.textContent=(t.builtIn?'Preset — ':'Custom — ')+t.name;themeSelect.appendChild(o);});themeSelect.value=currentId;}
function loadEditor(){const t=selected();document.getElementById('themeName').value=t.name;['background','text','muted','accent','accentText','font','size'].forEach(k=>document.getElementById(k).value=t[k]);document.getElementById('deleteTheme').disabled=Boolean(t.builtIn);renderPreview();}
function renderPreview(){const t=selected(),p=document.getElementById('preview'),families={inter:'Inter,Arial,sans-serif',roboto:'Roboto,Arial,sans-serif','open-sans':'Open Sans,Arial,sans-serif',montserrat:'Montserrat,Arial,sans-serif',poppins:'Poppins,Arial,sans-serif'};p.style.background=t.background;p.style.color=t.text;p.style.fontFamily=families[t.font]||families.inter;p.style.fontSize=t.size+'px';p.querySelector('.preview-muted').style.color=t.muted;const b=p.querySelector('.preview-button');b.style.background=t.accent;b.style.color=t.accentText;}
function updateTheme(){let t=selected();if(t.builtIn){t=Object.assign({},t,{id:'custom-'+Date.now(),name:t.name+' Custom',builtIn:false});themes.push(t);currentId=t.id;}t.name=document.getElementById('themeName').value.trim()||'Custom';['background','text','muted','accent','accentText','font'].forEach(k=>t[k]=document.getElementById(k).value);t.size=Number(document.getElementById('size').value);renderOptions();document.getElementById('deleteTheme').disabled=false;renderPreview();}
renderOptions();if(!themes.some(t=>t.id===currentId)){themes.push(Object.assign({},initial.theme,{builtIn:false}));currentId=initial.theme.id;renderOptions();}loadEditor();
themeSelect.onchange=()=>{currentId=themeSelect.value;loadEditor();};fields.forEach(id=>document.getElementById(id).oninput=updateTheme);
document.getElementById('newTheme').onclick=()=>{const base=selected(),id='custom-'+Date.now();themes.push(Object.assign({},base,{id:id,name:'My theme',builtIn:false}));currentId=id;renderOptions();loadEditor();document.getElementById('themeName').focus();};
document.getElementById('deleteTheme').onclick=()=>{const t=selected();if(t.builtIn)return;themes=themes.filter(x=>x.id!==t.id);currentId='classic';renderOptions();loadEditor();};
const pairingPanel=document.getElementById('pairing'),intro=document.getElementById('intro'),saveButton=document.getElementById('save');
const generalTab=document.getElementById('generalTab'),buttonsTab=document.getElementById('buttonsTab'),generalPanel=document.getElementById('generalPanel'),buttonsPanel=document.getElementById('buttonsPanel');function showTab(buttons){generalPanel.className=buttons?'hidden':'';buttonsPanel.className=buttons?'':'hidden';generalTab.className=buttons?'tab':'tab active';buttonsTab.className=buttons?'tab active':'tab';}generalTab.onclick=()=>showTab(false);buttonsTab.onclick=()=>showTab(true);
function requirePairing(message){initial.gatewayToken='';pairingPanel.className='';intro.textContent='Reconnect this Pebble with your private Mac companion.';saveButton.textContent='Test connection & pair';s.className='error';s.textContent=message||'The saved pairing expired. Enter the current code from Beepster Connector.';}
const paired=Boolean(initial.gatewayToken);if(paired){pairingPanel.className='hidden';intro.textContent='Adjust Beepster without pairing again.';saveButton.textContent='Test connection, save & apply';s.textContent='Checking the saved gateway credential…';fetch('/v1/chats?limit=1',{headers:{authorization:'Bearer '+initial.gatewayToken}}).then(response=>{if(!response.ok)requirePairing();else s.textContent='Your gateway credential remains on the phone.';}).catch(()=>{s.className='error';s.textContent='Could not reach the Mac gateway. Check Tailscale and try again.';});}
if(typeof initial.refresh==='number')document.getElementById('refresh').value=String(initial.refresh);
f.onsubmit=async(e)=>{e.preventDefault();updateTheme();s.className='hint';s.textContent='Testing…';try{let token=initial.gatewayToken||'';if(token){const test=await fetch('/v1/chats?limit=1',{headers:{authorization:'Bearer '+token}});if(!test.ok){requirePairing();return;}}else{const code=document.getElementById('code').value.trim();if(!code)throw new Error('Enter the current pairing code from Beepster Connector.');const r=await fetch('/pair',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:code})});const j=await r.json();if(!r.ok)throw new Error(j.error||'Pairing failed');token=j.gatewayToken;}const chosen=selected(),custom=themes.filter(t=>!t.builtIn).slice(0,20),quickReplies=[],services=[...serviceContainer.querySelectorAll('input:checked')].map(input=>input.value),inboxes=[...inboxContainer.querySelectorAll('input:checked')].map(input=>input.value),savedAppleAliases={},buttonBindings=[];if(!inboxes.length)throw new Error('Choose at least one inbox section.');for(let i=0;i<8;i++){const reply=document.getElementById('quickReply'+i).value.trim();if(reply)quickReplies.push(reply);}for(let i=0;i<14;i++)buttonBindings.push(document.getElementById('buttonBinding'+i).value);appleLinks.querySelectorAll('input').forEach(input=>{const alias=input.value.trim();if(alias)savedAppleAliases[input.dataset.chatId]=alias;});const value={gatewayURL:location.origin,gatewayToken:token,theme:chosen,themes:custom,quickReplies:quickReplies,emojiReplies:emojiReplies.map(entry=>{const resolved=resolveEmoji(entry);return {key:resolved.key,emoji:resolved.emoji,label:resolved.label,id:resolved.id};}),services:services,inboxes:inboxes,openClawApprovals:document.getElementById('openClawApprovals').checked,appleAliases:savedAppleAliases,buttonBindings:buttonBindings,textSize:chosen.size>=26?'large':'normal',refresh:Number(document.getElementById('refresh').value)};location.href='pebblejs://close#'+encodeURIComponent(JSON.stringify(value));}catch(err){s.className='error';s.textContent=err.message;}};
</script></body></html>`;
  html = organikSettingsHTML(html, {"app":"beepster","fields":{"text":"text","background":"background","accent":"accent","muted":"muted","accentText":"accentText","font":"font","size":"size"},"watchColors":["#000000","#001e41","#004387","#0068ca","#2b4a2c","#27514f","#16638d","#007dce","#5e9860","#5c9b72","#57a5a2","#4cb4db","#8ee391","#8ee69e","#8aebc0","#84f5f1","#4a161b","#482748","#40488a","#2f6bcc","#564e36","#545454","#4f6790","#4180d0","#759a64","#759d76","#71a6a4","#69b5dd","#9ee594","#9de7a0","#9becc2","#95f6f2","#99353f","#983e5a","#955694","#8f74d2","#9d5b4d","#9d6064","#9a7099","#9587d5","#afa072","#aea382","#ababab","#a7bae2","#c9e89d","#c9eaa7","#c7f0c8","#c3f9f7","#e35462","#e25874","#e16aa3","#de83dc","#e66e6b","#e6727c","#e37fa7","#e194df","#f1aa86","#f1ad93","#efb5b8","#ecc3eb","#ffeeab","#fff1b5","#fff6d3","#ffffff"],"library":false,"apply":true});
  return html;
}
