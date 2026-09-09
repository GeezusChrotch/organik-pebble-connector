import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {configurationPage} from '../src/configuration-page.js';
test('settings gives Double Back unique slots and defaults when opened from an older phone config',()=>{
 const html=configurationPage(),start=html.indexOf('const buttonDefaults='),end=html.indexOf("buildButtonControls('chatButtons',6);",start)+"buildButtonControls('chatButtons',6);".length;
 const elements={};
 function node(){return {children:[],appendChild(child){this.children.push(child);if(child.id)elements[child.id]=child;}};}
 elements.threadButtons=node();elements.chatButtons=node();
 const initial={buttonBindings:Array(12).fill('scroll_down')};
 vm.runInNewContext(html.slice(start,end),{initial,document:{getElementById:id=>elements[id],createElement:node}});
 assert.equal(elements.threadButtons.children.length,7);assert.equal(elements.chatButtons.children.length,7);
 for(let i=0;i<12;i++)assert.equal(elements['buttonBinding'+i].value,'scroll_down');
 assert.equal(elements.buttonBinding12.value,'main_top');assert.equal(elements.buttonBinding13.value,'main_top');
 assert.ok(elements.buttonBinding13.children.some(option=>option.value==='none'));
 assert.match(html,/i<14;i\+\+\)buttonBindings.push/);
});
