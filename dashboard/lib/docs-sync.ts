import type { DocsIndexItem, DocsIndexState } from "./types";
import { readJsonFile, writeJsonFile } from "./file-store";

const FILE_NAME = "docs-index.json";
const MAX_MARKDOWN_FILES_PER_REPO = Number(process.env.DOCS_MAX_FILES || 120);
const DEFAULT_REPOS = "ocnbtl/projectfremen:main,pngwn-zero/pngwn-web:main,ocnbtl/projectpint:main";

type RepoSpec = {
  owner: string;
  repo: string;
  branch: string;
};

function parseRepoSpecs(value: string | undefined): RepoSpec[] {
  return (value?.trim() || DEFAULT_REPOS)
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const [repoPart, branch = "main"] = segment.split(":");
      const [owner, repo] = repoPart.split("/");
      return { owner, repo, branch };
    })
    .filter((spec) => spec.owner && spec.repo && spec.branch);
}

function parseFrontmatter(markdown: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  if (!markdown.startsWith("---\n")) return result;

  const endIdx = markdown.indexOf("\n---", 4);
  if (endIdx === -1) return result;

  const lines = markdown.slice(4, endIdx).split("\n");
  let currentKey: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    if ((line.startsWith("- ") || line.startsWith("  - ")) && currentKey) {
      const next = line.replace(/^-\s+|^\s+-\s+/, "").trim().replace(/^"|"$/g, "");
      const current = result[currentKey];
      if (Array.isArray(current)) current.push(next);
      else if (typeof current === "string" && current.length > 0) result[currentKey] = [current, next];
      else result[currentKey] = [next];
      continue;
    }

    const splitIdx = line.indexOf(":");
    if (splitIdx === -1) continue;

    const key = line.slice(0, splitIdx).trim();
    const rawValue = line.slice(splitIdx + 1).trim();
    currentKey = key;
    if (!rawValue || rawValue === "[]") {
      result[key] = [];
    } else {
      result[key] = rawValue.replace(/^"|"$/g, "");
    }
  }

  return result;
}

function listValue(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function firstHeading(markdown: string): string {
  const heading = markdown
    .split("\n")
    .find((line) => line.startsWith("# "))
    ?.replace("# ", "")
    .trim();
  return heading || "Untitled";
}

async function fetchJson<T>(url: string, token?: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`GitHub request failed (${response.status}) for ${url}`);
  return (await response.json()) as T;
}

async function fetchText(url: string, token?: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`GitHub raw fetch failed (${response.status}) for ${url}`);
  return response.text();
}

export async function syncDocsIndex(): Promise<DocsIndexState> {
  const token = process.env.GITHUB_TOKEN;
  const repoSpecs = parseRepoSpecs(process.env.DOCS_REPOS);
  const nextItems: DocsIndexItem[] = [];

  for (const spec of repoSpecs) {
    const treeUrl = `https://api.github.com/repos/${spec.owner}/${spec.repo}/git/trees/${spec.branch}?recursive=1`;
    const treePayload = await fetchJson<{ tree: Array<{ path: string; type: string }> }>(treeUrl, token);
    const markdownPaths = treePayload.tree
      .filter((item) => item.type === "blob" && item.path.endsWith(".md"))
      .filter((item) => !item.path.includes("node_modules/") && !item.path.includes(".next/"))
      .slice(0, MAX_MARKDOWN_FILES_PER_REPO);

    for (const item of markdownPaths) {
      const rawUrl = `https://raw.githubusercontent.com/${spec.owner}/${spec.repo}/${spec.branch}/${item.path}`;
      let content = "";
      try {
        content = await fetchText(rawUrl, token);
      } catch {
        continue;
      }

      const fm = parseFrontmatter(content);
      const repoLabel = `${spec.owner}/${spec.repo}`;
      const nameFromFm = typeof fm.name === "string" ? fm.name : "";

      nextItems.push({
        id: `${repoLabel}:${item.path}`,
        repo: repoLabel,
        path: item.path,
        url: `https://github.com/${repoLabel}/blob/${spec.branch}/${item.path}`,
        title: nameFromFm || firstHeading(content),
        class: (typeof fm.class === "string" ? fm.class : listValue(fm.class)[0]) || "",
        status: (typeof fm.status === "string" ? fm.status : listValue(fm.status)[0]) || "",
        projects: listValue(fm.projects),
        subjects: listValue(fm.subjects),
        dueDate: (typeof fm.due_date === "string" ? fm.due_date : "") || "",
        nextReview: (typeof fm.next_review === "string" ? fm.next_review : "") || "",
        updatedAt: (typeof fm.updated_iso === "string" ? fm.updated_iso : "") || ""
      });
    }
  }

  const state: DocsIndexState = {
    lastSynced: new Date().toISOString(),
    items: nextItems
  };
  await writeJsonFile(FILE_NAME, state);
  return state;
}

export async function readDocsIndex(): Promise<DocsIndexState> {
  return readJsonFile<DocsIndexState>(FILE_NAME, {
    lastSynced: null,
    items: []
  });
}
