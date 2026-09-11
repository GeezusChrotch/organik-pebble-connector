import test from 'node:test';
import assert from 'node:assert/strict';
import {Display} from '../pome/src/display';
import type {EvenAppBridge} from '@evenrealities/even_hub_sdk';
// Exercise the public capture method with a pending display update and SDK acknowledgements.
test('microphone waits for page work and a negative stop acknowledgement preserves capture',async()=>{
 const display=new Display({} as HTMLElement,false);let complete!:()=>void;let called=false;
 (display as any).started=true;(display as any).chain=new Promise<void>(r=>complete=r);
 display.bridge={audioControl:async(open:boolean)=>{called=true;return open;}} as EvenAppBridge;
 const recording=display.record(true);await Promise.resolve();assert.equal(called,false);complete();await recording;assert.equal(called,true);
 await assert.doesNotReject(display.record(false));assert.match(display.microphoneStatus,/keeping captured audio/);
});
test('capture refuses to start before the glasses startup page succeeds',async()=>{
 const display=new Display({} as HTMLElement,false);let called=false;
 display.bridge={audioControl:async()=>{called=true;return true;}} as unknown as EvenAppBridge;
 await assert.rejects(display.record(true),/page not ready/);assert.equal(called,false);
});
test('hold gestures never invoke dictation even with legacy voice settings',async()=>{
 const {Pome}=await import('../pome/src/controller');const d=new Display({} as HTMLElement,false);
 const p=new Pome({settings:{longPress:'voice'}} as any,d);let starts=0;p.beginRecording=async()=>{starts++;};
 await p.input(9);await p.input(10);assert.equal(starts,0);d.onDictate();assert.equal(starts,1);
});
