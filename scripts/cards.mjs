// Draws the profile's SVG cards into profile/ from the GitHub API, so the README
// doesn't depend on third-party card services:
//   stats.svg     stars, forks, repos, followers and last year's contributions
//   langs.svg     languages across my own repositories, by bytes
//   activity.svg  daily contributions over the last 60 days
//   pin-<repo>.svg  one card per repository in PINS
// Only public repositories and public contribution counts are used.
import { mkdir, writeFile } from 'node:fs/promises';

const USER = process.env.GH_USER || 'dikeckaan';
const OUT = new URL('../profile/', import.meta.url);
const PINS = ['mu300-linux', 'zte-f50-toolkit', 'easy-vphone', 'mu300-linux-vpn', 'internetmerge', 'forza-horizon-6-telemetry-dashboard', 'macjaro'];
const BLURBS = {
  'MacOS-Workflow-VNC': 'A free macOS desktop over VNC in about five minutes, on GitHub Actions with an ngrok tunnel.',
  'OpenEUICC-5ber': 'OpenEUICC with 5ber eSIM support: a free, open-source Local Profile Assistant for Android.',
};
const COLORS = {
  Shell: '#89e051', Python: '#3572A5', C: '#555555', 'C++': '#f34b7d', 'C#': '#178600', HTML: '#e34c26', CSS: '#563d7c',
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Kotlin: '#A97BFF', Java: '#b07219', Swift: '#F05138', Go: '#00ADD8',
  Dart: '#00B4AB', PHP: '#4F5D95', Ruby: '#701516', Vue: '#41b883', PowerShell: '#012456', Batchfile: '#C1F12E',
  Makefile: '#427819', 'Objective-C': '#438eff', Dockerfile: '#384d54', Rust: '#dea584', Lua: '#000080', SCSS: '#c6538c',
};

// Colors chosen to read on both GitHub's light and dark backgrounds.
const T = { title: '#7c8cff', text: '#8b949e', strong: '#a5b0ff', accent: '#38d9c4', star: '#e3b341', border: '#30363d' };

const headers = { Accept: 'application/vnd.github+json', 'User-Agent': `${USER}-cards` };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function get(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function graphql(query, variables) {
  const res = await fetch('https://api.github.com/graphql', { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
  const body = await res.json();
  if (!res.ok || body.errors) throw new Error(`graphql: ${res.status} ${JSON.stringify(body.errors || body)}`);
  return body.data;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const nf = new Intl.NumberFormat('en');
const kfmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

function wrap(text, width, lines) {
  const out = [];
  let cur = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if ((cur + ' ' + w).trim().length > width) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
    if (out.length === lines) break;
  }
  if (out.length < lines && cur) out.push(cur);
  if (out.length === lines && out.join(' ').length < text.trim().length) out[lines - 1] = out[lines - 1].replace(/\s*\S*$/, '') + '…';
  return out;
}

function frame(w, h, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">
<style>
  .t { font: 600 18px 'Segoe UI', Ubuntu, -apple-system, Helvetica, Arial, sans-serif; fill: ${T.title}; }
  .l { font: 400 14px 'Segoe UI', Ubuntu, -apple-system, Helvetica, Arial, sans-serif; fill: ${T.text}; }
  .v { font: 700 14px 'Segoe UI', Ubuntu, -apple-system, Helvetica, Arial, sans-serif; fill: ${T.strong}; }
  .s { font: 400 12px 'Segoe UI', Ubuntu, -apple-system, Helvetica, Arial, sans-serif; fill: ${T.text}; }
  .fade { animation: fade .6s ease-in-out forwards; opacity: 0; }
  @keyframes fade { to { opacity: 1; } }
</style>
<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="10" fill="none" stroke="${T.border}"/>
${body}
</svg>
`;
}

const ICONS = {
  star: 'M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z',
  fork: 'M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z',
  repo: 'M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z',
  people: 'M2 5.5a3.5 3.5 0 1 1 5.898 2.549 5.508 5.508 0 0 1 3.034 4.084.75.75 0 1 1-1.482.235 4 4 0 0 0-7.9 0 .75.75 0 0 1-1.482-.236A5.507 5.507 0 0 1 3.102 8.05 3.493 3.493 0 0 1 2 5.5ZM11 4a3.001 3.001 0 0 1 2.22 5.018 5.01 5.01 0 0 1 2.56 3.012.749.749 0 0 1-.885.954.752.752 0 0 1-.549-.514 3.507 3.507 0 0 0-2.522-2.372.75.75 0 0 1-.574-.73v-.352a.75.75 0 0 1 .416-.672A1.5 1.5 0 0 0 11 5.5.75.75 0 0 1 11 4Zm-5.5-.5a2 2 0 1 0-.001 3.999A2 2 0 0 0 5.5 3.5Z',
  commit: 'M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z',
  pr: 'M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z',
  issue: 'M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z',
};
const icon = (name, x, y, color = T.accent, size = 16) =>
  `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 16 16"><path fill="${color}" d="${ICONS[name]}"/></svg>`;

// ---------- data ----------

const user = await get(`/users/${USER}`);
const repos = [];
for (let page = 1; ; page++) {
  const batch = await get(`/users/${USER}/repos?type=owner&per_page=100&page=${page}`);
  repos.push(...batch);
  if (batch.length < 100) break;
}
const pub = repos.filter((r) => !r.private);
const own = pub.filter((r) => !r.fork);

const { user: gq } = await graphql(`query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      totalCommitContributions totalPullRequestContributions totalIssueContributions totalPullRequestReviewContributions
      contributionCalendar { weeks { contributionDays { date contributionCount } } }
    }
  }
}`, { login: USER });
const cc = gq.contributionsCollection;
const days = cc.contributionCalendar.weeks.flatMap((w) => w.contributionDays);

const langBytes = new Map();
for (const r of own) {
  if (r.size === 0) continue;
  // A repo GitHub has blocked (or that just vanished) answers 403/404; leave it out.
  const langs = await get(`/repos/${USER}/${r.name}/languages`).catch((e) => (console.warn(e.message.split('\n')[0]), {}));
  for (const [l, b] of Object.entries(langs)) langBytes.set(l, (langBytes.get(l) || 0) + b);
}

// ---------- cards ----------

function statsCard() {
  const rows = [
    ['star', 'Stars earned', own.reduce((a, r) => a + r.stargazers_count, 0)],
    ['fork', 'Forks of my repos', own.reduce((a, r) => a + r.forks_count, 0)],
    ['repo', 'Public repositories', pub.length],
    ['people', 'Followers', user.followers],
    ['commit', 'Commits (last year)', cc.totalCommitContributions],
    ['pr', 'Pull requests (last year)', cc.totalPullRequestContributions],
    ['issue', 'Issues (last year)', cc.totalIssueContributions],
  ];
  const body = rows.map(([ic, label, v], i) => {
    const y = 58 + i * 26;
    return `<g class="fade" style="animation-delay:${150 + i * 90}ms">${icon(ic, 25, y - 13, ic === 'star' ? T.star : T.accent)}<text x="50" y="${y}" class="l">${label}</text><text x="${445 - 25}" y="${y}" class="v" text-anchor="end">${nf.format(v)}</text></g>`;
  }).join('\n');
  return frame(445, 58 + rows.length * 26 + 6, `${USER}'s GitHub stats`, `<text x="25" y="32" class="t">GitHub stats</text>\n${body}`);
}

function langsCard() {
  const total = [...langBytes.values()].reduce((a, b) => a + b, 0) || 1;
  const top = [...langBytes].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const w = 445, barW = w - 50;
  let x = 25;
  const bar = top.map(([l, b]) => {
    const seg = Math.max(2, (b / total) * barW);
    const r = `<rect x="${x.toFixed(1)}" y="48" width="${seg.toFixed(1)}" height="10" fill="${COLORS[l] || T.text}"/>`;
    x += seg;
    return r;
  }).join('');
  const items = top.map(([l, b], i) => {
    const cx = 25 + (i % 2) * 200, cy = 86 + Math.floor(i / 2) * 24;
    return `<g class="fade" style="animation-delay:${150 + i * 60}ms"><circle cx="${cx + 5}" cy="${cy - 4}" r="5" fill="${COLORS[l] || T.text}"/><text x="${cx + 16}" y="${cy}" class="l">${esc(l)} <tspan class="s">${((b / total) * 100).toFixed(1)}%</tspan></text></g>`;
  }).join('\n');
  // Same height as the stats card, which sits next to it in the README.
  const h = Math.max(86 + Math.ceil(top.length / 2) * 24 - 4, 246);
  return frame(w, h, 'Most used languages', `<text x="25" y="32" class="t">Most used languages</text>
<clipPath id="c"><rect x="25" y="48" width="${barW}" height="10" rx="5"/></clipPath><g clip-path="url(#c)">${bar}</g>
${items}`);
}

function activityCard() {
  const recent = days.slice(-60);
  const w = 900, h = 260, l = 50, r = 20, t = 56, b = 44;
  const max = Math.max(4, ...recent.map((d) => d.contributionCount));
  const step = Math.ceil(max / 4);
  const top = step * 4;
  const px = (i) => l + (i * (w - l - r)) / (recent.length - 1);
  const py = (v) => t + (1 - v / top) * (h - t - b);
  const pts = recent.map((d, i) => [px(i), py(d.contributionCount)]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const area = `${line}L${px(recent.length - 1).toFixed(1)},${py(0)}L${l},${py(0)}Z`;
  const grid = [0, 1, 2, 3, 4].map((k) => {
    const v = step * k, y = py(v).toFixed(1);
    return `<line x1="${l}" x2="${w - r}" y1="${y}" y2="${y}" stroke="${T.border}" stroke-dasharray="${k ? '3 4' : ''}"/><text x="${l - 10}" y="${+y + 4}" class="s" text-anchor="end">${v}</text>`;
  }).join('');
  const labels = recent.map((d, i) => (i % 7 === 0 || (i === recent.length - 1 && i % 7 > 3))
    ? `<text x="${px(i).toFixed(1)}" y="${h - b + 20}" class="s" text-anchor="middle">${d.date.slice(5).replace('-', '/')}</text>` : '').join('');
  const dots = pts.map(([x, y], i) => recent[i].contributionCount ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="${T.accent}"/>` : '').join('');
  const sum = recent.reduce((a, d) => a + d.contributionCount, 0);
  return frame(w, h, 'Contributions in the last 60 days', `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T.title}" stop-opacity=".35"/><stop offset="1" stop-color="${T.title}" stop-opacity="0"/></linearGradient></defs>
<text x="25" y="32" class="t">Contributions · last 60 days</text><text x="${w - 25}" y="32" class="l" text-anchor="end">${nf.format(sum)} total</text>
${grid}<path d="${area}" fill="url(#g)"/><path d="${line}" fill="none" stroke="${T.title}" stroke-width="2.5" stroke-linejoin="round"/>${dots}${labels}`);
}

function pinCard(r) {
  const w = 445, h = 140;
  const desc = wrap(r.description || BLURBS[r.name] || 'No description', 58, 2);
  const lang = r.language ? `<circle cx="30" cy="${h - 26}" r="6" fill="${COLORS[r.language] || T.text}"/><text x="42" y="${h - 21}" class="l">${esc(r.language)}</text>` : '';
  const sx = r.language ? 42 + r.language.length * 8 + 22 : 25;
  return frame(w, h, r.name, `${icon('repo', 25, 19, T.text)}<text x="48" y="32" class="t">${esc(r.name.length > 36 ? r.name.slice(0, 35) + '…' : r.name)}</text>
${desc.map((line, i) => `<text x="25" y="${62 + i * 20}" class="l">${esc(line)}</text>`).join('')}
${lang}${icon('star', sx, h - 34, T.star)}<text x="${sx + 22}" y="${h - 21}" class="l">${kfmt(r.stargazers_count)}</text>
${icon('fork', sx + 72, h - 34, T.text)}<text x="${sx + 94}" y="${h - 21}" class="l">${kfmt(r.forks_count)}</text>`);
}

await mkdir(OUT, { recursive: true });
const files = { 'stats.svg': statsCard(), 'langs.svg': langsCard(), 'activity.svg': activityCard() };
for (const name of PINS) {
  const r = own.find((x) => x.name === name);
  if (r) files[`pin-${name}.svg`] = pinCard(r);
}
for (const [f, svg] of Object.entries(files)) await writeFile(new URL(f, OUT), svg);
console.log(`wrote ${Object.keys(files).join(', ')}`);
