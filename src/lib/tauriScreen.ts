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

/**
 * Open (or move) an output window full screen on the monitor with this name: the screen plugged into HDMI,
 * DisplayPort or any other port. Falls back to the first screen that isn't the operator's own screen.
 */
export async function openOutputOnMonitor(label: string, url: string, title: string, monitorName: string): Promise<void> {
  const monitors = await availableMonitors();
  const { primaryMonitor } = await import('@tauri-apps/api/window');
  const primary = await primaryMonitor();
  const target = monitors.find(m => m.name === monitorName)
    ?? monitors.find(m => m.name !== primary?.name)
    ?? monitors[0];
  if (!target) throw new Error('no screens found');
  const { x, y } = target.position;
  const { width, height } = target.size;
  const scale = target.scaleFactor || 1;

  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    // Already open: put it back on its screen, full screen, in front
    const { PhysicalPosition, PhysicalSize } = await import('@tauri-apps/api/dpi');
    await existing.setFullscreen(false);
    await existing.setPosition(new PhysicalPosition(x, y));
    await existing.setSize(new PhysicalSize(width, height));
    await existing.setFullscreen(true);
    await existing.show();
    return;
  }
  const win = new WebviewWindow(label, {
    url,
    title: `FlowShow - ${title}`,
    // Window positions are in logical pixels
    x: x / scale,
    y: y / scale,
    width: width / scale,
    height: height / scale,
    fullscreen: true,
    decorations: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focus: false,
    backgroundColor: '#000000',
  } as any);
  await new Promise<void>((resolve, reject) => {
    win.once('tauri://created', () => resolve());
    win.once('tauri://error', (e) => reject(new Error(String((e as any)?.payload ?? 'the window could not be created'))));
  });
}
