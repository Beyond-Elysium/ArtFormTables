/**
 * YouTube connector — Data API v3 channel statistics.
 * Auth: a simple API key (no OAuth needed for public channel stats).
 *
 * Env: YOUTUBE_API_KEY.  Config: { channelId }.
 *
 * Note: the Data API exposes lifetime snapshots (subscribers, views, video
 * count) and recent uploads — not day-by-day history (that needs the OAuth
 * YouTube Analytics API). So this source renders stats + a recent-videos
 * breakdown, with no timeseries panel.
 */
import "server-only";
import type { Connector, ConnectorContext, Panel } from "./types";
import { rng } from "./mock";
import { num } from "./util";

interface YouTubeConfig {
  channelId: string;
}

function apiKey(): string | undefined {
  return process.env.YOUTUBE_API_KEY;
}

async function yt(path: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams({ key: apiKey()!, ...params });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${qs}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`YouTube ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchLive(config: YouTubeConfig): Promise<Panel[]> {
  const channel = await yt("channels", { part: "statistics", id: config.channelId });
  const stats = channel.items?.[0]?.statistics ?? {};

  const search = await yt("search", {
    part: "snippet",
    channelId: config.channelId,
    order: "date",
    type: "video",
    maxResults: "10",
  });
  const items: any[] = search.items ?? [];
  const ids = items.map((i) => i.id?.videoId).filter(Boolean);
  const titles = new Map<string, string>(
    items.map((i) => [i.id?.videoId, i.snippet?.title ?? "(untitled)"]),
  );

  let videos: { label: string; value: number }[] = [];
  if (ids.length) {
    const vids = await yt("videos", { part: "statistics", id: ids.join(",") });
    videos = (vids.items ?? [])
      .map((v: any) => ({ label: titles.get(v.id) ?? v.id, value: num(v.statistics?.viewCount) }))
      .sort((a: any, b: any) => b.value - a.value);
  }

  return buildPanels(
    {
      subscribers: num(stats.subscriberCount),
      views: num(stats.viewCount),
      videos: num(stats.videoCount),
    },
    videos,
  );
}

function fetchMock(config: YouTubeConfig, ctx: ConnectorContext): Panel[] {
  const rand = rng(`yt:${config.channelId}:${ctx.range}`);
  const subscribers = 5_000 + Math.floor(rand() * 500_000);
  const views = subscribers * (50 + Math.floor(rand() * 200));
  const videos = 20 + Math.floor(rand() * 400);
  const titles = [
    "How we built it — full walkthrough",
    "Top 10 tips for 2026",
    "Behind the scenes",
    "Q&A: your questions answered",
    "Product launch livestream",
    "A day in the life",
    "Tutorial: getting started",
    "The big announcement",
  ];
  const recent = titles
    .map((label) => ({ label, value: Math.floor(views * (0.001 + rand() * 0.01)) }))
    .sort((a, b) => b.value - a.value);
  return buildPanels({ subscribers, views, videos }, recent);
}

function buildPanels(
  m: { subscribers: number; views: number; videos: number },
  recent: { label: string; value: number }[],
): Panel[] {
  return [
    { kind: "stat", label: "Subscribers", value: m.subscribers, format: "compact" },
    { kind: "stat", label: "Total views", value: m.views, format: "compact" },
    { kind: "stat", label: "Videos", value: m.videos, format: "number" },
    { kind: "breakdown", title: "Recent videos by views", display: "table", valueLabel: "Views", rows: recent.slice(0, 8) },
  ];
}

export const youtubeConnector: Connector<YouTubeConfig> = {
  type: "youtube",
  label: "YouTube",
  category: "Video",
  isLive: () => Boolean(apiKey()),
  async fetch(config, ctx) {
    const base = { sourceId: "youtube", label: "YouTube", category: "Video" };
    if (!apiKey()) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config), isMock: false };
    } catch (err) {
      console.error(`[youtube] live fetch failed for ${config.channelId}:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
