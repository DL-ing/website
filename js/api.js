/* ============================================
   API 服务层 — 纯 Supabase（无 localStorage）
   所有数据直连数据库，不经过浏览器本地存储
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
        headers: _h(), signal: AbortSignal.timeout(5000),
      });
      _online = resp.ok;
      return _online;
    } catch (e) { _online = false; return false; }
  };

  // ────── 请求头 ──────

  function _h() { return { apikey: _anonKey, 'Content-Type': 'application/json' }; }
  function _hr() { return { apikey: _anonKey, 'Content-Type': 'application/json', Prefer: 'return=representation' }; }

  // ────── fetch ──────

  async function _get(p) { const r = await fetch(_baseUrl + p, { headers: _h() }); if (!r.ok) throw new Error('API ' + r.status); return r.json(); }
  async function _post(p, b) { const r = await fetch(_baseUrl + p, { method: 'POST', headers: _hr(), body: JSON.stringify(b) }); if (!r.ok) throw new Error('API ' + r.status); return r.json(); }
  async function _patch(p, b) { const r = await fetch(_baseUrl + p, { method: 'PATCH', headers: _hr(), body: JSON.stringify(b || {}) }); if (!r.ok) throw new Error('API ' + r.status); return r.json(); }
  async function _delete(p) { const r = await fetch(_baseUrl + p, { method: 'DELETE', headers: _h() }); if (!r.ok) throw new Error('API ' + r.status); }

  // ────── 字段映射（蛇形 → 驼峰） ──────

  function _mapTask(t) {
    return { id: t.id, title: t.title, pickup: t.pickup, delivery: t.delivery, reward: t.reward, time: t.time, notes: t.notes, publisherId: t.publisher_id, publisherName: t.publisher_name, status: t.status, accepterId: t.accepter_id, accepterName: t.accepter_name, createdAt: t.created_at, urgent: t.urgent };
  }
  function _mapReview(r) { return { taskId: r.task_id, from: r.from_id, to: r.to_id, rating: r.rating, comment: r.comment, time: r.time }; }
  function _mapNotif(n) { return { id: n.id, type: n.type, taskId: n.task_id || null, text: n.text, time: n.time, read: !!n.read, userId: n.user_id }; }

  // ==================== 任务 ====================

  /** 全量拉取并返回驼峰格式 */
  API.fetchTasks = async function () {
    const rows = await _get('/tasks?select=*&order=created_at.desc');
    return rows.map(_mapTask);
  };

  API.createTask = async function (task) {
    await _post('/tasks', {
      id: task.id, title: task.title, pickup: task.pickup, delivery: task.delivery,
      reward: task.reward, time: task.time, notes: task.notes || '',
      publisher_id: task.publisherId, publisher_name: task.publisherName,
      status: 'pending', accepter_id: null, accepter_name: null,
      created_at: task.createdAt, urgent: !!task.urgent,
    });
  };

  API.updateTask = async function (id, changes) {
    const body = {};
    if (changes.status !== undefined) body.status = changes.status;
    if (changes.accepterId !== undefined) { body.accepter_id = changes.accepterId; body.accepter_name = changes.accepterName || ''; }
    await _patch('/tasks?id=eq.' + encodeURIComponent(id), body);
  };

  API.deleteTask = async function (id) {
    await _delete('/tasks?id=eq.' + encodeURIComponent(id));
  };

  // ==================== 消息 ====================

  API.fetchMessages = async function (taskId) {
    const rows = await _get('/messages?task_id=eq.' + encodeURIComponent(taskId) + '&order=id.asc');
    return rows.map(m => ({ from: m.from_id, fromName: m.from_name, text: m.text, time: m.time }));
  };

  API.sendMessage = async function (msg) {
    await _post('/messages', { task_id: msg.task_id, from_id: msg.from, from_name: msg.fromName, text: msg.text, time: msg.time });
  };

  // ==================== 评价 ====================

  API.fetchReviews = async function () {
    const rows = await _get('/reviews?select=*&order=id.desc');
    return rows.map(_mapReview);
  };

  API.createReview = async function (review) {
    await _post('/reviews', { task_id: review.taskId, from_id: review.from, to_id: review.to, rating: review.rating, comment: review.comment, time: review.time });
  };

  // ==================== 通知 ====================

  API.fetchNotifications = async function (userId) {
    const rows = await _get('/notifications?user_id=eq.' + encodeURIComponent(userId) + '&order=time.desc');
    return rows.map(_mapNotif);
  };

  API.createNotification = async function (notif) {
    await _post('/notifications', { id: notif.id, user_id: notif.userId, type: notif.type, task_id: notif.taskId || null, text: notif.text, time: notif.time, read: !!notif.read });
  };

  API.markNotifRead = async function (id) {
    await _patch('/notifications?id=eq.' + encodeURIComponent(id), { read: true });
  };

  API.markAllNotifRead = async function (userId) {
    await _patch('/notifications?user_id=eq.' + encodeURIComponent(userId), { read: true });
  };

  // ==================== 路线 ====================

  API.fetchRoute = async function (userId) {
    try {
      const rows = await _get('/user_routes?user_id=eq.' + encodeURIComponent(userId) + '&limit=1');
      return (rows && rows.length) ? { pickup: rows[0].pickup || '', delivery: rows[0].delivery || '' } : { pickup: '', delivery: '' };
    } catch (e) { return { pickup: '', delivery: '' }; }
  };

  API.updateUserRoute = async function (userId, pickup, delivery) {
    try { await _post('/user_routes', { user_id: userId, pickup, delivery }); }
    catch (e) { await _patch('/user_routes?user_id=eq.' + encodeURIComponent(userId), { pickup, delivery }); }
  };

  // ==================== 全景拉取（启动时调用） ====================

  /** 返回 { tasks, messages, reviews, notifications, route }，全部驼峰格式 */
  API.pullAll = async function (userId) {
    const [tasks, notifs, reviews, route] = await Promise.all([
      API.fetchTasks(),
      API.fetchNotifications(userId),
      API.fetchReviews(),
      API.fetchRoute(userId),
    ]);
    const msgMap = {};
    for (const t of tasks) {
      try { const msgs = await API.fetchMessages(t.id); if (msgs.length) msgMap[t.id] = msgs; } catch (e) {}
    }
    console.log('[Supabase] 数据拉取完成 ✅', tasks.length + ' 任务');
    return { tasks, messages: msgMap, reviews, notifications: notifs, route };
  };
})();
