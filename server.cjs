const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');

const root = __dirname;
const port = Number(process.env.PORT || 4280);
const userDownloadsRoot = path.join(process.env.USERPROFILE || root, 'Downloads');
const downloadDir = path.join(userDownloadsRoot, 'TayDown');
const projectDownloadDir = path.join(root, 'Indirilenler');
const tempDir = path.join(downloadDir, '.parts');

fs.mkdirSync(downloadDir, { recursive: true });
fs.mkdirSync(projectDownloadDir, { recursive: true });
fs.mkdirSync(tempDir, { recursive: true });

function mirrorFileEverywhere(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return;
    const base = path.basename(filePath);
    const dstProject = path.join(projectDownloadDir, base);
    const dstMainDownloads = path.join(userDownloadsRoot, base);
    if (path.resolve(filePath) !== path.resolve(dstProject)) {
      fs.copyFileSync(filePath, dstProject);
    }
    if (path.resolve(filePath) !== path.resolve(dstMainDownloads)) {
      fs.copyFileSync(filePath, dstMainDownloads);
    }
  } catch (_) {}
}

// Başlangıçta mevcut dosyaları hem proje içi Indirilenler hem de ana İndirilenler klasörüyle eşitle
try {
  for (const f of fs.readdirSync(downloadDir)) {
    const src = path.join(downloadDir, f);
    if (fs.statSync(src).isFile()) {
      mirrorFileEverywhere(src);
    }
  }
} catch (_) {}

function findYtDlpBinary() {
  const venvBin = path.join(root, '.venv', 'Scripts', 'yt-dlp.exe');
  if (fs.existsSync(venvBin)) return venvBin;
  return 'yt-dlp';
}

function findFfmpegDir() {
  const localAppData = process.env.LOCALAPPDATA || '';
  const wingetBase = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
  if (fs.existsSync(wingetBase)) {
    try {
      const pkgs = fs.readdirSync(wingetBase).filter(d => d.toLowerCase().includes('ffmpeg'));
      for (const pkg of pkgs) {
        const fullPkg = path.join(wingetBase, pkg);
        const stack = [fullPkg];
        while (stack.length) {
          const cur = stack.pop();
          const entries = fs.readdirSync(cur, { withFileTypes: true });
          for (const e of entries) {
            const p = path.join(cur, e.name);
            if (e.isDirectory()) stack.push(p);
            else if (e.name.toLowerCase() === 'ffmpeg.exe') return cur;
          }
        }
      }
    } catch (_) {}
  }
  return null;
}

const FFMPEG_DIR = findFfmpegDir();

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.svg': 'image/svg+xml'
};

const realTasks = new Map();
const activeControllers = new Map();

// Diskte daha önceden indirilmiş dosyalar varsa başlangıçta listeye yükle
try {
  const existingFiles = fs.readdirSync(downloadDir).filter(f => {
    const full = path.join(downloadDir, f);
    return fs.statSync(full).isFile();
  });
  for (const f of existingFiles) {
    const full = path.join(downloadDir, f);
    const st = fs.statSync(full);
    const sizeMB = Math.max(0.01, Number((st.size / (1024 * 1024)).toFixed(2)));
    const isYt = f.toLowerCase().includes('youtube');
    const isX = f.toLowerCase().includes('x_twitter');
    const id = Math.floor(st.mtimeMs);
    realTasks.set(id, {
      id,
      name: f,
      customNamed: true,
      sourceType: isYt ? 'youtube' : isX ? 'x' : 'direct',
      sourceLabel: isYt ? 'YOUTUBE' : isX ? 'X / TWITTER' : 'DOĞRUDAN',
      quality: f.endsWith('.mp3') ? 'MP3' : f.endsWith('.png') ? 'PNG' : '1080P',
      qualityCode: f.endsWith('.mp3') ? 'mp3' : f.endsWith('.png') ? 'image' : '1080p',
      category: f.endsWith('.mp3') ? 'music' : f.endsWith('.png') ? 'docs' : 'video',
      social: isYt || isX,
      icon: f.endsWith('.mp3') ? '🎵' : f.endsWith('.png') ? '🖼️' : '🎬',
      url: full,
      sizeMB,
      downloadedMB: sizeMB,
      status: 'completed',
      speedMBps: 0,
      threads: 16,
      desc: `Tamamlandı ✓ Konum: ${full}`,
      savedPath: full,
      segments: new Array(16).fill(100)
    });
  }
} catch (_) {}

function sanitizeFileName(name) {
  return String(name || 'TayDown_Dosya')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 140);
}

function detectPlatformType(url) {
  const u = String(url || '').toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('x.com/') || u.includes('twitter.com/') || u.includes('pbs.twimg.com') || u.includes('video.twimg.com')) return 'x';
  return 'direct';
}

function openInWindowsExplorer(targetPath) {
  const folderToOpen =
    targetPath && fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()
      ? targetPath
      : downloadDir;
  const escapedFolder = folderToOpen.replace(/'/g, "''");
  // COM Shell.Application doğrudan kullanıcının masaüstü Explorer oturumunda pencere açar
  spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `(New-Object -ComObject Shell.Application).Open('${escapedFolder}')`
    ],
    { detached: true, stdio: 'ignore' }
  ).unref();
}

function listDiskFiles() {
  try {
    return fs.readdirSync(downloadDir)
      .map(name => {
        const full = path.join(downloadDir, name);
        const st = fs.statSync(full);
        if (!st.isFile()) return null;
        return {
          name,
          fullPath: full,
          mainDownloadsPath: path.join(userDownloadsRoot, name),
          projectPath: path.join(projectDownloadDir, name),
          sizeMB: Math.max(0.01, Number((st.size / (1024 * 1024)).toFixed(2))),
          mtime: st.mtime.toLocaleString('tr-TR'),
          downloadUrl: `/api/file-by-name?name=${encodeURIComponent(name)}`,
          streamUrl: `/api/file-by-name?name=${encodeURIComponent(name)}&inline=1`
        };
      })
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

function headOrRangeProbe(targetUrl, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    if (redirectsLeft <= 0) return reject(new Error('Çok fazla yönlendirme'));
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (e) {
      return reject(new Error('Geçersiz URL'));
    }
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request(
      parsed,
      {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TayDown/1.0',
          Range: 'bytes=0-0'
        },
        timeout: 10000
      },
      res => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          const nextUrl = new URL(res.headers.location, targetUrl).toString();
          return resolve(headOrRangeProbe(nextUrl, redirectsLeft - 1));
        }
        let totalBytes = 0;
        const cr = res.headers['content-range'];
        if (cr && /\/(\d+)$/.test(cr)) {
          totalBytes = Number(cr.match(/\/(\d+)$/)[1]);
        } else if (res.headers['content-length']) {
          totalBytes = Number(res.headers['content-length']);
        }
        const supportsRange = res.statusCode === 206 || (res.headers['accept-ranges'] || '').includes('bytes');
        let suggestedName = path.basename(parsed.pathname) || 'indirilen_dosya.bin';
        const cd = res.headers['content-disposition'];
        if (cd && /filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)/i.test(cd)) {
          suggestedName = decodeURIComponent(cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)/i)[1]);
        }
        res.destroy();
        resolve({
          finalUrl: targetUrl,
          totalBytes,
          supportsRange,
          contentType: res.headers['content-type'] || 'application/octet-stream',
          suggestedName: sanitizeFileName(suggestedName)
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Zaman aşımı'));
    });
    req.end();
  });
}

function downloadByteRange(targetUrl, start, end, onChunk, signal, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(new Error('ABORTED'));
    const parsed = new URL(targetUrl);
    const client = parsed.protocol === 'https:' ? https : http;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TayDown/1.0'
    };
    if (typeof start === 'number' && typeof end === 'number' && end >= start) {
      headers.Range = `bytes=${start}-${end}`;
    }

    const req = client.get(parsed, { headers }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
        res.resume();
        const nextUrl = new URL(res.headers.location, targetUrl).toString();
        return resolve(downloadByteRange(nextUrl, start, end, onChunk, signal, redirectsLeft - 1));
      }
      if (res.statusCode >= 400) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', chunk => {
        if (signal && signal.aborted) {
          req.destroy();
          return;
        }
        chunks.push(chunk);
        onChunk(chunk.length);
      });
      res.on('end', () => {
        if (signal && signal.aborted) return reject(new Error('ABORTED'));
        resolve(Buffer.concat(chunks));
      });
      res.on('error', reject);
    });

    if (signal) {
      signal.addEventListener('abort', () => {
        req.destroy();
        reject(new Error('ABORTED'));
      }, { once: true });
    }
    req.on('error', reject);
  });
}

async function startSegmentedHttpDownload(task) {
  const abortController = new AbortController();
  activeControllers.set(task.id, { type: 'http', abort: () => abortController.abort() });

  try {
    const probe = await headOrRangeProbe(task.url);
    if (!task.customNamed && probe.suggestedName && probe.suggestedName !== 'indirilen_dosya.bin') {
      task.name = probe.suggestedName;
    }
    const totalBytes = probe.totalBytes || 0;
    if (totalBytes > 0) {
      task.sizeMB = Number((totalBytes / (1024 * 1024)).toFixed(2));
    }

    const numSegments = probe.supportsRange && totalBytes > 256 * 1024 ? Math.min(16, task.threads || 16) : 1;
    const segDone = new Array(16).fill(0);
    let totalDownloadedBytes = 0;
    let lastTickTime = Date.now();
    let lastTickBytes = 0;

    const speedInterval = setInterval(() => {
      const now = Date.now();
      const dt = Math.max(0.2, (now - lastTickTime) / 1000);
      const dBytes = totalDownloadedBytes - lastTickBytes;
      lastTickTime = now;
      lastTickBytes = totalDownloadedBytes;
      task.speedMBps = Number((dBytes / (1024 * 1024) / dt).toFixed(2));
      task.downloadedMB = Number((totalDownloadedBytes / (1024 * 1024)).toFixed(2));
      if (totalBytes <= 0 && task.downloadedMB > task.sizeMB) {
        task.sizeMB = Number((task.downloadedMB * 1.25).toFixed(2));
      }
    }, 450);

    let finalBuffer;
    if (numSegments > 1) {
      const chunkSize = Math.floor(totalBytes / numSegments);
      const promises = [];
      for (let i = 0; i < numSegments; i++) {
        const start = i * chunkSize;
        const end = i === numSegments - 1 ? totalBytes - 1 : (i + 1) * chunkSize - 1;
        const expectedLen = end - start + 1;

        promises.push(
          downloadByteRange(
            probe.finalUrl,
            start,
            end,
            bytesLen => {
              segDone[i] += bytesLen;
              totalDownloadedBytes += bytesLen;
              const pct = Math.min(100, (segDone[i] / expectedLen) * 100);
              task.segments[i] = Number(pct.toFixed(1));
            },
            abortController.signal
          )
        );
      }
      const buffers = await Promise.all(promises);
      finalBuffer = Buffer.concat(buffers);
    } else {
      finalBuffer = await downloadByteRange(
        probe.finalUrl,
        null,
        null,
        bytesLen => {
          totalDownloadedBytes += bytesLen;
          const pct = totalBytes > 0 ? Math.min(99, (totalDownloadedBytes / totalBytes) * 100) : 55;
          task.segments = task.segments.map(() => Number(pct.toFixed(1)));
        },
        abortController.signal
      );
    }

    clearInterval(speedInterval);
    const outPath = path.join(downloadDir, sanitizeFileName(task.name));
    fs.writeFileSync(outPath, finalBuffer);
    mirrorFileEverywhere(outPath);
    const sha256 = crypto.createHash('sha256').update(finalBuffer).digest('hex');

    task.sizeMB = Math.max(0.01, Number((finalBuffer.length / (1024 * 1024)).toFixed(2)));
    task.downloadedMB = task.sizeMB;
    task.status = 'completed';
    task.speedMBps = 0;
    task.segments = new Array(16).fill(100);
    task.savedPath = outPath;
    task.desc = `Tamamlandı ✓ Konum: ${outPath} (SHA-256: ${sha256.slice(0, 8)}…)`;
  } catch (err) {
    if (String(err.message).includes('ABORTED')) {
      task.status = 'paused';
      task.speedMBps = 0;
      task.desc = 'Kullanıcı tarafından duraklatıldı';
    } else {
      task.status = 'paused';
      task.speedMBps = 0;
      task.desc = `Bağlantı uyarısı: ${err.message}`;
    }
  } finally {
    activeControllers.delete(task.id);
  }
}

function startYtDlpDownload(task) {
  const ytdlp = findYtDlpBinary();
  const baseNoExt = sanitizeFileName(task.name.replace(/\.[a-z0-9]{2,4}$/i, ''));
  const outputTemplate = path.join(downloadDir, `${baseNoExt}.%(ext)s`);

  const args = [
    '--newline',
    '--no-playlist',
    '--concurrent-fragments', String(task.threads || 16),
    '-o', outputTemplate
  ];

  if (FFMPEG_DIR) {
    args.push('--ffmpeg-location', FFMPEG_DIR);
  }

  if (task.qualityCode === 'mp3') {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
  } else if (task.qualityCode === 'image') {
    args.push('--write-thumbnail', '--skip-download', '--convert-thumbnails', 'png');
  } else if (task.qualityCode === '2160p') {
    args.push('-f', 'bestvideo[height<=2160]+bestaudio/best', '--merge-output-format', 'mp4');
  } else if (task.qualityCode === '720p') {
    args.push('-f', 'bestvideo[height<=720]+bestaudio/best', '--merge-output-format', 'mp4');
  } else {
    args.push('-f', 'bestvideo[height<=1080]+bestaudio/best', '--merge-output-format', 'mp4');
  }

  args.push(task.url);

  task.desc = `${task.sourceLabel} 16-Kanal Akış Yakalayıcı Başlatıldı…`;
  const child = spawn(ytdlp, args, { windowsHide: true });
  activeControllers.set(task.id, {
    type: 'ytdlp',
    abort: () => {
      try { child.kill(); } catch (_) {}
    }
  });

  child.stdout.on('data', data => {
    const text = data.toString();
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      const destMatch = line.match(/Destination:\s+(.+)$/) || line.match(/Merging formats into "([^"]+)"/);
      if (destMatch) {
        const p = destMatch[1].trim();
        task.savedPath = p;
        task.name = path.basename(p);
      }
      const progMatch = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%\s+of\s+~?\s*(\d+(?:\.\d+)?)(KiB|MiB|GiB)(?:\s+at\s+(\d+(?:\.\d+)?)(KiB|MiB|GiB)\/s)?/i);
      if (progMatch) {
        const pct = Number(progMatch[1]);
        let sizeVal = Number(progMatch[2]);
        const sizeUnit = progMatch[3].toUpperCase();
        if (sizeUnit === 'GIB') sizeVal *= 1024;
        if (sizeUnit === 'KIB') sizeVal /= 1024;

        let spdVal = progMatch[4] ? Number(progMatch[4]) : 8.5;
        const spdUnit = (progMatch[5] || 'MIB').toUpperCase();
        if (spdUnit === 'GIB') spdVal *= 1024;
        if (spdUnit === 'KIB') spdVal /= 1024;

        task.sizeMB = Math.max(0.1, Number(sizeVal.toFixed(2)));
        task.downloadedMB = Number(((task.sizeMB * pct) / 100).toFixed(2));
        task.speedMBps = Number(spdVal.toFixed(2));
        task.segments = task.segments.map((_, idx) =>
          Math.min(100, Number(Math.max(0, pct + ((idx % 4) - 1.5) * 2.2).toFixed(1)))
        );
      }
    }
  });

  child.stderr.on('data', data => {
    const errLine = data.toString().trim();
    if (errLine && !errLine.toLowerCase().includes('warning')) {
      task.lastWarning = errLine.slice(0, 120);
    }
  });

  child.on('close', code => {
    activeControllers.delete(task.id);
    if (code === 0) {
      try {
        if (task.savedPath && fs.existsSync(task.savedPath)) {
          const st = fs.statSync(task.savedPath);
          task.sizeMB = Math.max(0.01, Number((st.size / (1024 * 1024)).toFixed(2)));
          mirrorFileEverywhere(task.savedPath);
        }
      } catch (_) {}
      task.status = 'completed';
      task.downloadedMB = task.sizeMB;
      task.speedMBps = 0;
      task.segments = new Array(16).fill(100);
      task.desc = `Tamamlandı ✓ Konum: ${task.savedPath}`;
    } else if (task.status !== 'paused') {
      task.status = 'paused';
      task.speedMBps = 0;
      task.desc = task.lastWarning ? `Uyarı: ${task.lastWarning}` : 'Duraklatıldı / Bağlantı kontrolü gerekiyor';
    }
  });
}

function probeMediaMetadata(targetUrl) {
  return new Promise(resolve => {
    const pType = detectPlatformType(targetUrl);
    if (pType === 'direct') {
      headOrRangeProbe(targetUrl)
        .then(info => {
          resolve({
            ok: true,
            platform: 'direct',
            title: info.suggestedName,
            author: new URL(targetUrl).hostname,
            duration: info.supportsRange ? '16-Kanal Range Destekli' : 'Doğrudan Akış',
            sizeMB: info.totalBytes ? Number((info.totalBytes / (1024 * 1024)).toFixed(2)) : 0,
            suggestedName: info.suggestedName
          });
        })
        .catch(err => {
          resolve({
            ok: false,
            platform: 'direct',
            error: err.message
          });
        });
      return;
    }

    const ytdlp = findYtDlpBinary();
    execFile(
      ytdlp,
      ['--dump-single-json', '--no-playlist', '--no-warnings', targetUrl],
      { timeout: 15000, maxBuffer: 10 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        if (err || !stdout) {
          resolve({
            ok: true,
            platform: pType,
            title: pType === 'youtube' ? 'YouTube Video Akışı' : 'X (Twitter) Medya Gönderisi',
            author: pType === 'youtube' ? 'YouTube' : 'X / Twitter',
            duration: 'HD Akış Hazır',
            suggestedName: pType === 'youtube' ? 'YouTube_Video.mp4' : 'X_Twitter_Medya.mp4'
          });
          return;
        }
        try {
          const meta = JSON.parse(stdout);
          const durSec = Number(meta.duration || 0);
          const durStr = durSec > 0
            ? `${String(Math.floor(durSec / 60)).padStart(2, '0')}:${String(Math.floor(durSec % 60)).padStart(2, '0')}`
            : 'Canlı / Görsel';
          const cleanTitle = sanitizeFileName(meta.title || 'Medya');
          resolve({
            ok: true,
            platform: pType,
            title: meta.title || cleanTitle,
            author: meta.uploader || meta.channel || (pType === 'x' ? 'X Kullanıcısı' : 'YouTube Kanalı'),
            duration: durStr,
            thumbnail: meta.thumbnail || null,
            suggestedName: `${cleanTitle}.mp4`
          });
        } catch (_) {
          resolve({
            ok: true,
            platform: pType,
            title: 'Medya Akışı Hazır',
            author: pType.toUpperCase(),
            duration: 'HD',
            suggestedName: 'TayDown_Medya.mp4'
          });
        }
      }
    );
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        reject(e);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const sendJson = (code, obj) => {
    res.writeHead(code, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify(obj));
  };

  if (req.method === 'GET' && req.url === '/api/tasks') {
    return sendJson(200, {
      ok: true,
      downloadDir,
      projectDownloadDir,
      userDownloadsRoot,
      ffmpegReady: Boolean(FFMPEG_DIR),
      ytdlpReady: fs.existsSync(path.join(root, '.venv', 'Scripts', 'yt-dlp.exe')),
      tasks: Array.from(realTasks.values()),
      diskFiles: listDiskFiles()
    });
  }

  if (req.method === 'GET' && req.url.startsWith('/api/file-by-name')) {
    const u = new URL(req.url, `http://127.0.0.1:${port}`);
    const name = path.basename(u.searchParams.get('name') || '');
    const inline = u.searchParams.get('inline') === '1';
    const full = path.join(downloadDir, name);
    if (!name || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
      res.writeHead(404).end('Dosya bulunamadı');
      return;
    }
    const ext = path.extname(full).toLowerCase();
    const headers = {
      'Content-Type': mime[ext] || 'application/octet-stream'
    };
    if (!inline) {
      headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(name)}"`;
    }
    res.writeHead(200, headers);
    fs.createReadStream(full).pipe(res);
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/api/file')) {
    const u = new URL(req.url, `http://127.0.0.1:${port}`);
    const id = Number(u.searchParams.get('id'));
    const t = realTasks.get(id);
    if (!t || !t.savedPath || !fs.existsSync(t.savedPath)) {
      res.writeHead(404).end('Dosya bulunamadı');
      return;
    }
    const ext = path.extname(t.savedPath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': mime[ext] || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(path.basename(t.savedPath))}"`
    });
    fs.createReadStream(t.savedPath).pipe(res);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/probe') {
    try {
      const { url } = await readJsonBody(req);
      const info = await probeMediaMetadata(url);
      return sendJson(200, info);
    } catch (e) {
      return sendJson(400, { ok: false, error: String(e.message || e) });
    }
  }

  if (req.method === 'POST' && req.url === '/api/download') {
    try {
      const payload = await readJsonBody(req);
      const url = String(payload.url || '').trim();
      if (!url) return sendJson(400, { ok: false, error: 'URL gerekli' });

      const pType = detectPlatformType(url);
      const qualityCode = payload.quality || '1080p';
      const id = Number(payload.id) || Date.now();
      const ext = qualityCode === 'mp3' ? 'mp3' : qualityCode === 'image' ? 'png' : 'mp4';
      const rawName = payload.fileName && payload.fileName.trim()
        ? payload.fileName.trim()
        : pType === 'youtube'
        ? `YouTube_${id}_${qualityCode}.${ext}`
        : pType === 'x'
        ? `X_Twitter_${id}_${qualityCode}.${ext}`
        : path.basename(new URL(url).pathname) || `TayDown_${id}.bin`;

      const task = {
        id,
        name: sanitizeFileName(rawName),
        customNamed: Boolean(payload.fileName && payload.fileName.trim()),
        sourceType: pType,
        sourceLabel: pType === 'youtube' ? 'YOUTUBE' : pType === 'x' ? 'X / TWITTER' : 'DOĞRUDAN 16x',
        quality: qualityCode.toUpperCase(),
        qualityCode,
        category: qualityCode === 'mp3' ? 'music' : qualityCode === 'image' ? 'docs' : pType === 'direct' ? 'programs' : 'video',
        social: pType === 'youtube' || pType === 'x',
        icon: qualityCode === 'mp3' ? '🎵' : qualityCode === 'image' ? '🖼️' : pType === 'youtube' ? '🎬' : pType === 'x' ? '𝕏' : '⚡',
        url,
        sizeMB: Number(payload.sizeMB) || 24,
        downloadedMB: 0,
        status: payload.startImmediately === false ? 'paused' : 'downloading',
        speedMBps: 0,
        threads: Number(payload.threads) || 16,
        desc: '16-Kanal indirme motoru hazırlanıyor…',
        savedPath: path.join(downloadDir, sanitizeFileName(rawName)),
        segments: new Array(16).fill(0)
      };

      realTasks.set(id, task);

      if (task.status === 'downloading') {
        const isDirectImage = /\.(png|jpe?g|webp|gif|mp4|zip|iso|exe|pdf|mp3)(\?|$)/i.test(url) && !url.includes('/status/') && !url.includes('watch?v=');
        if (pType === 'direct' || isDirectImage) {
          startSegmentedHttpDownload(task);
        } else {
          startYtDlpDownload(task);
        }
      }

      return sendJson(200, { ok: true, task, targetDir: downloadDir });
    } catch (err) {
      return sendJson(400, { ok: false, error: String(err.message || err) });
    }
  }

  if (req.method === 'POST' && req.url === '/api/task-action') {
    try {
      const { id, action } = await readJsonBody(req);
      if (action === 'open-folder') {
        openInWindowsExplorer(downloadDir);
        return sendJson(200, {
          ok: true,
          opened: downloadDir,
          files: listDiskFiles()
        });
      }

      if (action === 'pause') {
        const ctrl = activeControllers.get(Number(id));
        if (ctrl) ctrl.abort();
        const t = realTasks.get(Number(id));
        if (t) {
          t.status = 'paused';
          t.speedMBps = 0;
        }
        return sendJson(200, { ok: true });
      }

      if (action === 'resume') {
        const t = realTasks.get(Number(id));
        if (t && t.status !== 'completed') {
          t.status = 'downloading';
          if (t.sourceType === 'direct') startSegmentedHttpDownload(t);
          else startYtDlpDownload(t);
        }
        return sendJson(200, { ok: true });
      }

      if (action === 'delete') {
        const ctrl = activeControllers.get(Number(id));
        if (ctrl) ctrl.abort();
        realTasks.delete(Number(id));
        return sendJson(200, { ok: true });
      }

      return sendJson(200, { ok: true });
    } catch (e) {
      return sendJson(400, { ok: false, error: String(e.message || e) });
    }
  }

  const reqPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
  const file = path.resolve(root, rel);

  if (!file.startsWith(root)) {
    res.writeHead(403).end('Yasak');
    return;
  }

  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404).end('Bulunamadı');
      return;
    }
    res.writeHead(200, {
      'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(buf);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`TayDown yerel sunucu ve 16-Kanal indirme motoru hazır: http://127.0.0.1:${port}`);
  console.log(`İndirme klasörü: ${downloadDir}`);
});
