/* ============================================
   API 服务层 — Supabase REST API（PostgREST）
   ============================================
   模式切换：
     - SUPABASE_ANON_KEY 为空 → 纯 localStorage 运行
     - SUPABASE_ANON_KEY 有值 → 启动时探测，在线则使用 Supabase

   ★ 你需要从 Supabase Dashboard → Settings → API
     获取 anon public key（不是数据库密码），填入 app.js 顶部
   ============================================ */

(function () {
  'use strict';

  const API = (window.XbdtAPI = {});

  let _baseUrl = '';
  let _anonKey = '';
  let _online = false;

  // ────── 初始化 ──────

  API.init = function (supabaseUrl, anonKey) {
    _baseUrl = (supabaseUrl || '').replace(/\/+$/, '');
    _anonKey = anonKey || '';
  };

  API.isOnline = function () { return _online; };

  API.probe = async function () {
    if (!_baseUrl || !_anonKey) { _online = false; return false; }
    try {
      const resp = await fetch(_baseUrl + '/users?select=id&limit=1', {
        headers: _headers(),
        signal: AbortSignal.timeout(5000),
      });
      _online = resp.ok;
      return _online;
    } catch (e) { _online = false; return false; }
  };

  // ────── 请求头 ──────

  function _headers() {
    return { apikey: _anonKey, 'Content-Type': 'application/json' };
  }
  function _headersReturn() {
    return { apikey: _anonKey, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  }

  // ────── fetch 封装 ──────

  async function _get(path) {
    const r = await fetch(_baseUrl + path, { headers: _headers() });
    if (!r.ok) throw new Error('API ' + r.status);
    return r.json();
  }
  async function _post(path, body) {
    const r = await fetch(_baseUrl + path, { method: 'POST', headers: _headersReturn(), body: JSON.stringify(body) });
    if (!r.ok) throw new Error('API ' + r.status);
    return r.json();
  }
  async function _patch(path, body) {
    const r = await fetch(_baseUrl + path, { method: 'PATCH', headers: _headersReturn(), body: JSON.stringify(body || {}) });
    if (!r.ok) throw new Error('API ' + r.status);
    return r.json();
  }

  // ────── localStorage ──────

  const LS = 'xbdt_';
  function lsGet(k) { try { const v = localStorage.getItem(LS + k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) { /* quota */ } }

  // ==================== 任务 ====================

  API.getTasks = async function () {
    if (_online) { try { return await _get('/tasks?select=*&order=created_at.desc'); } catch (e) { console.warn('[Supabase] tasks:', e.message); } }
    return lsGet('tasks') || [];
  };

  API.createTask = async function (task) {
    const tasks = lsGet('tasks') || []; tasks.unshift(task); lsSet('tasks', tasks);
    if (_online) {
      try {
        await _post('/tasks', {
          id: task.id, title: task.title, pickup: task.pickup, delivery: task.delivery,
          reward: task.reward, time: task.time, notes: task.notes || '',
          publisher_id: task.publisherId, publisher_name: task.publisherName,
          status: 'pending', accepter_id: null, accepter_name: null,
          created_at: task.createdAt, urgent: !!task.urgent,
        });
      } catch (e) { console.warn('[Supabase] createTask:', e.message); }
    }
    return task;
  };

  API.updateTask = async function (id, changes) {
    const tasks = lsGet('tasks') || []; const idx = tasks.findIndex(t => t.id === id);
    if (idx !== -1) Object.assign(tasks[idx], changes);
    lsSet('tasks', tasks);
    if (_online) {
      try {
        const body = {};
        if (changes.status !== undefined) body.status = changes.status;
        if (changes.accepterId !== undefined) { body.accepter_id = changes.accepterId; body.accepter_name = changes.accepterName || ''; }
        await _patch('/tasks?id=eq.' + encodeURIComponent(id), body);
      } catch (e) { console.warn('[Supabase] updateTask:', e.message); }
    }
    return idx !== -1 ? tasks[idx] : null;
  };

  // ==================== 消息 ====================

  API.getMessages = async function (taskId) {
    if (_online) { try { return await _get('/messages?task_id=eq.' + encodeURIComponent(taskId) + '&order=id.asc'); } catch (e) {} }
    const all = lsGet('messages') || {}; return all[taskId] || [];
  };

  API.sendMessage = async function (msg) {
    const all = lsGet('messages') || {};
    if (!all[msg.task_id]) all[msg.task_id] = [];
    all[msg.task_id].push(msg); lsSet('messages', all);
    if (_online) {
      try { await _post('/messages', { task_id: msg.task_id, from_id: msg.from, from_name: msg.fromName, text: msg.text, time: msg.time }); } catch (e) {}
    }
    return msg;
  };

  // ==================== 评价 ====================

  API.getReviews = async function (params) {
    if (_online) {
      try {
        let qs = '/reviews?select=*';
        if (params && params.to_id) qs += '&to_id=eq.' + encodeURIComponent(params.to_id);
        if (params && params.task_id) qs += '&task_id=eq.' + encodeURIComponent(params.task_id);
        qs += '&order=id.desc';
        return await _get(qs);
      } catch (e) {}
    }
    return lsGet('reviews') || [];
  };

  API.createReview = async function (review) {
    const reviews = lsGet('reviews') || []; reviews.push(review); lsSet('reviews', reviews);
    if (_online) {
      try { await _post('/reviews', { task_id: review.taskId, from_id: review.from, to_id: review.to, rating: review.rating, comment: review.comment, time: review.time }); } catch (e) {}
    }
    return review;
  };

  // ==================== 通知 ====================

  API.getNotifications = async function (userId) {
    if (_online) { try { return await _get('/notifications?user_id=eq.' + encodeURIComponent(userId) + '&order=time.desc'); } catch (e) {} }
    return lsGet('notifications') || [];
  };

  API.createNotification = async function (notif) {
    const notifs = lsGet('notifications') || []; notifs.unshift(notif); lsSet('notifications', notifs);
    if (_online) {
      try { await _post('/notifications', { id: notif.id, user_id: notif.userId || notif.user_id, type: notif.type, task_id: notif.taskId || notif.task_id || null, text: notif.text, time: notif.time, read: !!notif.read }); } catch (e) {}
    }
    return notif;
  };

  API.markNotifRead = async function (id) {
    const notifs = lsGet('notifications') || []; const n = notifs.find(x => x.id === id); if (n) n.read = true; lsSet('notifications', notifs);
    if (_online) { try { await _patch('/notifications?id=eq.' + encodeURIComponent(id), { read: true }); } catch (e) {} }
  };

  API.markAllNotifRead = async function (userId) {
    const notifs = lsGet('notifications') || []; notifs.forEach(n => n.read = true); lsSet('notifications', notifs);
    if (_online) { try { await _patch('/notifications?user_id=eq.' + encodeURIComponent(userId), { read: true }); } catch (e) {} }
  };

  // ==================== 用户 ====================

  API.getUsers = async function () {
    if (_online) { try { return await _get('/users?select=*'); } catch (e) {} }
    return lsGet('users') || [];
  };

  API.updateUser = async function (id, changes) {
    const users = lsGet('users') || []; const idx = users.findIndex(u => u.id === id);
    if (idx !== -1) Object.assign(users[idx], changes); lsSet('users', users);
    if (_online) { try { await _patch('/users?id=eq.' + encodeURIComponent(id), changes); } catch (e) {} }
  };

  API.getUserRoute = async function (userId) {
    if (_online) { try { const rows = await _get('/user_routes?user_id=eq.' + encodeURIComponent(userId) + '&limit=1'); return (rows && rows.length) ? rows[0] : { pickup: '', delivery: '' }; } catch (e) {} }
    return lsGet('route') || { pickup: '', delivery: '' };
  };

  API.updateUserRoute = async function (userId, pickup, delivery) {
    const route = { pickup, delivery }; lsSet('route', route);
    if (_online) {
      try { await _post('/user_routes', { user_id: userId, pickup, delivery }); }
      catch (e) { try { await _patch('/user_routes?user_id=eq.' + encodeURIComponent(userId), { pickup, delivery }); } catch (e2) {} }
    }
    return route;
  };

  // ==================== 全景同步 ====================

  /** 蛇形 → 驼峰：任务对象 */
  function _mapTask(t) {
    return {
      id: t.id, title: t.title, pickup: t.pickup, delivery: t.delivery,
      reward: t.reward, time: t.time, notes: t.notes,
      publisherId: t.publisher_id, publisherName: t.publisher_name,
      status: t.status, accepterId: t.accepter_id, accepterName: t.accepter_name,
      createdAt: t.created_at, urgent: t.urgent,
    };
  }

  /** 蛇形 → 驼峰：评价对象 */
  function _mapReview(r) {
    return { taskId: r.task_id, from: r.from_id, to: r.to_id, rating: r.rating, comment: r.comment, time: r.time };
  }

  /** 蛇形 → 驼峰：通知对象 */
  function _mapNotif(n) {
    return { id: n.id, type: n.type, taskId: n.task_id || null, text: n.text, time: n.time, read: !!n.read, userId: n.user_id };
  }

  API.pullAll = async function (userId) {
    if (!_online) return false;
    try {
      const [tasks, notifs, reviews, routeRows] = await Promise.all([
        _get('/tasks?select=*&order=created_at.desc'),
        _get('/notifications?user_id=eq.' + encodeURIComponent(userId) + '&order=time.desc'),
        _get('/reviews?select=*&order=id.desc'),
        _get('/user_routes?user_id=eq.' + encodeURIComponent(userId) + '&limit=1'),
      ]);
      lsSet('tasks', tasks.map(_mapTask));
      lsSet('notifications', notifs.map(_mapNotif));
      lsSet('reviews', reviews.map(_mapReview));
      lsSet('route', (routeRows && routeRows.length) ? { pickup: routeRows[0].pickup || '', delivery: routeRows[0].delivery || '' } : { pickup: '', delivery: '' });
      const msgMap = {};
      for (const t of tasks) {
        try { const msgs = await _get('/messages?task_id=eq.' + encodeURIComponent(t.id) + '&order=id.asc'); if (msgs.length) msgMap[t.id] = msgs.map(m => ({ from: m.from_id, fromName: m.from_name, text: m.text, time: m.time })); } catch (e) {}
      }
      lsSet('messages', msgMap);
      console.log('[Supabase] 全量同步完成 ✅', tasks.length + ' 任务');
      return true;
    } catch (e) { console.warn('[Supabase] 全量同步失败:', e.message); return false; }
  };
})();
