import test from 'node:test';import assert from 'node:assert/strict';import {installPhoneViewport} from '../src/phone-viewport';
test('keyboard resize and focus-out restore the scroll surface height, with fallback for older WebViews',()=>{
 const root=new EventTarget() as EventTarget & {style:{setProperty:(key:string,value:string)=>void}};let height='';root.style={setProperty:(_k,v)=>{height=v;}};
 const viewport=Object.assign(new EventTarget(),{height:844});let queued:FrameRequestCallback|undefined;
 const host=Object.assign(new EventTarget(),{visualViewport:viewport,innerHeight:844,requestAnimationFrame:(f:FrameRequestCallback)=>{queued=f;return 1;},cancelAnimationFrame:()=>{queued=undefined;}});
 const tick=()=>{const f=queued;queued=undefined;f?.(0);};const dispose=installPhoneViewport(root as unknown as HTMLElement,host as unknown as Window);
 assert.equal(height,'844px');viewport.height=390;viewport.dispatchEvent(new Event('resize'));tick();assert.equal(height,'390px');
 viewport.height=844;root.dispatchEvent(new Event('focusout'));tick();assert.equal(height,'844px');
 viewport.height=0;host.innerHeight=700;host.dispatchEvent(new Event('resize'));tick();assert.equal(height,'700px');
 dispose();viewport.height=200;viewport.dispatchEvent(new Event('resize'));tick();assert.equal(height,'700px');
});
