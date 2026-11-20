import { availableMonitors, Monitor } from '@tauri-apps/api/window';

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

/**
 * Open (or move) an output window full screen on the monitor with this name: the screen plugged into HDMI,
 * DisplayPort or any other port. Falls back to the first screen that isn't the operator's own screen.
 */
export async function openOutputOnMonitor(
  label: string, url: string, title: string, monitorName: string,
  /** Asked first when the output would cover the screen FlowShow itself is on; false = don't open */
  confirmCoverOwnScreen?: (screenName: string) => boolean | Promise<boolean>,
): Promise<'opened' | 'cancelled'> {
  const monitors = await availableMonitors();
  const { primaryMonitor, currentMonitor } = await import('@tauri-apps/api/window');
  const primary = await primaryMonitor();
  // The operator's own screen: ask first, take the keyboard (so Esc closes it), and show how to get back
  const own = await currentMonitor().catch(() => null);
  // Windows renames screens when they are plugged in again (DISPLAY5 → DISPLAY6): then use another screen
  // that isn't FlowShow's own (or the main one), so the output still reaches the projector
  const target = monitors.find(m => m.name === monitorName)
    ?? monitors.find(m => m.name !== own?.name && m.name !== primary?.name)
    ?? monitors.find(m => m.name !== own?.name)
    ?? monitors[0];
  if (!target) throw new Error('no screens found');
  const coversOwnScreen = !!own && own.name === target.name;
  if (coversOwnScreen && confirmCoverOwnScreen && !(await confirmCoverOwnScreen(target.name || 'this screen'))) return 'cancelled';
  // Made by the native side so it gets the same WebView settings as the main window (src-tauri/src/lib.rs)
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('open_output_window', {
    label, url: coversOwnScreen ? `${url}?operator=1` : url, title: `FlowShow - ${title}`,
    x: target.position.x, y: target.position.y, width: target.size.width, height: target.size.height,
    fullscreen: true, transparent: false, onTop: true, skipTaskbar: !coversOwnScreen, focus: coversOwnScreen,
  });
  return 'opened';
}
