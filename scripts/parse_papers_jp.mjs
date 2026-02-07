import { readFileSync, writeFileSync } from 'fs';
import { config } from 'dotenv';

// .env ファイルから環境変数を読み込み
config();

const INPUT = process.env.INPUT_FILE;
const OUTPUT = process.env.OUTPUT_FILE;

if (!INPUT || !OUTPUT) {
  console.error('エラー: INPUT_FILE と OUTPUT_FILE を .env ファイルに設定してください。');
  console.error('.env.example を参照してください。');
  process.exit(1);
}

// ── 1. TSV 読み込み・パース ──
const raw = readFileSync(INPUT, 'utf8');
const lines = raw.split('\n').filter(l => l.trim());
const headers = lines[0].replace(/^\uFEFF/, '').split('\t');
const col = {};
headers.forEach((h, i) => { col[h] = i; });

// ── 2. 所属情報から日本所属著者を抽出する関数 ──
function parseC1ForJapaneseAuthors(c1, auList, afToAu) {
  const jpAuthors = new Set();

  // パターン1: 所属情報が空 → 全著者を含める（データセットが日本中心のため）
  if (!c1.trim()) {
    auList.forEach(au => jpAuthors.add(au));
    return jpAuthors;
  }

  // パターン2: 括弧なし（単著）→ アドレスに "Japan" があるか確認
  if (!c1.includes('[')) {
    if (c1.includes('Japan')) {
      auList.forEach(au => jpAuthors.add(au));
    }
    return jpAuthors;
  }

  // パターン3: [著者名] 所属, 国名 の形式を正規表現で解析
  const groupRe = /\[([^\]]+)\]\s*([^[]*?)(?=;\s*\[|$)/g;
  let match;
  while ((match = groupRe.exec(c1)) !== null) {
    const namesStr = match[1];
    const address = match[2];
    if (!address.includes('Japan')) continue;

    const fullNames = namesStr.split(';').map(s => s.trim()).filter(Boolean);
    for (const fn of fullNames) {
      const auName = afToAu.get(fn.toLowerCase());
      if (auName) jpAuthors.add(auName);
    }
  }

  return jpAuthors;
}

// ── 3. 第1パス: 日本所属著者をグローバルに特定 ──
const japaneseAuthors = new Set();
const parsedRecords = [];

for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split('\t');
  const auRaw = cols[col['AU']] || '';
  const afRaw = cols[col['AF']] || '';
  const c1 = cols[col['C1']] || '';
  const title = cols[col['TI']] || '';
  const journal = cols[col['SO']] || '';
  const year = cols[col['PY']] || '';
  const doi = cols[col['DI']] || '';
  const tc = parseInt(cols[col['TC']] || '0', 10);

  const auList = auRaw.split('; ').map(s => s.trim()).filter(Boolean);
  const afList = afRaw.split('; ').map(s => s.trim()).filter(Boolean);

  // フルネーム → 略称の位置ベースマッピング
  const afToAu = new Map();
  for (let j = 0; j < afList.length && j < auList.length; j++) {
    afToAu.set(afList[j].toLowerCase(), auList[j]);
  }

  const recordJp = parseC1ForJapaneseAuthors(c1, auList, afToAu);
  recordJp.forEach(au => japaneseAuthors.add(au));

  parsedRecords.push({ auList, title, journal, year, doi, tc });
}

// ── 4. 第2パス: フィルタ済みノードとリンクを構築 ──
const authorMap = new Map();
const linkMap = new Map();

for (const rec of parsedRecords) {
  const jpAuthors = rec.auList.filter(au => japaneseAuthors.has(au));
  if (jpAuthors.length === 0) continue;

  // 表示用著者文字列（全著者、5名超は省略）
  let authorsStr;
  if (rec.auList.length <= 5) {
    authorsStr = rec.auList.join('; ');
  } else {
    authorsStr = rec.auList.slice(0, 5).join('; ') + ' et al.';
  }

  const paperObj = {
    title: rec.title, journal: rec.journal, year: rec.year,
    doi: rec.doi, tc: rec.tc, authors: authorsStr,
  };

  for (const au of jpAuthors) {
    if (!authorMap.has(au)) {
      authorMap.set(au, { papers: 0, citations: 0, paperList: [] });
    }
    const entry = authorMap.get(au);
    entry.papers++;
    entry.citations += rec.tc;
    entry.paperList.push(paperObj);
  }

  // 日本著者同士のリンクのみ
  for (let a = 0; a < jpAuthors.length; a++) {
    for (let b = a + 1; b < jpAuthors.length; b++) {
      const s = jpAuthors[a] < jpAuthors[b] ? jpAuthors[a] : jpAuthors[b];
      const t = jpAuthors[a] < jpAuthors[b] ? jpAuthors[b] : jpAuthors[a];
      const key = `${s}|||${t}`;
      linkMap.set(key, (linkMap.get(key) || 0) + 1);
    }
  }
}

// リンク配列
const links = [];
for (const [key, weight] of linkMap) {
  const [source, target] = key.split('|||');
  links.push({ source, target, weight });
}

// degree, weightedDegree 計算
const degreeMap = new Map();
const wDegreeMap = new Map();
for (const { source, target, weight } of links) {
  degreeMap.set(source, (degreeMap.get(source) || 0) + 1);
  degreeMap.set(target, (degreeMap.get(target) || 0) + 1);
  wDegreeMap.set(source, (wDegreeMap.get(source) || 0) + weight);
  wDegreeMap.set(target, (wDegreeMap.get(target) || 0) + weight);
}

// ノード配列
const nodes = [];
for (const [id, data] of authorMap) {
  nodes.push({
    id, papers: data.papers, citations: data.citations,
    degree: degreeMap.get(id) || 0,
    weightedDegree: wDegreeMap.get(id) || 0,
    paperList: data.paperList,
  });
}
nodes.sort((a, b) => b.papers - a.papers || a.id.localeCompare(b.id));

// ── 5. 出力 ──
const output = `const RAW = ${JSON.stringify({ nodes, links })};\n\nexport default RAW;\n`;
writeFileSync(OUTPUT, output, 'utf8');

console.log(`Generated papers.js (Japan-affiliated only):`);
console.log(`  Nodes: ${nodes.length}`);
console.log(`  Links: ${links.length}`);
console.log(`  Records: ${parsedRecords.length}`);
