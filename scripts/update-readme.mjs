// Rewrites the marked blocks of README.md from the public GitHub API:
//   TOP-REPOS  the most-starred repositories I own (forks and archived left out)
//   RECENT     the repositories I pushed to most recently
// Only public repositories are read, so nothing private ever reaches the profile.
import { readFile, writeFile } from 'node:fs/promises';

const USER = process.env.GH_USER || 'dikeckaan';
const README = new URL('../README.md', import.meta.url);
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': `${USER}-readme` };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function get(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

const repos = [];
for (let page = 1; ; page++) {
  const batch = await get(`/users/${USER}/repos?type=owner&per_page=100&page=${page}`);
  repos.push(...batch);
  if (batch.length < 100) break;
}
// Repos that are plumbing rather than projects.
const SKIP = new Set([USER, 'mu300-linux-mirror']);
// Stand-ins until these repos get a description on GitHub.
const BLURBS = {
  'MacOS-Workflow-VNC': 'A free macOS desktop over VNC in about five minutes, on GitHub Actions with an ngrok tunnel.',
  'OpenEUICC-5ber': 'OpenEUICC with 5ber eSIM support: a free, open-source Local Profile Assistant for Android.',
};
const own = repos
  .filter((r) => !r.private && !r.fork && !r.archived && !SKIP.has(r.name))
  .map((r) => ({ ...r, description: r.description || BLURBS[r.name] || '' }));

const cell = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const short = (s, n = 110) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

const top = [...own].sort((a, b) => b.stargazers_count - a.stargazers_count || b.forks_count - a.forks_count).slice(0, 10);
const topTable = [
  '| # | Project | Description | ⭐ Stars | 🍴 Forks | Language |',
  '|:-:|---|---|:-:|:-:|---|',
  ...top.map((r, i) =>
    `| ${i + 1} | [**${r.name}**](${r.html_url}) | ${cell(short(r.description || ''))} | ${r.stargazers_count} | ${r.forks_count} | ${r.language || '—'} |`),
].join('\n');

const recent = [...own].sort((a, b) => b.pushed_at.localeCompare(a.pushed_at)).slice(0, 6);
const recentList = recent
  .map((r) => `- [**${r.name}**](${r.html_url}) — ${cell(short(r.description || 'No description', 90))} <sub>· updated ${r.pushed_at.slice(0, 10)}</sub>`)
  .join('\n');

function replaceBlock(text, name, body) {
  const re = new RegExp(`(<!-- ${name}:START -->)[\\s\\S]*?(<!-- ${name}:END -->)`);
  if (!re.test(text)) throw new Error(`marker ${name} missing`);
  return text.replace(re, `$1\n${body}\n$2`);
}

let text = await readFile(README, 'utf8');
text = replaceBlock(text, 'TOP-REPOS', topTable);
text = replaceBlock(text, 'RECENT', recentList);
await writeFile(README, text);
console.log(`top: ${top.map((r) => r.name).join(', ')}`);
