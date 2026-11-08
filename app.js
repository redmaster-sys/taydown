(function () {
  'use strict';

  // Uygulama başlangıçta tamamen boş ve temiz başlar; yalnızca kullanıcının eklediği gerçek indirmeler listelenir.
  const API_BASE = window.location.protocol === 'http:' ? '' : 'http://127.0.0.1:4280';
  let tasks = [];
  let diskFiles = [];
  let selectedTaskId = null;
  let activeCategory = 'all';
  let activeStatus = 'all';
  let searchQuery = '';
  let turboEnabled = true;
  let speedLimitMBps = 0;
  let peakSpeed = 0.0;
  const speedHistory = new Array(15).fill(0);

  const tableBody = document.getElementById('DownloadTableBody');
  const globalSpeedText = document.getElementById('GlobalSpeedText');
  const activeThreadsText = document.getElementById('ActiveThreadsText');
  const turboModeBtn = document.getElementById('TurboModeBtn');
  const turboModeLabel = document.getElementById('TurboModeLabel');
  const engineStatusBadge = document.getElementById('engineStatusBadge');
  const quickUrlInput = document.getElementById('QuickUrlInput');
  const quickQualitySelect = document.getElementById('QuickQualitySelect');
  const detectedPlatformBadge = document.getElementById('DetectedPlatformBadge');
  const inspectorSourceBadge = document.getElementById('InspectorSourceBadge');
  const inspectorFileName = document.getElementById('InspectorFileName');
  const inspectorUrl = document.getElementById('InspectorUrl');
  const inspectorProgressText = document.getElementById('InspectorProgressText');
  const segmentGrid = document.getElementById('SegmentGrid');
  const connectionChannelsList = document.getElementById('ConnectionChannelsList');
  const selectionSummary = document.getElementById('SelectionSummary');
  const mediaModal = document.getElementById('MediaModal');
  const schedulerModal = document.getElementById('SchedulerModal');
  const folderModal = document.getElementById('FolderModal');
  const folderFilesList = document.getElementById('FolderFilesList');
  const modalUrlInput = document.getElementById('ModalUrlInput');
  const modalFileNameInput = document.getElementById('ModalFileNameInput');
  const modalThreadsSelect = document.getElementById('ModalThreadsSelect');
  const previewPlatformTag = document.getElementById('PreviewPlatformTag');
  const previewTitle = document.getElementById('PreviewTitle');
  const previewAuthor = document.getElementById('PreviewAuthor');
  const previewDuration = document.getElementById('PreviewDuration');
  const toastContainer = document.getElementById('ToastContainer');
  const speedCanvas = document.getElementById('SpeedChartCanvas');

  function showToast(message, accentColor) {
    const el = document.createElement('div');
    el.className = 'toast';
    if (accentColor) el.style.borderLeftColor = accentColor;
    el.textContent = message;
    toastContainer.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.25s ease';
      setTimeout(() => el.remove(), 260);
    }, 3200);
  }

  function detectPlatform(url) {
    const clean = (url || '').trim().toLowerCase();
    if (clean.includes('youtube.com') || clean.includes('youtu.be')) {
      return {
        type: 'youtube',
        badge: 'YOUTUBE ALGILANDI',
        cls: 'badge-yt',
        sourceLabel: 'YOUTUBE',
        icon: '🎬',
        defaultCategory: 'video',
        social: true
      };
    }
    if (clean.includes('x.com/') || clean.includes('twitter.com/') || clean.includes('pbs.twimg.com')) {
      return {
        type: 'x',
        badge: 'X (TWITTER) ALGILANDI',
        cls: 'badge-x',
        sourceLabel: 'X / TWITTER',
        icon: '𝕏',
        defaultCategory: clean.includes('/photo') || clean.endsWith('.png') || clean.endsWith('.jpg') ? 'docs' : 'video',
        social: true
      };
    }
    return {
      type: 'direct',
      badge: clean.startsWith('http') ? 'DOĞRUDAN DOSYA' : 'AKILLI ALGILAYICI',
      cls: '',
      sourceLabel: 'DOĞRUDAN 16x',
      icon: '⚡',
      defaultCategory: 'programs',
      social: false
    };
  }

  function formatSize(mb) {
    if (mb >= 1024) {
      return (mb / 1024).toFixed(2) + ' GB';
    }
    return mb.toFixed(1) + ' MB';
  }

  function formatEta(task) {
    if (task.status === 'completed') return 'Bitti ✓';
    if (task.status === 'paused' || task.speedMBps <= 0.05) return 'Beklemede';
    const remMB = Math.max(0, task.sizeMB - task.downloadedMB);
    const sec = Math.ceil(remMB / task.speedMBps);
    if (sec < 60) return `${sec} sn`;
    const min = Math.floor(sec / 60);
    const remSec = sec % 60;
    return `${min} dk ${remSec} sn`;
  }

  function updateCategoryCounts() {
    const counts = {
      all: tasks.length,
      social: tasks.filter(t => t.social).length,
      video: tasks.filter(t => t.category === 'video').length,
      music: tasks.filter(t => t.category === 'music').length,
      archive: tasks.filter(t => t.category === 'archive').length,
      programs: tasks.filter(t => t.category === 'programs').length,
      docs: tasks.filter(t => t.category === 'docs').length
    };
    Object.keys(counts).forEach(key => {
      const badge = document.getElementById(`Count-${key}`);
      if (badge) badge.textContent = counts[key];
    });
  }

  function getFilteredTasks() {
    return tasks.filter(t => {
      if (activeCategory === 'social' && !t.social) return false;
      if (activeCategory !== 'all' && activeCategory !== 'social' && t.category !== activeCategory) return false;
      if (activeStatus !== 'all' && t.status !== activeStatus) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const hay = `${t.name} ${t.sourceLabel} ${t.desc} ${t.url}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderTable() {
    updateCategoryCounts();
    const list = getFilteredTasks();
    if (!list.some(t => t.id === selectedTaskId)) {
      selectedTaskId = list.length > 0 ? list[0].id : null;
    }

    if (list.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 48px 20px; color: #94a3b8;">
            <div style="font-size: 1.05rem; font-weight: 700; color: #e2e8f0; margin-bottom: 6px;">
              Henüz aktif veya bekleyen bir indirme yok
            </div>
            <div style="font-size: 0.82rem;">
              Üstteki çubuğa bir <strong>YouTube</strong>, <strong>X (Twitter)</strong> veya <strong>doğrudan dosya bağlantısı</strong> yapıştırıp <strong>Hemen İndir</strong> butonuna basın.
            </div>
          </td>
        </tr>
      `;
      renderInspector();
      return;
    }

    tableBody.innerHTML = list.map(t => {
      const pct = Math.min(100, (t.downloadedMB / Math.max(0.01, t.sizeMB)) * 100);
      const isSelected = t.id === selectedTaskId;
      const statusLabel =
        t.status === 'downloading'
          ? 'İndiriliyor'
          : t.status === 'paused'
          ? 'Duraklatıldı'
          : 'Tamamlandı';
      const sourceClass =
        t.sourceType === 'youtube'
          ? 'source-yt'
          : t.sourceType === 'x'
          ? 'source-x'
          : 'source-direct';

      return `
        <tr class="${isSelected ? 'selected' : ''}" data-id="${t.id}">
          <td>
            <div class="file-cell">
              <div class="file-type-icon">${t.icon}</div>
              <div>
                <span class="file-title">${t.name}</span>
                <span class="file-desc">${t.desc}</span>
              </div>
            </div>
          </td>
          <td>
            <span class="source-pill ${sourceClass}">${t.sourceLabel} • ${t.quality}</span>
          </td>
          <td>
            <div class="progress-cell">
              <div class="progress-top">
                <span class="status-${t.status}">${statusLabel}</span>
                <span>%${pct.toFixed(1)}</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill fill-${t.status}" style="width: ${pct.toFixed(1)}%"></div>
              </div>
            </div>
          </td>
          <td><strong>${formatSize(t.sizeMB)}</strong></td>
          <td>${formatEta(t)}</td>
          <td class="speed-cell">${t.status === 'downloading' ? t.speedMBps.toFixed(1) + ' MB/sn' : '—'}</td>
        </tr>
      `;
    }).join('');

    tableBody.querySelectorAll('tr').forEach(row => {
      row.addEventListener('click', () => {
        selectedTaskId = Number(row.getAttribute('data-id'));
        renderTable();
        renderInspector();
      });
    });

    renderInspector();
  }

  function renderInspector() {
    const task = tasks.find(t => t.id === selectedTaskId);
    if (!task) {
      selectionSummary.textContent = 'Henüz görev seçilmedi';
      inspectorSourceBadge.textContent = 'HAZIR';
      inspectorFileName.textContent = 'İndirme başlatmak için yukarıya bir bağlantı yapıştırın';
      inspectorUrl.textContent = 'Kayıt Klasörü: C:\\Users\\<kullanıcı>\\Downloads\\TayDown';
      inspectorProgressText.textContent = 'Beklemede (%0.0)';
      segmentGrid.innerHTML = new Array(16).fill(0).map((_, idx) => `
        <div class="segment-slot" title="Parça #${idx + 1}: Hazır">
          <div class="segment-slot-fill" style="width: 0%"></div>
          <span class="segment-slot-label">P${idx + 1}</span>
        </div>
      `).join('');
      connectionChannelsList.innerHTML = [1, 2, 3, 4].map(ch => `
        <div class="channel-chip">
          <span>Kanal Kümesi #${ch} (P${(ch - 1) * 4 + 1}–P${ch * 4})</span>
          <strong>Hazır</strong>
        </div>
      `).join('');
      return;
    }

    selectionSummary.textContent = `Seçili Görev: ${task.name} (${task.threads} Kanal)`;
    inspectorSourceBadge.textContent = `${task.sourceLabel} • ${task.quality}`;
    inspectorFileName.textContent = task.name;
    inspectorUrl.textContent = task.url;

    const pct = Math.min(100, (task.downloadedMB / Math.max(0.01, task.sizeMB)) * 100);
    inspectorProgressText.textContent = `%${pct.toFixed(1)} Tamamlandı (${formatSize(task.downloadedMB)} / ${formatSize(task.sizeMB)})`;

    segmentGrid.innerHTML = (task.segments || new Array(16).fill(0)).map((segPct, idx) => `
      <div class="segment-slot" title="Parça #${idx + 1}: %${Math.round(segPct)}">
        <div class="segment-slot-fill" style="width: ${Math.min(100, segPct)}%"></div>
        <span class="segment-slot-label">P${idx + 1}</span>
      </div>
    `).join('');

    const perChannelSpeed = task.status === 'downloading' ? (task.speedMBps / 4).toFixed(2) : '0.00';
    connectionChannelsList.innerHTML = [1, 2, 3, 4].map(ch => {
      const segStart = (ch - 1) * 4 + 1;
      const segEnd = ch * 4;
      const stateText =
        task.status === 'downloading'
          ? `${perChannelSpeed} MB/sn • Aktif`
          : task.status === 'completed'
          ? 'Birleştirildi ✓'
          : 'Beklemede';
      return `
        <div class="channel-chip">
          <span>Kanal Kümesi #${ch} (P${segStart}–P${segEnd})</span>
          <strong>${stateText}</strong>
        </div>
      `;
    }).join('');
  }

  function drawSpeedChart() {
    if (!speedCanvas) return;
    const ctx = speedCanvas.getContext('2d');
    const w = speedCanvas.width;
    const h = speedCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const maxVal = Math.max(10, ...speedHistory);
    const stepX = w / (speedHistory.length - 1);

    ctx.beginPath();
    speedHistory.forEach((val, idx) => {
      const x = idx * stepX;
      const y = h - (val / maxVal) * (h - 12) - 4;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(34, 211, 238, 0.36)');
    grad.addColorStop(1, 'rgba(16, 185, 129, 0.02)');
    ctx.fillStyle = grad;
    ctx.fill();
  }

  async function syncRealBackendTasks() {
    try {
      const res = await fetch(`${API_BASE}/api/tasks`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.ok || !Array.isArray(data.tasks)) return;

      if (Array.isArray(data.diskFiles)) {
        diskFiles = data.diskFiles;
      }

      data.tasks.forEach(rt => {
        const existing = tasks.find(t => t.id === rt.id);
        if (existing) {
          const prevStatus = existing.status;
          Object.assign(existing, rt, { isReal: true });
          if (prevStatus !== 'completed' && rt.status === 'completed') {
            showToast(`✓ İndirme Tamamlandı: ${rt.name}`, '#10b981');
          }
        } else {
          tasks.unshift({ ...rt, isReal: true });
          if (!selectedTaskId) selectedTaskId = rt.id;
        }
      });
    } catch (_) {}
  }

  function renderFolderModal() {
    if (!folderFilesList) return;
    if (!diskFiles || diskFiles.length === 0) {
      folderFilesList.innerHTML = `
        <div style="text-align: center; padding: 28px; color: #94a3b8; font-size: 13px;">
          Klasörde henüz indirilmiş bir dosya bulunmuyor.
        </div>
      `;
      return;
    }

    folderFilesList.innerHTML = diskFiles.map(f => {
      const displayPath = f.fullPath || f.path || `C:\\Users\\<kullanıcı>\\Downloads\\TayDown\\${f.name}`;
      return `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(56, 189, 248, 0.22); border-radius: 10px; padding: 10px 14px;">
        <div style="min-width: 0; flex: 1;">
          <div style="font-weight: 700; font-size: 13px; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">🎬 ${f.name}</div>
          <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">Boyut: <strong style="color: #22d3ee;">${f.sizeMB} MB</strong> • <code>${displayPath}</code></div>
        </div>
        <div style="display: flex; gap: 6px; flex-shrink: 0;">
          <a class="mini-action-btn" href="${API_BASE}/api/file-by-name?name=${encodeURIComponent(f.name)}&inline=1" target="_blank" style="text-decoration: none; background: rgba(16, 185, 129, 0.18); border-color: rgba(16, 185, 129, 0.45); color: #34d399;">▶️ Oynat / Aç</a>
          <a class="mini-action-btn" href="${API_BASE}/api/file-by-name?name=${encodeURIComponent(f.name)}" download="${f.name}" style="text-decoration: none; background: rgba(34, 211, 238, 0.16); border-color: rgba(34, 211, 238, 0.4); color: #22d3ee;">💾 Farklı Kaydet</a>
        </div>
      </div>
    `;
    }).join('');
  }

  function tickTelemetry() {
    syncRealBackendTasks();

    let totalSpeed = 0;
    let activeThreads = 0;

    tasks.forEach(task => {
      if (task.status === 'downloading') {
        totalSpeed += Number(task.speedMBps) || 0;
        activeThreads += task.threads || 16;
      }
    });

    if (totalSpeed > peakSpeed) {
      peakSpeed = totalSpeed;
      const peakEl = document.getElementById('PeakSpeedLabel');
      if (peakEl) peakEl.textContent = `Tepe: ${peakSpeed.toFixed(1)} MB/sn`;
    }

    speedHistory.push(Number(totalSpeed.toFixed(1)));
    if (speedHistory.length > 20) speedHistory.shift();

    globalSpeedText.textContent = `${totalSpeed.toFixed(1)} MB/sn`;
    activeThreadsText.textContent = `${Math.min(16, activeThreads)} / 16 Parça`;

    renderTable();
    drawSpeedChart();
  }

  async function createTaskFromInput(rawUrl, qualityCode, customFileName, threadsCount, startImmediately) {
    const url = (rawUrl || '').trim();
    if (!url) {
      showToast('Lütfen indirmek istediğiniz YouTube, X (Twitter) veya dosya bağlantısını yapıştırın.', '#f59e0b');
      return;
    }

    const info = detectPlatform(url);
    const id = Date.now();

    let ext = 'mp4';
    let category = info.defaultCategory;
    let sizeMB = 24;
    let qualityLabel = '1080p HD';

    if (qualityCode === '2160p') {
      ext = 'mp4';
      sizeMB = 120;
      qualityLabel = '4K 2160p';
    } else if (qualityCode === '720p') {
      ext = 'mp4';
      sizeMB = 20;
      qualityLabel = '720p HD';
    } else if (qualityCode === 'mp3') {
      ext = 'mp3';
      category = 'music';
      sizeMB = 8.5;
      qualityLabel = 'MP3 320kbps';
    } else if (qualityCode === 'image') {
      ext = 'png';
      category = 'docs';
      sizeMB = 3.2;
      qualityLabel = 'Orijinal Görsel';
    } else if (qualityCode === 'direct') {
      const urlParts = url.split('/').pop().split('?')[0];
      ext = urlParts.includes('.') ? urlParts.split('.').pop() : 'bin';
      sizeMB = 50;
      qualityLabel = 'Doğrudan';
    }

    const baseName = customFileName && customFileName.trim()
      ? customFileName.trim()
      : info.type === 'youtube'
      ? `YouTube_Video_${id}_${qualityCode}.${ext}`
      : info.type === 'x'
      ? `X_Twitter_Medya_${id}_${qualityCode}.${ext}`
      : (url.split('/').pop().split('?')[0] || `TayDown_Dosya_${id}.${ext}`);

    const newTask = {
      id,
      name: baseName,
      sourceType: info.type,
      sourceLabel: info.sourceLabel,
      quality: qualityLabel,
      category,
      social: info.social,
      icon: qualityCode === 'mp3' ? '🎵' : qualityCode === 'image' ? '🖼️' : info.icon,
      url,
      sizeMB,
      downloadedMB: 0,
      status: startImmediately ? 'downloading' : 'paused',
      speedMBps: 0,
      threads: Number(threadsCount) || 16,
      isReal: true,
      desc: 'Yerel 16-Kanal indirme motoruna bağlanıyor…',
      segments: Array(16).fill(0)
    };

    tasks.unshift(newTask);
    selectedTaskId = newTask.id;
    renderTable();

    try {
      const res = await fetch(`${API_BASE}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          url,
          quality: qualityCode,
          fileName: customFileName || '',
          threads: Number(threadsCount) || 16,
          startImmediately
        })
      });
      if (!res.ok) throw new Error('Sunucu yanıt vermedi');
    } catch (err) {
      newTask.status = 'paused';
      newTask.desc = 'Sunucu bağlantısı bekleniyor (TayDown-Baslat.bat ile çalıştırın)';
    }

    showToast(
      startImmediately
        ? `⚡ İndirme Başlatıldı (${newTask.sourceLabel}): ${newTask.name}`
        : `🕒 Kuyruğa Eklendi: ${newTask.name}`,
      info.type === 'youtube' ? '#f43f5e' : info.type === 'x' ? '#8b5cf6' : '#22d3ee'
    );
  }

  // Olay Dinleyicileri
  quickUrlInput.addEventListener('input', () => {
    const info = detectPlatform(quickUrlInput.value);
    detectedPlatformBadge.textContent = info.badge;
    detectedPlatformBadge.className = `smart-badge ${info.cls}`;
  });

  document.getElementById('QuickDownloadBtn').addEventListener('click', () => {
    createTaskFromInput(quickUrlInput.value, quickQualitySelect.value, '', 16, true);
    quickUrlInput.value = '';
    detectedPlatformBadge.textContent = 'AKILLI ALGILAYICI';
    detectedPlatformBadge.className = 'smart-badge';
  });

  document.querySelectorAll('.preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const presetUrl = chip.getAttribute('data-preset');
      quickUrlInput.value = presetUrl;
      quickUrlInput.dispatchEvent(new Event('input'));
      showToast('Bağlantı kutuya yerleştirildi — "Hemen İndir" ile başlatabilirsiniz.');
    });
  });

  document.getElementById('BtnAddUrl').addEventListener('click', () => {
    modalUrlInput.value = quickUrlInput.value || '';
    if (modalUrlInput.value) analyzeModalUrl();
    mediaModal.classList.remove('hidden');
  });

  document.getElementById('BtnMediaGrabber').addEventListener('click', () => {
    modalUrlInput.value = quickUrlInput.value || '';
    if (modalUrlInput.value) analyzeModalUrl();
    mediaModal.classList.remove('hidden');
  });

  document.getElementById('BtnResume').addEventListener('click', () => {
    const t = tasks.find(x => x.id === selectedTaskId);
    if (!t) return;
    if (t.status === 'completed') {
      showToast('Bu dosya zaten tamamlanmış durumda.', '#8b5cf6');
      return;
    }
    t.status = 'downloading';
    fetch(`${API_BASE}/api/task-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, action: 'resume' })
    }).catch(() => {});
    renderTable();
    showToast(`▶ Devam Ediliyor: ${t.name}`, '#10b981');
  });

  document.getElementById('BtnPause').addEventListener('click', () => {
    const t = tasks.find(x => x.id === selectedTaskId);
    if (!t || t.status !== 'downloading') return;
    t.status = 'paused';
    t.speedMBps = 0;
    fetch(`${API_BASE}/api/task-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, action: 'pause' })
    }).catch(() => {});
    renderTable();
    showToast(`⏸ Duraklatıldı: ${t.name}`, '#f59e0b');
  });

  document.getElementById('BtnStopAll').addEventListener('click', () => {
    tasks.forEach(t => {
      if (t.status === 'downloading') {
        t.status = 'paused';
        t.speedMBps = 0;
        fetch(`${API_BASE}/api/task-action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: t.id, action: 'pause' })
        }).catch(() => {});
      }
    });
    renderTable();
    showToast('⏹ Aktif tüm indirmeler duraklatıldı.', '#f43f5e');
  });

  document.getElementById('BtnDelete').addEventListener('click', () => {
    const idx = tasks.findIndex(x => x.id === selectedTaskId);
    if (idx === -1) return;
    const removed = tasks.splice(idx, 1)[0];
    fetch(`${API_BASE}/api/task-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: removed.id, action: 'delete' })
    }).catch(() => {});
    selectedTaskId = tasks.length > 0 ? tasks[0].id : null;
    renderTable();
    showToast(`🗑️ Listeden Kaldırıldı: ${removed.name}`, '#94a3b8');
  });

  document.getElementById('BtnClearDone').addEventListener('click', () => {
    const before = tasks.length;
    tasks.filter(t => t.status === 'completed').forEach(t => {
      fetch(`${API_BASE}/api/task-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: t.id, action: 'delete' })
      }).catch(() => {});
    });
    tasks = tasks.filter(t => t.status !== 'completed');
    const diff = before - tasks.length;
    renderTable();
    showToast(`✓ ${diff} tamamlanmış görev listeden temizlendi.`, '#10b981');
  });

  document.getElementById('BtnScheduler').addEventListener('click', () => {
    schedulerModal.classList.remove('hidden');
  });

  document.getElementById('BtnOptions').addEventListener('click', () => {
    schedulerModal.classList.remove('hidden');
  });

  turboModeBtn.addEventListener('click', () => {
    turboEnabled = !turboEnabled;
    turboModeBtn.classList.toggle('active', turboEnabled);
    turboModeLabel.textContent = turboEnabled ? 'TURBO AÇIK' : 'STANDART MOD';
    engineStatusBadge.textContent = turboEnabled ? '16-Kanal Turbo Motor Aktif' : 'Standart 4-Kanal Motor';
    showToast(
      turboEnabled
        ? '⚡ 16-Kanal Dinamik Turbo Hızlandırıcı devreye alındı!'
        : 'Standart hız moduna geçildi.'
    );
  });

  document.querySelectorAll('#CategoryList .cat-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#CategoryList .cat-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.getAttribute('data-category');
      renderTable();
    });
  });

  document.querySelectorAll('#StatusFilterList .status-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#StatusFilterList .status-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeStatus = btn.getAttribute('data-status');
      renderTable();
    });
  });

  document.getElementById('SearchInput').addEventListener('input', e => {
    searchQuery = e.target.value;
    renderTable();
  });

  async function analyzeModalUrl() {
    const url = modalUrlInput.value.trim();
    if (!url) return;
    const info = detectPlatform(url);
    previewTitle.textContent = 'Bağlantı çözümleniyor…';

    try {
      const res = await fetch(`${API_BASE}/api/probe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const meta = await res.json();
      if (meta && meta.ok) {
        previewPlatformTag.textContent = info.sourceLabel;
        previewTitle.textContent = meta.title || 'Medya Akışı Hazır';
        previewAuthor.textContent = `Kaynak: ${meta.author || info.sourceLabel} • Reklamsız Doğrudan Akış`;
        previewDuration.textContent = meta.duration || 'HD';
        modalFileNameInput.value = meta.suggestedName || '';
        return;
      }
    } catch (_) {}

    previewPlatformTag.textContent = info.sourceLabel;
    previewTitle.textContent = url.split('/').pop() || 'Medya Akışı Hazır';
    previewAuthor.textContent = '16 Parçalı İndirme Motoru Hazır';
    previewDuration.textContent = 'Hazır';
    modalFileNameInput.value = url.split('/').pop() || '';
  }

  document.getElementById('BtnAnalyzeUrl').addEventListener('click', () => {
    analyzeModalUrl();
    showToast('🔍 Bağlantı çözümleniyor…');
  });

  document.querySelectorAll('.quality-option').forEach(label => {
    label.addEventListener('click', () => {
      document.querySelectorAll('.quality-option').forEach(l => l.classList.remove('selected'));
      label.classList.add('selected');
    });
  });

  document.getElementById('CloseModalBtn').addEventListener('click', () => mediaModal.classList.add('hidden'));
  document.getElementById('CancelModalBtn').addEventListener('click', () => mediaModal.classList.add('hidden'));

  document.getElementById('StartNowBtn').addEventListener('click', () => {
    const selectedQ = document.querySelector('input[name="modalQuality"]:checked');
    createTaskFromInput(
      modalUrlInput.value,
      selectedQ ? selectedQ.value : '1080p',
      modalFileNameInput.value,
      modalThreadsSelect.value,
      true
    );
    mediaModal.classList.add('hidden');
  });

  document.getElementById('QueueLaterBtn').addEventListener('click', () => {
    const selectedQ = document.querySelector('input[name="modalQuality"]:checked');
    createTaskFromInput(
      modalUrlInput.value,
      selectedQ ? selectedQ.value : '1080p',
      modalFileNameInput.value,
      modalThreadsSelect.value,
      false
    );
    mediaModal.classList.add('hidden');
  });

  document.getElementById('CloseSchedulerBtn').addEventListener('click', () => schedulerModal.classList.add('hidden'));
  document.getElementById('SaveSettingsBtn').addEventListener('click', () => {
    speedLimitMBps = Number(document.getElementById('SpeedLimitSelect').value) || 0;
    const badge = document.getElementById('SpeedLimitBadge');
    if (badge) {
      badge.textContent = speedLimitMBps > 0 ? `Limit: ${speedLimitMBps} MB/sn` : 'Limit: Sınırsız';
    }
    schedulerModal.classList.add('hidden');
    showToast('✓ Kuyruk ve hız sınırlayıcı ayarları kaydedildi.');
  });

  const btnSaveFile = document.getElementById('BtnSaveFile');
  if (btnSaveFile) {
    btnSaveFile.addEventListener('click', () => {
      if (!selectedTaskId && diskFiles.length === 0) {
        showToast('Lütfen önce listeden tamamlanmış bir dosya seçin.', '#f59e0b');
        return;
      }
      if (selectedTaskId) {
        window.location.href = `${API_BASE}/api/file?id=${encodeURIComponent(selectedTaskId)}`;
      } else if (diskFiles.length > 0) {
        window.location.href = `${API_BASE}/api/file-by-name?name=${encodeURIComponent(diskFiles[0].name)}`;
      }
      showToast('💾 Dosya doğrudan tarayıcı üzerinden açılıyor / kaydediliyor…', '#10b981');
    });
  }

  async function openFolderAction() {
    try {
      const res = await fetch(`${API_BASE}/api/task-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedTaskId, action: 'open-folder' })
      });
      const data = await res.json();
      if (data && Array.isArray(data.files || data.diskFiles)) {
        diskFiles = data.files || data.diskFiles;
      }
    } catch (_) {}
    if (folderModal) {
      renderFolderModal();
      folderModal.classList.remove('hidden');
    }
    showToast('📂 İndirilenler klasörü ve Windows Gezgini açıldı.');
  }

  document.getElementById('BtnOpenFolder').addEventListener('click', openFolderAction);

  const closeFolderBtn = document.getElementById('CloseFolderModalBtn');
  if (closeFolderBtn) closeFolderBtn.addEventListener('click', () => folderModal.classList.add('hidden'));
  const closeFolderFooterBtn = document.getElementById('CloseFolderFooterBtn');
  if (closeFolderFooterBtn) closeFolderFooterBtn.addEventListener('click', () => folderModal.classList.add('hidden'));
  const forceExplorerBtn = document.getElementById('ForceWindowsExplorerBtn');
  if (forceExplorerBtn) {
    forceExplorerBtn.addEventListener('click', () => {
      fetch(`${API_BASE}/api/task-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedTaskId, action: 'open-folder' })
      }).catch(() => {});
      showToast('🖥️ Windows Gezgini masaüstünde açıldı!');
    });
  }

  document.getElementById('BtnCopyLink').addEventListener('click', () => {
    const t = tasks.find(x => x.id === selectedTaskId);
    if (t && navigator.clipboard) {
      navigator.clipboard.writeText(t.url).catch(() => {});
      showToast('🔗 Bağlantı panoya kopyalandı.');
    }
  });

  renderTable();
  drawSpeedChart();
  syncRealBackendTasks();
  setInterval(tickTelemetry, 900);
})();
