import './style.css';
import {Display} from './display';
import {API} from './api';
import {Pome} from './controller';
import {loadSettings} from './model';
import {SettingsStore} from './storage';
import {settingsUI} from './settings';
const demo=new URLSearchParams(location.search).get('demo')==='1';
const root=document.querySelector<HTMLElement>('#app')!;
const settings=document.createElement('div');settings.className='settings';
const previewPanel=document.createElement('aside');previewPanel.className='preview-panel';
const title=document.createElement('h2');title.textContent=demo?'Interactive G2 demo':'Glasses preview';previewPanel.append(title);
const preview=document.createElement('div');preview.className='glasses';previewPanel.append(preview);
root.append(settings,previewPanel);
const display=new Display(preview,demo),api=new API(loadSettings(demo?(localStorage.getItem('pome.demo.settings')||'{}'):'{}'),demo),pome=new Pome(api,display);
for(const [name,type] of [['↑',1],['Select',0],['↓',2],['Back',3],['Dictate',9]] as const){const button=document.createElement('button');button.textContent=name;button.onclick=()=>void (name==='Dictate'?pome.beginRecording():pome.input(type));previewPanel.append(button);}
if(!demo){const displayStatus=document.createElement('p');displayStatus.setAttribute('role','status');display.onDisplayStatus=status=>{displayStatus.textContent='Glasses: '+status;};const retry=document.createElement('button');retry.textContent='Retry glasses display';retry.onclick=()=>display.retry();previewPanel.append(displayStatus,retry);}
if(!demo){const micStatus=document.createElement('p');micStatus.setAttribute('role','status');micStatus.textContent='Microphone: not started';display.onMicrophoneStatus=status=>{micStatus.textContent='Microphone: '+status;};previewPanel.append(micStatus);}
if(demo){const note=document.createElement('p');note.textContent='Sample home only. These controls do not access your real devices.';previewPanel.append(note);}
let store:SettingsStore|undefined;
const save=async()=>{if(demo)localStorage.setItem('pome.demo.settings',JSON.stringify(api.settings));else {if(!store)throw new Error('Settings are still loading.');await store.save(api.settings);}};
const renderSettings=()=>settingsUI(settings,pome,save);pome.onSnapshot=renderSettings;settings.textContent='Loading saved Pome settings…';
void (async()=>{
 if(!demo){await display.connect();store=new SettingsStore(display.bridge!,localStorage);Object.assign(api.settings,await store.load());}
 renderSettings();await pome.start();
})().catch(()=>{settings.textContent='Could not load saved settings from Even. Close and reopen Pome to retry. Your saved data has not been replaced.';});

document.addEventListener('keydown',e=>{if((e.target as HTMLElement).matches('input,textarea,select,button'))return;const type:Record<string,number>={ArrowUp:1,ArrowDown:2,Enter:0,Escape:3};if(e.key in type){e.preventDefault();void pome.input(type[e.key]);}});
