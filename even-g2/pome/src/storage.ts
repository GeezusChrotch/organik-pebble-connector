import {loadSettings,type Settings} from './model';
export const settingsKey='org.organikapps.pome.settings.v1';
interface NativeStorage {getLocalStorage(key:string):Promise<string>;setLocalStorage(key:string,value:string):Promise<boolean>}
export class SettingsStore {
 private ready=false;
 constructor(private native:NativeStorage,private browser:Pick<Storage,'getItem'|'setItem'>){}
 async load():Promise<Settings>{
  // A failed native read must not turn into an empty settings write.
  const raw=await this.native.getLocalStorage(settingsKey);
  if(raw){const result=this.decode(raw);this.ready=true;return result;}
  let legacy:string|null=null;try{legacy=this.browser.getItem('pome.settings');}catch{}
  const settings=legacy?this.decode(legacy):loadSettings('{}');
  if(legacy){if(!await this.native.setLocalStorage(settingsKey,JSON.stringify(settings)))throw new Error('Even could not preserve the existing settings. Reopen Pome and retry.');}
  this.ready=true;return settings;
 }
 private decode(raw:string):Settings{
  const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Saved settings could not be read. No settings were replaced.');
  return loadSettings(raw);
 }
 async save(settings:Settings):Promise<void>{
  if(!this.ready)throw new Error('Wait for saved settings to load before saving.');
  const raw=JSON.stringify(settings);
  if(!await this.native.setLocalStorage(settingsKey,raw))throw new Error('Even could not save your settings. Please retry before closing Pome.');
  try{this.browser.setItem('pome.settings',raw);}catch{} // Optional cache; native storage is authoritative.
 }
}
