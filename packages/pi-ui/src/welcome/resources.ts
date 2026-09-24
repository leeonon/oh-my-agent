import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Component, TUI } from "@earendil-works/pi-tui";

const RESOURCE_POLL_INTERVAL_MS = 50;
const MAX_RESOURCE_RETRIES = 5;

export const WELCOME_SECTIONS = ["Context", "Skills", "Prompts", "Extensions"] as const;
export type WelcomeSection = (typeof WELCOME_SECTIONS)[number];

export interface WelcomeResources {
  context: string[];
  skills: string[];
  prompts: string[];
  extensions: string[];
  packageExtensions?: string[];
  sourceExtensions?: string[];
}

interface CollapsedTextComponent extends Component {
  getCollapsedText?: () => string;
  getExpandedText?: () => string;
}

interface ChildHost {
  children: Component[];
}

export interface ResourcePanel extends Component, ChildHost {}

export interface ResourceBridge {
  panel: ResourcePanel;
  parent: ChildHost;
  originalIndex: number;
}

export interface ResourcePanelLocation {
  panel: ResourcePanel;
  parent: ChildHost;
}

interface ResourcePanelSnapshot {
  resourceText: string;
  expandedExtensionsText?: string;
  requiresNativePanel: boolean;
}

interface ExtensionGroups {
  localExtensions: string[];
  packageExtensions: string[];
  sourceExtensions: string[];
}

let detachedBridge: ResourceBridge | undefined;
let detachedTui: TUI | undefined;
let cachedLocalExtensionNames: Set<string> | undefined;

export function stripAnsi(text: string): string {
  return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

function isChildHost(
  component: Component | undefined,
): component is Component & ChildHost {
  if (!component || typeof component !== "object") return false;
  return Array.isArray((component as Partial<ChildHost>).children);
}

function getSectionHeading(text: string): string | undefined {
  return stripAnsi(text.split("\n", 1)[0] ?? "")
    .trim()
    .match(/^\[([^\]]+)\]$/)?.[1];
}

export function inspectResourcePanel(panel: ResourcePanel): ResourcePanelSnapshot {
  const sections: string[] = [];
  let expandedExtensionsText: string | undefined;

  for (const child of panel.children) {
    const collapsible = child as CollapsedTextComponent;
    if (typeof collapsible.getCollapsedText === "function") {
      const text = collapsible.getCollapsedText();
      const heading = getSectionHeading(text);
      if (WELCOME_SECTIONS.some((section) => section === heading)) {
        sections.push(text);
        if (
          (heading === "Extensions" ||
            /(?:^|\n)\s*\[Extensions\]\s*(?:\n|$)/.test(stripAnsi(text))) &&
          typeof collapsible.getExpandedText === "function"
        ) {
          expandedExtensionsText = collapsible.getExpandedText();
        }
      } else if (heading !== "Themes") {
        return { resourceText: "", requiresNativePanel: true };
      }
      continue;
    }

    const hasVisibleContent = child
      .render(1_000)
      .some((line) => stripAnsi(line).trim().length > 0);
    if (hasVisibleContent) {
      return { resourceText: "", requiresNativePanel: true };
    }
  }

  return {
    resourceText: sections.join("\n"),
    ...(expandedExtensionsText ? { expandedExtensionsText } : {}),
    requiresNativePanel: false,
  };
}

function splitList(body: string[]): string[] {
  return body
    .join(" ")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeExtensionName(label: string): string {
  let name = label.trim().replace(/^npm:/, "").replace(/\\/g, "/");
  const packageSeparator = /^[A-Za-z]:\//.test(name) ? -1 : name.indexOf(":");
  const isPackageLabel = packageSeparator !== -1;
  if (isPackageLabel) name = name.slice(0, packageSeparator);

  name = name.replace(/\/$/, "");
  if (!isPackageLabel && !name.startsWith("@")) {
    if (/\/(?:index)\.(?:[cm]?[jt]s)$/.test(name)) return name;
    const segments = name.split("/").filter(Boolean);
    const fileName = segments.pop() ?? name;
    name = fileName;
  }
  return name.replace(/\.(?:[cm]?[jt]s)$/, "");
}

export function isOwnExtension(name: string): boolean {
  const normalized = name.replace(/\\/g, "/");
  return (
    name === "pi-ui" ||
    name === "welcome-screen" ||
    name === "pi-welcome-screen" ||
    /\/(?:packages\/)?pi-ui(?:\/|$)/.test(normalized) ||
    /\/(?:pi-)?welcome-screen(?:\/|$)/.test(normalized)
  );
}

export function sortExtensionNames(names: string[]): string[] {
  return [...names].sort((left, right) => {
    const scopeOrder =
      Number(left.startsWith("@")) - Number(right.startsWith("@"));
    return scopeOrder || left.localeCompare(right);
  });
}

function unique(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

function isPackageSource(label: string): boolean {
  return label.startsWith("npm:") || label.startsWith("git:");
}

function normalizePackageSource(label: string): string {
  return label.replace(/^(?:npm|git):/, "");
}

function isExplicitSourcePath(label: string): boolean {
  const normalized = label.replace(/\\/g, "/");
  return (
    normalized.startsWith("/") ||
    normalized.startsWith("~/") ||
    normalized.startsWith("./") ||
    normalized.startsWith("../") ||
    /^[A-Za-z]:\//.test(normalized) ||
    /\/(?:index)\.(?:[cm]?[jt]s)$/.test(normalized)
  );
}

function parseExpandedExtensionGroups(
  text: string | undefined,
  localExtensionNames: Set<string>,
): ExtensionGroups | undefined {
  if (!text || getSectionHeading(text) !== "Extensions") return undefined;

  const localExtensions: string[] = [];
  const packageExtensions: string[] = [];
  const sourceExtensions: string[] = [];
  let foundItem = false;

  for (const rawLine of text.split("\n").slice(1)) {
    const line = stripAnsi(rawLine).replace(/\s+$/, "");
    const packageSource = line.match(/^ {4}((?:npm|git):.+)$/)?.[1];
    if (packageSource) {
      packageExtensions.push(normalizePackageSource(packageSource));
      foundItem = true;
      continue;
    }

    const path = line.match(/^ {4}(\S.*)$/)?.[1];
    if (!path || /^(?:project|user|path)$/.test(path)) continue;

    const name = normalizeExtensionName(path);
    if (
      localExtensionNames.has(name) ||
      /(?:^|\/)\.pi\/(?:agent\/)?extensions(?:\/|$)/.test(
        path.replace(/\\/g, "/"),
      )
    ) {
      localExtensions.push(name);
    } else {
      sourceExtensions.push(path.replace(/\\/g, "/"));
    }
    foundItem = true;
  }

  if (!foundItem) return undefined;
  return {
    localExtensions: sortExtensionNames(unique(localExtensions)),
    packageExtensions: sortExtensionNames(unique(packageExtensions)),
    sourceExtensions: sortExtensionNames(unique(sourceExtensions)),
  };
}

function classifyCompactExtensionLabels(
  labels: string[],
  localExtensionNames: Set<string>,
): ExtensionGroups {
  const localExtensions: string[] = [];
  const packageExtensions: string[] = [];
  const sourceExtensions: string[] = [];

  for (const label of labels) {
    const name = normalizeExtensionName(label);
    const indexParent = label
      .replace(/\\/g, "/")
      .match(/(?:^|\/)([^/]+)\/index\.(?:[cm]?[jt]s)$/)?.[1];
    if (
      localExtensionNames.has(name) ||
      localExtensionNames.has(indexParent ?? "")
    )
      localExtensions.push(name);
    else if (isPackageSource(label) || name.startsWith("@"))
      packageExtensions.push(
        isPackageSource(label) ? normalizePackageSource(label) : name,
      );
    else if (isExplicitSourcePath(label)) sourceExtensions.push(name);
    else packageExtensions.push(name);
  }

  return {
    localExtensions: sortExtensionNames(unique(localExtensions)),
    packageExtensions: sortExtensionNames(unique(packageExtensions)),
    sourceExtensions: sortExtensionNames(unique(sourceExtensions)),
  };
}

function getLocalExtensionNames(): Set<string> {
  if (cachedLocalExtensionNames) return cachedLocalExtensionNames;

  const extensionsDir = join(getAgentDir(), "extensions");
  try {
    cachedLocalExtensionNames = new Set(
      readdirSync(extensionsDir, { withFileTypes: true }).flatMap((entry) => {
        if (/\.[cm]?[jt]s$/.test(entry.name))
          return normalizeExtensionName(entry.name);
        if (
          entry.isDirectory() &&
          existsSync(join(extensionsDir, entry.name, "index.ts"))
        ) {
          return entry.name;
        }
        return [];
      }),
    );
  } catch {
    cachedLocalExtensionNames = new Set();
  }
  return cachedLocalExtensionNames;
}

export function parseWelcomeResources(
  text: string,
  localExtensionNames = getLocalExtensionNames(),
  expandedExtensionsText?: string,
): WelcomeResources {
  const bodies = new Map<WelcomeSection, string[]>();
  let currentSection: WelcomeSection | undefined;

  for (const rawLine of text.split("\n")) {
    const line = stripAnsi(rawLine).trim();
    const header = line.match(/^\[([^\]]+)\]$/)?.[1];
    if (header) {
      currentSection = WELCOME_SECTIONS.find((section) => section === header);
      if (currentSection && !bodies.has(currentSection))
        bodies.set(currentSection, []);
      continue;
    }

    if (line && currentSection) bodies.get(currentSection)?.push(line);
  }

  const context = unique(splitList(bodies.get("Context") ?? []));
  const skills = unique(splitList(bodies.get("Skills") ?? []));
  const prompts = unique(splitList(bodies.get("Prompts") ?? []));
  const extensionLabels = unique(splitList(bodies.get("Extensions") ?? []));
  const groups =
    parseExpandedExtensionGroups(expandedExtensionsText, localExtensionNames) ??
    classifyCompactExtensionLabels(extensionLabels, localExtensionNames);
  const extensions = [
    ...groups.localExtensions,
    ...groups.packageExtensions,
    ...groups.sourceExtensions,
  ];

  return {
    context,
    skills,
    prompts,
    extensions,
    packageExtensions: groups.packageExtensions,
    sourceExtensions: groups.sourceExtensions,
  };
}

export function findLoadedResourcesPanel(
  tui: TUI,
): ResourcePanelLocation | undefined {
  const queue: Array<{ container: Component & ChildHost; parent: ChildHost | undefined }> =
    [{ container: tui, parent: undefined }];
  while (queue.length > 0) {
    const { container, parent } = queue.shift()!;
    for (const child of container.children) {
      if (isChildHost(child))
        queue.push({ container: child, parent: container });
    }

    const hasWelcomeSection = container.children.some((child) => {
      const collapsible = child as CollapsedTextComponent;
      if (typeof collapsible.getCollapsedText !== "function") return false;
      const heading = getSectionHeading(collapsible.getCollapsedText());
      return (
        heading !== undefined &&
        (WELCOME_SECTIONS as readonly string[]).includes(heading)
      );
    });
    if (hasWelcomeSection && parent)
      return { panel: container, parent };
  }
  return undefined;
}

function panelHasWelcomeSection(panel: ResourcePanel): boolean {
  return panel.children.some((child) => {
    const collapsible = child as CollapsedTextComponent;
    if (typeof collapsible.getCollapsedText !== "function") return false;
    const heading = getSectionHeading(collapsible.getCollapsedText());
    return (
      heading !== undefined &&
      (WELCOME_SECTIONS as readonly string[]).includes(heading)
    );
  });
}

function detachEmptyResourcesPanel(tui: TUI): ResourceBridge | undefined {
  const candidates: ResourcePanelLocation[] = [];
  const first = tui.children[0];
  if (isChildHost(first) && isChildHost(first.children[1]))
    candidates.push({ panel: first.children[1] as ResourcePanel, parent: first });
  if (isChildHost(tui.children[1]))
    candidates.push({ panel: tui.children[1] as ResourcePanel, parent: tui });

  for (const { panel, parent } of candidates) {
    if (panel.children.length !== 0) continue;
    const originalIndex = parent.children.indexOf(panel);
    if (originalIndex === -1) continue;
    parent.children.splice(originalIndex, 1);
    return { panel, parent, originalIndex };
  }
  return undefined;
}

function takeResourcePanel(location: ResourcePanelLocation): ResourceBridge {
  const { panel, parent } = location;
  const originalIndex = parent.children.indexOf(panel);
  if (originalIndex !== -1) parent.children.splice(originalIndex, 1);
  return {
    panel,
    parent,
    originalIndex: originalIndex === -1 ? parent.children.length : originalIndex,
  };
}

export function restoreResourcePanel(bridge: ResourceBridge | undefined): void {
  if (!bridge) return;
  if (!bridge.parent.children.includes(bridge.panel)) {
    const index = Math.min(bridge.originalIndex, bridge.parent.children.length);
    bridge.parent.children.splice(index, 0, bridge.panel);
  }
}

export function getDetachedBridge(): ResourceBridge | undefined {
  return detachedBridge;
}

export function abandonDetachedPanel(): void {
  if (!detachedBridge) return;
  restoreResourcePanel(detachedBridge);
  detachedBridge = undefined;
  detachedTui = undefined;
}

export function prepareHeaderTui(tui: TUI): void {
  if (detachedTui && detachedTui !== tui) {
    detachedBridge = undefined;
    detachedTui = undefined;
  }
  if (!detachedBridge) {
    detachedBridge = detachEmptyResourcesPanel(tui);
    if (detachedBridge) detachedTui = tui;
  }
}

export function isResourcePanelReady(tui: TUI): boolean {
  return Boolean(
    (detachedBridge && panelHasWelcomeSection(detachedBridge.panel)) ||
      findLoadedResourcesPanel(tui),
  );
}

export const resourceTiming = {
  pollIntervalMs: RESOURCE_POLL_INTERVAL_MS,
  maxRetries: MAX_RESOURCE_RETRIES,
};

export function captureResources(
  tui: TUI,
):
  | { status: "native" }
  | { status: "pending" }
  | { status: "ready"; resources: WelcomeResources; bridge: ResourceBridge } {
  const location: ResourcePanelLocation | undefined = detachedBridge
    ? { panel: detachedBridge.panel, parent: detachedBridge.parent }
    : findLoadedResourcesPanel(tui);

  let snapshot: ResourcePanelSnapshot | undefined;
  try {
    snapshot = location ? inspectResourcePanel(location.panel) : undefined;
  } catch {
    snapshot = undefined;
  }

  if (snapshot?.requiresNativePanel) return { status: "native" };

  const candidateResources =
    snapshot && snapshot.resourceText
      ? parseWelcomeResources(
          snapshot.resourceText,
          getLocalExtensionNames(),
          snapshot.expandedExtensionsText,
        )
      : undefined;

  const complete = Boolean(candidateResources?.extensions.some(isOwnExtension));
  if (complete && location && candidateResources) {
    return {
      status: "ready",
      resources: candidateResources,
      bridge: detachedBridge ?? takeResourcePanel(location),
    };
  }
  return { status: "pending" };
}
