import { availableMonitors, Monitor } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

export const isTauri = () => ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

export async function getMonitors(): Promise<Monitor[]> {
  if (!isTauri()) return [];
  try {
    return await availableMonitors();
  } catch (e) {
    console.error("Failed to get monitors:", e);
    return [];
  }
}

export async function openProjectorOnMonitor(monitor: Monitor): Promise<void> {
  if (!isTauri()) return;
  try {
    // Check if it already exists
    const existing = await WebviewWindow.getByLabel('projector');
    if (existing) {
      existing.destroy(); // We don't await because it might hang if it errors out
    }

    const { x, y } = monitor.position;
    
    const projector = new WebviewWindow('projector', {
      url: '/#/projector',
      x,
      y,
      width: monitor.size.width,
      height: monitor.size.height,
      fullscreen: true,
      decorations: false,
      title: 'Flowshow Projector',
    });

    projector.once('tauri://created', function () {
      console.log('Projector window created');
    });

    projector.once('tauri://error', function (e) {
      console.error('Error creating projector', e);
    });

  } catch (e) {
    console.error("Failed to open projector window:", e);
  }
}

export async function closeProjector(): Promise<void> {
  if (!isTauri()) return;
  try {
    const existing = await WebviewWindow.getByLabel('projector');
    if (existing) {
      existing.close();
    }
  } catch (e) {
    console.error("Failed to close projector window:", e);
  }
}
