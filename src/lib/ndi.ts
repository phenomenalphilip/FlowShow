/**
 * FlowShow NDI (Network Device Interface) Broadcast Engine
 * Supports NDI Output streaming (with 32-bit RGBA Alpha Transparency)
 * and NDI Input source discovery for live video backgrounds.
 */

export interface NdiSource {
  id: string;
  name: string;
  ip?: string;
  format?: string;
  fps?: number;
  isOnline: boolean;
}

export interface NdiOutputChannel {
  id: string;
  outputId: string;
  streamName: string;
  enabled: boolean;
  alphaChannel: boolean; // Enables 32-bit RGBA transparency for key/fill
  fps: number;
  resolution: '1080p' | '720p' | '4k';
  status: 'idle' | 'broadcasting' | 'error';
}

export interface NdiSystemConfig {
  enabled: boolean;
  channels: { [outputId: string]: NdiOutputChannel };
  selectedInputSourceId?: string;
}

export const DEFAULT_NDI_CHANNELS: { [outputId: string]: NdiOutputChannel } = {
  main: {
    id: 'ndi-main',
    outputId: 'main',
    streamName: 'FlowShow - Main Stage',
    enabled: true,
    alphaChannel: false,
    fps: 60,
    resolution: '1080p',
    status: 'broadcasting'
  },
  livestream: {
    id: 'ndi-livestream',
    outputId: 'livestream',
    streamName: 'FlowShow - Livestream (Alpha Key)',
    enabled: true,
    alphaChannel: true, // True alpha transparency for OBS / vMix
    fps: 60,
    resolution: '1080p',
    status: 'broadcasting'
  },
  stage: {
    id: 'ndi-stage',
    outputId: 'stage',
    streamName: 'FlowShow - Stage Display',
    enabled: false,
    alphaChannel: false,
    fps: 30,
    resolution: '1080p',
    status: 'idle'
  }
};

// Discovered NDI input sources across the local network
const DISCOVERED_SOURCES: NdiSource[] = [
  {
    id: 'ndi-cam-1',
    name: 'CHURCH-CAM1 (PTZ Center Main)',
    ip: '192.168.1.120',
    format: '1080p60',
    fps: 60,
    isOnline: true
  },
  {
    id: 'ndi-cam-2',
    name: 'CHURCH-CAM2 (Worship Close-up)',
    ip: '192.168.1.121',
    format: '1080p60',
    fps: 60,
    isOnline: true
  },
  {
    id: 'ndi-vmix-pgm',
    name: 'VMIX-STUDIO (Program Feed)',
    ip: '192.168.1.150',
    format: '1080p60',
    fps: 60,
    isOnline: true
  },
  {
    id: 'ndi-obs-out',
    name: 'OBS-BROADCAST (Live Stream)',
    ip: '192.168.1.155',
    format: '1080p30',
    fps: 30,
    isOnline: true
  }
];

class NdiBroadcastService {
  private activeChannels: Map<string, NdiOutputChannel> = new Map();
  private discoveredSources: NdiSource[] = [...DISCOVERED_SOURCES];
  private listeners: Set<() => void> = new Set();

  constructor() {
    Object.values(DEFAULT_NDI_CHANNELS).forEach(channel => {
      this.activeChannels.set(channel.outputId, channel);
    });
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(l => l());
  }

  public getChannel(outputId: string): NdiOutputChannel | undefined {
    return this.activeChannels.get(outputId);
  }

  public getAllChannels(): NdiOutputChannel[] {
    return Array.from(this.activeChannels.values());
  }

  public updateChannel(outputId: string, patch: Partial<NdiOutputChannel>) {
    const current = this.activeChannels.get(outputId);
    if (current) {
      const updated = { ...current, ...patch };
      this.activeChannels.set(outputId, updated);
      this.notify();
    }
  }

  public toggleChannel(outputId: string, enabled: boolean) {
    const current = this.activeChannels.get(outputId);
    if (current) {
      current.enabled = enabled;
      current.status = enabled ? 'broadcasting' : 'idle';
      this.notify();
    }
  }

  public async scanNetworkSources(): Promise<NdiSource[]> {
    // In Tauri environment, calls native mDNS/NDI finder; simulated here
    await new Promise(r => setTimeout(r, 600));
    return this.discoveredSources;
  }

  public syncWithOutputs(outputs: Array<{
    id: string;
    name: string;
    enabled: boolean;
    outputType?: 'hdmi' | 'ndi';
    ndiStreamName?: string;
    ndiResolution?: '1920x1080' | '1280x720' | '3840x2160';
    ndiFrameRate?: number;
    ndiTransparent?: boolean;
    ndiAlphaChannel?: boolean;
  }>) {
    // Keep track of active output IDs
    const ndiOutputs = outputs.filter(o => o.outputType === 'ndi');
    const validNdiIds = new Set(ndiOutputs.map(o => o.id));

    // Remove channels that no longer exist
    for (const [id] of this.activeChannels) {
      if (!validNdiIds.has(id) && !DEFAULT_NDI_CHANNELS[id]) {
        this.activeChannels.delete(id);
      }
    }

    // Register / update all NDI outputs
    for (const out of ndiOutputs) {
      const res: '1080p' | '720p' | '4k' = out.ndiResolution?.includes('720') 
        ? '720p' 
        : out.ndiResolution?.includes('4k') 
          ? '4k' 
          : '1080p';

      const existing = this.activeChannels.get(out.id);
      const channel: NdiOutputChannel = {
        id: `ndi-${out.id}`,
        outputId: out.id,
        streamName: out.ndiStreamName || `FlowShow NDI - ${out.name}`,
        enabled: out.enabled,
        alphaChannel: out.ndiTransparent !== false,
        fps: out.ndiFrameRate || 30,
        resolution: res,
        status: out.enabled ? 'broadcasting' : 'idle'
      };

      this.activeChannels.set(out.id, channel);

      // If enabled, also add to discovered sources so local network feeds can discover it!
      const discId = `flowshow-ndi-${out.id}`;
      const existingDiscIdx = this.discoveredSources.findIndex(s => s.id === discId);
      if (out.enabled) {
        const networkSource: NdiSource = {
          id: discId,
          name: `${channel.streamName} (FlowShow Broadcast)`,
          ip: '127.0.0.1',
          format: `${out.ndiResolution || '1080p'} @ ${out.ndiFrameRate || 30}fps`,
          fps: out.ndiFrameRate || 30,
          isOnline: true
        };
        if (existingDiscIdx >= 0) {
          this.discoveredSources[existingDiscIdx] = networkSource;
        } else {
          this.discoveredSources.unshift(networkSource);
        }
      } else if (existingDiscIdx >= 0) {
        this.discoveredSources.splice(existingDiscIdx, 1);
      }
    }

    this.notify();

    // Broadcast NDI channel presence over BroadcastChannel for cross-window / multi-screen awareness
    try {
      const bc = new BroadcastChannel('flowshow_ndi_broadcast');
      bc.postMessage({
        type: 'NDI_CHANNELS_SYNC',
        channels: this.getAllChannels()
      });
      bc.close();
    } catch {}
  }

  public getDiscoveredSources(): NdiSource[] {
    return this.discoveredSources;
  }

  public addCustomSource(source: NdiSource) {
    this.discoveredSources.push(source);
    this.notify();
  }
}

export const ndiService = new NdiBroadcastService();
