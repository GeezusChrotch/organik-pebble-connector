import {opendir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {isAbsolute, join} from 'node:path';

// Run in the actual managed gateway, whose macOS access can differ from the UI.
// Open and close the attachment directory without enumerating names or contents.
export async function probeMediaAccess({platform = process.platform, openDirectory = opendir,
  directory, environment = process.env} = {}) {
  if (platform !== 'darwin') return {supported:false, allowed:null, code:'NOT_APPLICABLE'};
  if (environment.BEEPSTER_DISTRIBUTION === 'app-store') {
    directory = environment.BEEPSTER_ATTACHMENTS_DIR;
    if (!directory || !isAbsolute(directory)) return {supported:true, allowed:false, code:'SETUP_REQUIRED'};
  } else directory ||= join(homedir(), 'Library', 'Messages', 'Attachments');
  try {
    const handle = await openDirectory(directory);
    await handle.close();
    return {supported:true, allowed:true, code:'READY'};
  } catch (error) {
    if (['EPERM','EACCES'].includes(error.code)) return {supported:true, allowed:false, code:'MEDIA_PERMISSION'};
    if (error.code === 'ENOENT') return {supported:true, allowed:null, code:'NO_LOCAL_ATTACHMENTS'};
    return {supported:true, allowed:null, code:'CHECK_FAILED'};
  }
}
