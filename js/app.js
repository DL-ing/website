/* ============================================
   "校帮递"校园跑腿代取服务平台 — 主逻辑 v2.1
   完整覆盖：用户中心/任务发布/任务大厅/订单管理/评价反馈

   数据存储双模：
     - 默认 localStorage（纯前端，GitHub Pages 可用）
     - 若配置 SUPABASE_ANON_KEY，启动时探测 Supabase，在线时双写同步
   ============================================ */

// ★ Supabase 配置
//   SUPABASE_URL:  项目地址 + /rest/v1
//   SUPABASE_ANON_KEY: 从 Supabase Dashboard → Settings → API 获取 anon public key
//   留空则纯前端 localStorage 运行
const SUPABASE_URL = 'https://ethdxygvvdqnjqzsyjok.supabase.co/rest/v1';
const SUPABASE_ANON_KEY = 'sb_publishable_eIqietFudirMZ7RSoqibWQ_Ek-0MN8F';

// ---------- 配置数据（取件点/送达点列表，非模拟数据） ----------

const PICKUP_POINTS = [
  '菜鸟驿站（东区）', '菜鸟驿站（西区）', '顺丰快递点',
  '京东快递点', '一食堂', '二食堂', '三食堂',
  '图书馆', '教学楼A区', '教学楼B区', '行政楼', '校门口'
];

const DELIVERY_POINTS = [
  '宿舍1号楼', '宿舍2号楼', '宿舍3号楼', '宿舍4号楼',
  '宿舍5号楼', '宿舍6号楼', '图书馆自习室', '教学楼A区',
  '教学楼B区', '实验室楼', '操场', '校门口'
];

// ---------- 当前用户（本地标识，后端接入后由登录接口返回） ----------

const DEFAULT_USER = { id:'u1',name:'陈静',studentId:'P241012484',avatar:'陈',role:'both',phone:'138****5678' };

// ---------- 状态管理 ----------

const STATE = {
  currentTab: 'hall',
  currentUserId: 'u1',
  tasks: [],
  messages: {},
  reviews: [],
  notifications: [],
  hallFilter: 'all',
  hallPickupFilter: 'all',
  orderFilter: 'all',
  userStats: { published:0, accepted:0, completed:0, rating:'5.0' },
  userRoute: { pickup:'菜鸟驿站（东区）', delivery:'宿舍1号楼' },
};

function getCurrentUser() { return DEFAULT_USER; }

// ---------- 持久化 ----------

function loadFromStorage() {
  STATE.tasks = JSON.parse(localStorage.getItem('xbdt_tasks')||'null') || [];
  STATE.messages = JSON.parse(localStorage.getItem('xbdt_messages')||'null') || {};
  STATE.reviews = JSON.parse(localStorage.getItem('xbdt_reviews')||'null') || [];
  STATE.notifications = JSON.parse(localStorage.getItem('xbdt_notifications')||'null') || [];
  STATE.currentUserId = localStorage.getItem('xbdt_currentUser') || 'u1';
  STATE.userRoute = JSON.parse(localStorage.getItem('xbdt_route')||'null') || { pickup:'菜鸟驿站（东区）',delivery:'宿舍1号楼' };
}

function saveAll() {
  localStorage.setItem('xbdt_tasks',JSON.stringify(STATE.tasks));
  localStorage.setItem('xbdt_messages',JSON.stringify(STATE.messages));
  localStorage.setItem('xbdt_reviews',JSON.stringify(STATE.reviews));
  localStorage.setItem('xbdt_notifications',JSON.stringify(STATE.notifications));
  localStorage.setItem('xbdt_currentUser',STATE.currentUserId);
  localStorage.setItem('xbdt_route',JSON.stringify(STATE.userRoute));
  // ★ 若 API 在线，异步同步关键数据
  if (window.XbdtAPI && window.XbdtAPI.isOnline()) {
    syncToAPI();
  }}

// ---------- 工具函数 ----------

function getTask(id){ return STATE.tasks.find(t=>t.id===id); }
function genId(){ return 'x'+Date.now()+Math.random().toString(36).substr(2,6); }
function now(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }
function timeStr(){ const d=new Date(); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }

function addNotification(type,taskId,text){
  STATE.notifications.unshift({ id:genId(),type,taskId,text,time:now(),read:false });
  saveAll(); updateBadge();
}

// ---------- Toast ----------

function showToast(msg,type){
  const ex=document.querySelector('.toast'); if(ex)ex.remove();
  const t=document.createElement('div'); t.className='toast '+(type||''); t.textContent=msg;
  document.body.appendChild(t); setTimeout(()=>t.remove(),2500);
}

// ---------- 模态框 ----------

function openModal(id,html){
  closeModal(id);
  const overlay=document.createElement('div'); overlay.className='modal-overlay'; overlay.id=id; overlay.innerHTML=html;
  overlay.addEventListener('click',e=>{ if(e.target===overlay){closeModal(id);} });
  document.body.appendChild(overlay);
}
function closeModal(id){ const el=document.getElementById(id); if(el)el.remove(); }

// ---------- 通知角标 ----------

function updateBadge(){
  const badge=document.getElementById('notifBadge'); if(!badge)return;
  const unread=STATE.notifications.filter(n=>!n.read).length;
  badge.textContent=unread; badge.style.display=unread>0?'flex':'none';
}

// ---------- 全局渲染 ----------

function renderAll(){ calcStats(); renderHall(); renderPublish(); renderOrders(); renderUserCenter(); }

function calcStats(){
  const uid=STATE.currentUserId;
  STATE.userStats.published=STATE.tasks.filter(t=>t.publisherId===uid).length;
  STATE.userStats.accepted=STATE.tasks.filter(t=>t.accepterId===uid).length;
  STATE.userStats.completed=STATE.tasks.filter(t=>t.status==='done'&&(t.publisherId===uid||t.accepterId===uid)).length;
  const mr=STATE.reviews.filter(r=>r.to===uid);
  STATE.userStats.rating=mr.length>0?(mr.reduce((s,r)=>s+r.rating,0)/mr.length).toFixed(1):'5.0';
}

// ==================== 任务大厅 ====================

function renderHall(){
  const container=document.getElementById('hallContent');
  let tasks=[...STATE.tasks].filter(t=>['pending','accepted','delivering'].includes(t.status));

  if(STATE.hallPickupFilter!=='all') tasks=tasks.filter(t=>t.pickup===STATE.hallPickupFilter);

  switch(STATE.hallFilter){
    case 'pending': tasks=tasks.filter(t=>t.status==='pending'); break;
    case 'urgent': tasks=tasks.filter(t=>t.urgent); break;
    case 'low-price': tasks.sort((a,b)=>a.reward-b.reward); break;
    case 'high-price': tasks.sort((a,b)=>b.reward-a.reward); break;
    case 'recommend':
      const r=STATE.userRoute;
      tasks=tasks.filter(t=>t.pickup===r.pickup||t.delivery===r.delivery||t.pickup===r.delivery||t.delivery===r.pickup);
      break;
  }

  const allPickups=[...new Set(STATE.tasks.filter(t=>['pending','accepted','delivering'].includes(t.status)).map(t=>t.pickup))];

  container.innerHTML=`
    <div class="filter-bar">
      <span class="filter-chip ${STATE.hallFilter==='all'?'active':''}" onclick="setHallFilter('all')">全部任务</span>
      <span class="filter-chip ${STATE.hallFilter==='recommend'?'active':''}" onclick="setHallFilter('recommend')">⭐ 顺路推荐</span>
      <span class="filter-chip ${STATE.hallFilter==='pending'?'active':''}" onclick="setHallFilter('pending')">待接单</span>
      <span class="filter-chip ${STATE.hallFilter==='urgent'?'active':''}" onclick="setHallFilter('urgent')">🔥 紧急</span>
      <span class="filter-chip ${STATE.hallFilter==='low-price'?'active':''}" onclick="setHallFilter('low-price')">💰 低价</span>
      <span class="filter-chip ${STATE.hallFilter==='high-price'?'active':''}" onclick="setHallFilter('high-price')">💎 高价</span>
    </div>
    <div class="filter-bar" style="margin-bottom:12px;">
      <span class="filter-chip ${STATE.hallPickupFilter==='all'?'active':''}" onclick="setPickupFilter('all')">📍 全部地点</span>
      ${allPickups.map(p=>`<span class="filter-chip ${STATE.hallPickupFilter===p?'active':''}" onclick="setPickupFilter('${p}')">${p}</span>`).join('')}
    </div>
    <div id="hallTaskList">
      ${tasks.length===0?`<div class="empty-state"><div class="empty-icon">📋</div><p>暂时没有符合条件的任务</p><p style="font-size:12px;margin-top:4px;">试试切换筛选条件或发布新任务</p></div>`:tasks.map(t=>renderTaskCard(t)).join('')}
    </div>`;
}

function renderTaskCard(t){
  const canAccept=t.status==='pending'&&t.publisherId!==STATE.currentUserId;
  const canCancel=t.status==='pending'&&t.publisherId===STATE.currentUserId;
  const route=STATE.userRoute;
  const isRouteMatch=(t.pickup===route.pickup||t.delivery===route.delivery||t.pickup===route.delivery||t.delivery===route.pickup);

  let actions='';
  if(canAccept) actions=`<button class="btn btn-primary btn-sm" onclick="event.stopPropagation();acceptTask('${t.id}')">🤝 一键接单</button>`;
  else if(t.status==='accepted'||t.status==='delivering') actions=`<span style="font-size:12px;color:var(--text-muted);">${t.publisherId===STATE.currentUserId?'我发布的':'已有人接单'}</span>`;
  if(canCancel) actions+=` <button class="btn btn-danger-outline btn-sm" onclick="event.stopPropagation();cancelTask('${t.id}')">取消</button>`;

  return `
    <div class="task-card ${t.urgent?'urgent':''} ${isRouteMatch&&STATE.hallFilter!=='recommend'?'route-match':''}" onclick="showTaskDetail('${t.id}')">
      <div class="task-reward">¥${t.reward}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
        <span class="badge badge-${t.status==='delivering'?'delivering':t.status==='accepted'?'accepted':'pending'}">${{pending:'待接单',accepted:'已接单',delivering:'配送中'}[t.status]}</span>
        ${t.urgent?'<span class="badge" style="background:#FEF2F2;color:#991B1B;">🔥 急</span>':''}
        ${isRouteMatch?'<span class="route-badge">🛤️ 顺路</span>':''}
      </div>
      <div style="font-weight:600;font-size:15px;margin-bottom:4px;padding-right:60px;">${t.title}</div>
      <div class="task-route">📍 ${t.pickup} <span class="arrow">→</span> 🏁 ${t.delivery}</div>
      <div class="task-meta"><span>🕐 ${t.time}</span><span>👤 ${t.publisherName}</span>${t.notes?`<span>📝 ${t.notes.substring(0,20)}${t.notes.length>20?'...':''}</span>`:''}</div>
      <div class="task-actions" onclick="event.stopPropagation();">${actions}<button class="btn btn-ghost btn-sm" onclick="showTaskDetail('${t.id}')">详情</button></div>
    </div>`;
}

function setHallFilter(f){ STATE.hallFilter=f; renderHall(); }
function setPickupFilter(p){ STATE.hallPickupFilter=p; renderHall(); }

// ==================== 发布任务 ====================

function renderPublish(){
  document.getElementById('publishContent').innerHTML=`
    <div class="card" style="margin-bottom:0;">
      <div style="font-size:15px;font-weight:600;margin-bottom:14px;">📝 发布代取任务</div>
      <div class="form-group"><label class="form-label">任务标题 <span style="color:var(--danger);">*</span></label><input class="form-input" id="pubTitle" placeholder="例如：菜鸟驿站代取快递" maxlength="30"></div>
      <div class="form-group"><label class="form-label">取件地点</label><select class="form-select" id="pubPickup">${PICKUP_POINTS.map(p=>`<option value="${p}">${p}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">送达地点</label><select class="form-select" id="pubDelivery">${DELIVERY_POINTS.map(p=>`<option value="${p}">${p}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">期望取件时间 <span style="color:var(--danger);">*</span></label><input class="form-input" id="pubTime" placeholder="例如：今天 18:00 前"></div>
      <div class="form-group"><label class="form-label">酬金（元）</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">${[2,3,4,5].map(v=>`<button class="btn btn-outline btn-sm reward-preset" data-val="${v}">¥${v}</button>`).join('')}</div>
        <input class="form-input" type="number" id="pubReward" min="1" max="20" value="3">
      </div>
      <div class="form-group"><label class="form-label">备注信息</label><textarea class="form-textarea" id="pubNotes" placeholder="取件码、物品描述等（选填）" maxlength="100"></textarea></div>
      <div class="form-group"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" id="pubUrgent" style="width:18px;height:18px;"><span style="font-size:14px;">标记为紧急任务 🔥</span></label></div>
      <button class="btn btn-primary btn-block" onclick="publishTask()" style="margin-top:8px;">✨ 立即发布</button>
      <p style="font-size:11px;color:var(--text-muted);text-align:center;margin-top:10px;">发布后任务将出现在【任务大厅】等待同学接单</p>
    </div>`;
}

function publishTask(){
  const title=document.getElementById('pubTitle').value.trim();
  const pickup=document.getElementById('pubPickup').value;
  const delivery=document.getElementById('pubDelivery').value;
  const time=document.getElementById('pubTime').value.trim();
  const reward=Math.min(Math.max(parseInt(document.getElementById('pubReward').value)||3,1),20);
  const notes=document.getElementById('pubNotes').value.trim();
  const urgent=document.getElementById('pubUrgent').checked;
  if(!title){showToast('请输入任务标题','error');return;}
  if(!time){showToast('请输入期望取件时间','error');return;}

  const nt={ id:genId(),title,pickup,delivery,reward,time,notes,publisherId:STATE.currentUserId,publisherName:getCurrentUser().name,status:'pending',accepterId:null,accepterName:null,createdAt:now(),urgent };
  STATE.tasks.unshift(nt); saveAll();
  addNotification('status',nt.id,`你的任务「${title}」已发布到任务大厅`);
  updateAll();
  ['pubTitle','pubTime','pubNotes'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const rw=document.getElementById('pubReward');if(rw)rw.value='3';
  const uc=document.getElementById('pubUrgent');if(uc)uc.checked=false;
  showToast('任务发布成功！🎉','success'); switchTab('hall');
}

// ==================== 我的订单 ====================

function renderOrders(){
  const uid=STATE.currentUserId;
  const mp=STATE.tasks.filter(t=>t.publisherId===uid);
  const ma=STATE.tasks.filter(t=>t.accepterId===uid);
  let display=[];
  if(STATE.orderFilter==='published') display=mp;
  else if(STATE.orderFilter==='accepted') display=ma;
  else display=[...mp,...ma].filter((t,i,a)=>a.findIndex(x=>x.id===t.id)===i);
  display.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));

  document.getElementById('ordersContent').innerHTML=`
    <div class="filter-bar">
      <span class="filter-chip ${STATE.orderFilter==='all'?'active':''}" onclick="setOrderFilter('all')">全部</span>
      <span class="filter-chip ${STATE.orderFilter==='published'?'active':''}" onclick="setOrderFilter('published')">我发布的</span>
      <span class="filter-chip ${STATE.orderFilter==='accepted'?'active':''}" onclick="setOrderFilter('accepted')">我接取的</span>
    </div>
    ${display.length===0?`<div class="empty-state"><div class="empty-icon">📦</div><p>暂无相关订单</p></div>`:display.map(t=>renderOrderCard(t)).join('')}`;
}

function renderOrderCard(t){
  const isPub=t.publisherId===STATE.currentUserId;
  const stMap={pending:{l:'待接单',c:'badge-pending'},accepted:{l:'已接单',c:'badge-accepted'},delivering:{l:'配送中',c:'badge-delivering'},done:{l:'已完成',c:'badge-done'},canceled:{l:'已取消',c:'badge-canceled'}};
  const st=stMap[t.status]||stMap.pending;

  let actions='';
  if(isPub&&t.status==='pending') actions=`<button class="btn btn-danger-outline btn-sm" onclick="event.stopPropagation();cancelTask('${t.id}')">❌ 取消任务</button>`;
  else if(isPub&&t.status==='accepted') actions=`<button class="btn btn-success btn-sm" onclick="event.stopPropagation();confirmDone('${t.id}')">✅ 确认完成</button> <button class="btn btn-danger-outline btn-sm" onclick="event.stopPropagation();cancelTask('${t.id}')">取消</button>`;
  else if(!isPub&&t.status==='accepted') actions=`<button class="btn btn-primary btn-sm" onclick="event.stopPropagation();startDelivery('${t.id}')">🚀 开始配送</button>`;
  else if(!isPub&&t.status==='delivering') actions=`<button class="btn btn-success btn-sm" onclick="event.stopPropagation();markDelivered('${t.id}')">📬 确认送达</button>`;
  if(t.status==='done'){
    const reviewed=STATE.reviews.some(r=>r.taskId===t.id&&r.from===STATE.currentUserId);
    actions=reviewed?'<span style="font-size:12px;color:var(--text-muted);">已评价 ✓</span>':`<button class="btn btn-outline btn-sm" onclick="event.stopPropagation();openReview('${t.id}')">⭐ 评价</button>`;
  }

  const prog=['pending','accepted','delivering','done'].includes(t.status)?`
    <div class="progress-track" style="margin-top:12px;">
      <div class="progress-step ${['accepted','delivering','done'].includes(t.status)?'done':(t.status==='pending'?'active':'')}"><div class="progress-dot">1</div><div class="progress-label">待接单</div></div>
      <div class="progress-step ${['delivering','done'].includes(t.status)?'done':(t.status==='accepted'?'active':'')}"><div class="progress-dot">2</div><div class="progress-label">已接单</div></div>
      <div class="progress-step ${t.status==='done'?'done':(t.status==='delivering'?'active':'')}"><div class="progress-dot">3</div><div class="progress-label">配送中</div></div>
      <div class="progress-step ${t.status==='done'?'done':''}"><div class="progress-dot">4</div><div class="progress-label">已完成</div></div>
    </div>`:'';

  return `
    <div class="card" style="cursor:pointer;" onclick="showTaskDetail('${t.id}')">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;"><span class="badge ${st.c}">${st.l}</span><span style="font-size:12px;color:var(--text-muted);">${isPub?'需求方':'服务方'}</span></div>
      <div style="font-weight:600;font-size:15px;">${t.title}</div>
      <div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">📍 ${t.pickup} → 🏁 ${t.delivery}</div>
      <div style="font-size:13px;color:var(--text-secondary);margin-top:2px;">💰 ¥${t.reward} · 👤 ${isPub?(t.accepterName||'等待接单'):t.publisherName}</div>
      ${prog}${actions?`<div style="margin-top:10px;" onclick="event.stopPropagation();">${actions}</div>`:''}
    </div>`;
}

function setOrderFilter(f){ STATE.orderFilter=f; renderOrders(); }

// ==================== 用户中心 ====================

function renderUserCenter(){
  const u=getCurrentUser(); const s=STATE.userStats;
  const myReviews=STATE.reviews.filter(r=>r.to===STATE.currentUserId);
  const route=STATE.userRoute;

  document.getElementById('userCenterContent').innerHTML=`
    <div class="user-info-card" style="position:relative;">
      <button class="edit-profile-btn" onclick="openEditProfile()">✏️ 编辑资料</button>
      <div class="user-row">
        <div class="avatar avatar-lg" style="background:rgba(255,255,255,.25);">${u.avatar}</div>
        <div><div style="font-size:18px;font-weight:700;">${u.name}</div><div style="font-size:13px;opacity:.85;">学号：${u.studentId}</div><div style="font-size:12px;opacity:.7;">已认证学生身份 ✓</div></div>
      </div>
      <div class="user-stats">
        <div class="stat-item"><div class="stat-num">${s.published}</div><div class="stat-label">发布任务</div></div>
        <div class="stat-item"><div class="stat-num">${s.accepted}</div><div class="stat-label">接单次数</div></div>
        <div class="stat-item"><div class="stat-num">${s.completed}</div><div class="stat-label">已完成</div></div>
        <div class="stat-item"><div class="stat-num">⭐ ${s.rating}</div><div class="stat-label">信用评分</div></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">🛤️ 我的常用路线</span><button class="btn btn-ghost btn-sm" onclick="openEditRoute()">修改</button></div>
      <div style="display:flex;align-items:center;gap:8px;font-size:14px;color:var(--text-secondary);">📍 常去取件点：<strong style="color:var(--text);">${route.pickup}</strong> <span style="color:var(--primary);">→</span> 🏁 常回送达点：<strong style="color:var(--text);">${route.delivery}</strong></div>
      <p style="font-size:11px;color:var(--text-muted);margin-top:6px;">设置常用路线后，任务大厅可为你推荐顺路任务 ⭐</p>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">📝 我的评价</span></div>
      ${myReviews.length===0?'<p style="color:var(--text-muted);font-size:13px;">暂无评价，完成订单后双方可互评</p>':
        myReviews.map(r=>{ return`
          <div style="padding:10px 0;border-bottom:1px solid var(--border);">
            <div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-weight:600;font-size:13px;">用户 ${r.from}</span><div class="stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div></div>
            <p style="font-size:13px;color:var(--text-secondary);margin-top:4px;">${r.comment}</p><span style="font-size:11px;color:var(--text-muted);">${r.time}</span>
          </div>`;}).join('')}
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">💬 意见反馈</span></div>
      <textarea class="form-textarea" id="feedbackInput" placeholder="请告诉我们您的使用体验或改进建议..." style="margin-bottom:8px;"></textarea>
      <button class="btn btn-primary btn-sm" onclick="submitFeedback()">提交反馈</button>
    </div>

    <div style="text-align:center;padding:16px;color:var(--text-muted);font-size:12px;">"校帮递" v2.0 · 校园跑腿代取服务平台<br>纯前端演示版本 · 数据存储在浏览器本地 · 完全兼容 GitHub Pages</div>`;
}

// ---------- 编辑资料 ----------

function openEditProfile(){
  const u=getCurrentUser();
  openModal('editProfileModal',`
    <div class="modal-sheet" onclick="event.stopPropagation();"><div class="modal-handle"></div><div class="modal-body">
      <div class="modal-title">✏️ 编辑个人资料</div>
      <div class="form-group"><label class="form-label">头像字符</label><input class="form-input" id="editAvatar" value="${u.avatar}" maxlength="2" placeholder="1-2个汉字"><p class="form-hint">设置1-2个汉字作为头像显示</p></div>
      <div class="form-group"><label class="form-label">姓名</label><input class="form-input" id="editName" value="${u.name}" maxlength="10"></div>
      <div class="form-group"><label class="form-label">学号</label><input class="form-input" id="editStudentId" value="${u.studentId}" maxlength="20"></div>
      <div class="form-group"><label class="form-label">手机号</label><input class="form-input" id="editPhone" value="${u.phone}" maxlength="15" placeholder="仅用于演示"></div>
      <div class="form-group"><label class="form-label">新密码（模拟）</label><input class="form-input" type="password" id="editPassword" placeholder="输入新密码（演示用）" maxlength="20"></div>
      <button class="btn btn-primary btn-block" onclick="submitEditProfile()">💾 保存修改</button>
      <button class="btn btn-ghost btn-block" style="margin-top:8px;" onclick="closeModal('editProfileModal')">取消</button>
    </div></div>`);
}

function submitEditProfile(){
  const u=getCurrentUser();
  const avatar=document.getElementById('editAvatar').value.trim()||u.avatar;
  const name=document.getElementById('editName').value.trim()||u.name;
  const studentId=document.getElementById('editStudentId').value.trim()||u.studentId;
  const phone=document.getElementById('editPhone').value.trim()||u.phone;
  u.avatar=avatar.substring(0,2); u.name=name; u.studentId=studentId; u.phone=phone;
  STATE.tasks.forEach(t=>{ if(t.publisherId===u.id)t.publisherName=name; if(t.accepterId===u.id)t.accepterName=name; });
  Object.values(STATE.messages).forEach(arr=>{ arr.forEach(m=>{if(m.from===u.id)m.fromName=name;}); });
  saveAll(); closeModal('editProfileModal'); updateAll(); showToast('个人资料已更新！✅','success');
}

// ---------- 编辑常用路线 ----------

function openEditRoute(){
  const route=STATE.userRoute;
  openModal('editRouteModal',`
    <div class="modal-sheet" onclick="event.stopPropagation();"><div class="modal-handle"></div><div class="modal-body">
      <div class="modal-title">🛤️ 设置常用路线</div>
      <p style="font-size:12px;color:var(--text-muted);text-align:center;margin-bottom:12px;">设置后任务大厅将优先推荐顺路任务</p>
      <div class="form-group"><label class="form-label">常去的取件点</label><select class="form-select" id="editRoutePickup">${PICKUP_POINTS.map(p=>`<option value="${p}" ${route.pickup===p?'selected':''}>${p}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">常回的送达点</label><select class="form-select" id="editRouteDelivery">${DELIVERY_POINTS.map(p=>`<option value="${p}" ${route.delivery===p?'selected':''}>${p}</option>`).join('')}</select></div>
      <button class="btn btn-primary btn-block" onclick="submitEditRoute()">💾 保存路线</button>
      <button class="btn btn-ghost btn-block" style="margin-top:8px;" onclick="closeModal('editRouteModal')">取消</button>
    </div></div>`);
}

function submitEditRoute(){
  STATE.userRoute.pickup=document.getElementById('editRoutePickup').value;
  STATE.userRoute.delivery=document.getElementById('editRouteDelivery').value;
  saveAll(); closeModal('editRouteModal'); updateAll(); showToast('常用路线已更新！🎯','success');
}

// ---------- 操作函数 ----------

function acceptTask(taskId){
  const t=getTask(taskId); if(!t||t.status!=='pending')return;
  t.status='accepted'; t.accepterId=STATE.currentUserId; t.accepterName=getCurrentUser().name;
  saveAll(); addNotification('status',taskId,`你接了${t.publisherName}发布的「${t.title}」`);
  updateAll(); showToast('接单成功！请及时完成任务 🤝','success');
}

function cancelTask(taskId){
  const t=getTask(taskId); if(!t)return;
  if(!confirm(`确定要取消任务「${t.title}」吗？此操作不可撤销。`))return;
  t.status='canceled'; saveAll(); addNotification('status',taskId,`任务「${t.title}」已被取消`);
  updateAll(); showToast('任务已取消','success');
}

function confirmDone(taskId){
  if(!confirm('确认该任务已完成？'))return;
  const t=getTask(taskId); if(!t)return; t.status='done';
  saveAll(); addNotification('status',taskId,`任务「${t.title}」已完成，快去评价吧！`);
  updateAll(); showToast('已确认完成！','success');
}

function startDelivery(taskId){
  const t=getTask(taskId); if(!t)return; t.status='delivering';
  saveAll(); addNotification('status',taskId,`你已开始配送「${t.title}」`);
  updateAll(); showToast('已开始配送，请尽快送达 🚀','success');
}

function markDelivered(taskId){
  const t=getTask(taskId); if(!t)return; t.status='done';
  saveAll(); addNotification('status',taskId,`「${t.title}」已送达，等待需求方确认`);
  updateAll(); showToast('已确认送达！✅','success');
}

// ---------- 评价 ----------

function openReview(taskId){
  const t=getTask(taskId); if(!t)return;
  const target=t.publisherId===STATE.currentUserId?{id:t.accepterId,name:t.accepterName}:{id:t.publisherId,name:t.publisherName};
  openModal('reviewModal',`
    <div class="modal-sheet" onclick="event.stopPropagation();"><div class="modal-handle"></div><div class="modal-body">
      <div class="modal-title">⭐ 评价 ${target.name}</div>
      <div style="text-align:center;margin-bottom:16px;"><div id="starPicker" style="font-size:32px;cursor:pointer;display:inline-flex;gap:4px;">${[1,2,3,4,5].map(i=>`<span data-star="${i}" onclick="pickStar(${i})" style="color:#D1D5DB;">★</span>`).join('')}</div><input type="hidden" id="reviewRating" value="5"></div>
      <textarea class="form-textarea" id="reviewComment" placeholder="写下你的评价吧..." style="margin-bottom:12px;"></textarea>
      <button class="btn btn-primary btn-block" onclick="submitReview('${taskId}','${target.id}')">提交评价</button>
      <button class="btn btn-ghost btn-block" style="margin-top:8px;" onclick="closeModal('reviewModal')">取消</button>
    </div></div>`);
  setTimeout(()=>pickStar(5),100);
}

function pickStar(rating){ const el=document.getElementById('reviewRating'); if(el)el.value=rating; document.querySelectorAll('#starPicker span').forEach((s,i)=>{ s.style.color=i<rating?'#F59E0B':'#D1D5DB'; }); }

function submitReview(taskId,targetId){
  const rating=parseInt(document.getElementById('reviewRating').value);
  const comment=document.getElementById('reviewComment').value.trim()||'用户未填写评价内容';
  STATE.reviews.push({taskId,from:STATE.currentUserId,to:targetId,rating,comment,time:now()});
  saveAll(); addNotification('status',taskId,`${getCurrentUser().name}评价了你的服务：${rating}星`);
  closeModal('reviewModal'); updateAll(); showToast('评价成功！⭐','success');
}

// ---------- 任务详情弹窗 ----------

function showTaskDetail(taskId){
  const t=getTask(taskId); if(!t)return;
  const stMap={pending:'待接单',accepted:'已接单',delivering:'配送中',done:'已完成',canceled:'已取消'};
  const msgs=STATE.messages[taskId]||[];

  openModal('taskDetailModal',`
    <div class="modal-sheet" onclick="event.stopPropagation();" style="max-height:90vh;"><div class="modal-handle"></div><div class="modal-body">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><span class="modal-title" style="margin-bottom:0;">📋 任务详情</span><span class="badge badge-${t.status==='done'?'done':t.status==='canceled'?'canceled':t.status==='delivering'?'delivering':t.status==='accepted'?'accepted':'pending'}">${stMap[t.status]}</span></div>
      <div style="font-weight:600;font-size:16px;margin-bottom:8px;">${t.title}</div>
      <div style="font-size:14px;color:var(--text-secondary);margin-bottom:4px;">📍 取件：${t.pickup}</div>
      <div style="font-size:14px;color:var(--text-secondary);margin-bottom:4px;">🏁 送达：${t.delivery}</div>
      <div style="font-size:14px;color:var(--text-secondary);margin-bottom:4px;">🕐 时间：${t.time}</div>
      <div style="font-size:14px;color:var(--text-secondary);margin-bottom:4px;">💰 酬金：<strong>¥${t.reward}</strong></div>
      <div style="font-size:14px;color:var(--text-secondary);margin-bottom:4px;">👤 发布者：${t.publisherName}</div>
      ${t.accepterName?`<div style="font-size:14px;color:var(--text-secondary);margin-bottom:4px;">🤝 接单者：${t.accepterName}</div>`:''}
      ${t.notes?`<div style="font-size:13px;color:var(--text-muted);margin-top:8px;padding:8px;background:var(--bg);border-radius:8px;">📝 ${t.notes}</div>`:''}
      ${t.status!=='done'&&t.status!=='canceled'?`
      <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:12px;">
        <div style="font-weight:600;font-size:14px;margin-bottom:8px;">💬 沟通消息</div>
        <div style="max-height:160px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;margin-bottom:8px;" id="detailChatMsgs">
          ${msgs.length===0?'<div style="color:var(--text-muted);font-size:12px;text-align:center;">暂无消息</div>':msgs.map(m=>`<div class="chat-msg ${m.from===STATE.currentUserId?'mine':'other'}"><div style="font-size:11px;font-weight:600;margin-bottom:2px;">${m.fromName}</div>${m.text}<div class="msg-time">${m.time}</div></div>`).join('')}
        </div>
        <div style="display:flex;gap:8px;"><input id="detailChatInput" placeholder="输入消息..." style="flex:1;padding:8px 12px;border:2px solid var(--border);border-radius:20px;font-size:13px;outline:none;" onkeydown="if(event.key==='Enter')sendDetailChat('${taskId}')"><button class="btn btn-primary btn-sm" onclick="sendDetailChat('${taskId}')">发送</button></div>
      </div>`:''}
      <button class="btn btn-ghost btn-block" style="margin-top:12px;" onclick="closeModal('taskDetailModal')">关闭</button>
    </div></div>`);
  setTimeout(()=>{ const dc=document.getElementById('detailChatMsgs'); if(dc)dc.scrollTop=dc.scrollHeight; },150);
}

function sendDetailChat(taskId){
  const input=document.getElementById('detailChatInput'); if(!input)return;
  const text=input.value.trim(); if(!text)return;
  if(!STATE.messages[taskId])STATE.messages[taskId]=[];
  STATE.messages[taskId].push({from:STATE.currentUserId,fromName:getCurrentUser().name,text,time:timeStr()});
  saveAll(); addNotification('msg',taskId,`${getCurrentUser().name}给你发送了一条新消息`);
  input.value='';
  const dc=document.getElementById('detailChatMsgs');
  if(dc){ const msgs=STATE.messages[taskId]||[]; dc.innerHTML=msgs.map(m=>`<div class="chat-msg ${m.from===STATE.currentUserId?'mine':'other'}"><div style="font-size:11px;font-weight:600;margin-bottom:2px;">${m.fromName}</div>${m.text}<div class="msg-time">${m.time}</div></div>`).join(''); dc.scrollTop=dc.scrollHeight; }
  updateBadge();
}

// ---------- 通知面板 ----------

function openNotifications(){
  const ex=document.getElementById('notifPanel'); if(ex){ex.remove();return;}
  const panel=document.createElement('div'); panel.className='notification-panel'; panel.id='notifPanel';
  panel.innerHTML=`
    <div class="notif-header"><span>🔔 消息通知</span><div style="display:flex;gap:8px;"><button class="btn btn-ghost btn-sm" onclick="markAllNotifRead()">全部已读</button><button class="btn btn-ghost btn-sm" onclick="document.getElementById('notifPanel').remove()">✕</button></div></div>
    <div class="notif-list" id="notifList">
      ${STATE.notifications.length===0?`<div class="notif-empty">暂无通知</div>`:STATE.notifications.map(n=>{const im={status:'📦',msg:'💬',system:'🔔'}; return`
        <div class="notif-item ${n.read?'':'unread'}" onclick="handleNotifClick('${n.id}','${n.taskId||''}')">
          <div class="notif-icon" style="background:${n.read?'var(--bg)':'var(--primary-light)'};">${im[n.type]||'🔔'}</div>
          <div class="notif-body"><div>${n.text}</div><div class="notif-time">${n.time}</div></div>
          ${n.read?'':'<span style="width:8px;height:8px;background:var(--primary);border-radius:50%;flex-shrink:0;margin-top:6px;"></span>'}
        </div>`;}).join('')}
    </div>`;
  document.body.appendChild(panel);
}

function handleNotifClick(notifId,taskId){
  const n=STATE.notifications.find(x=>x.id===notifId); if(n){n.read=true;saveAll();updateBadge();}
  if(taskId){ document.getElementById('notifPanel')?.remove(); showTaskDetail(taskId); }
  else openNotifications();
}

function markAllNotifRead(){ STATE.notifications.forEach(n=>n.read=true); saveAll(); updateBadge(); const lst=document.getElementById('notifList'); if(lst){ lst.innerHTML=STATE.notifications.map(n=>{const im={status:'📦',msg:'💬',system:'🔔'}; return`<div class="notif-item read" onclick="handleNotifClick('${n.id}','${n.taskId||''}')"><div class="notif-icon" style="background:var(--bg);">${im[n.type]||'🔔'}</div><div class="notif-body"><div>${n.text}</div><div class="notif-time">${n.time}</div></div></div>`;}).join(''); } showToast('全部已读','success'); }

// ---------- 意见反馈 ----------

function submitFeedback(){ const input=document.getElementById('feedbackInput'); if(!input)return; const text=input.value.trim(); if(!text){showToast('请输入反馈内容','error');return;} input.value=''; showToast('感谢你的反馈！💡','success'); }

// ---------- Tab 切换 ----------

function switchTab(tab){
  STATE.currentTab=tab;
  document.querySelectorAll('.page-section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const sm={hall:'hallSection',publish:'publishSection',orders:'ordersSection',user:'userSection'};
  const sec=document.getElementById(sm[tab]); if(sec)sec.classList.add('active');
  const nm={hall:'navHall',publish:'navPublish',orders:'navOrders',user:'navUser'};
  const nav=document.getElementById(nm[tab]); if(nav)nav.classList.add('active');
  if(tab==='hall')renderHall(); if(tab==='orders')renderOrders(); if(tab==='user')renderUserCenter();
  updateBadge();
}

function updateAll(){ calcStats(); renderHall(); renderOrders(); renderUserCenter(); updateBadge(); }

// ---------- 事件绑定 ----------

function bindEvents(){
  document.getElementById('navHall').addEventListener('click',()=>switchTab('hall'));
  document.getElementById('navPublish').addEventListener('click',()=>switchTab('publish'));
  document.getElementById('navOrders').addEventListener('click',()=>switchTab('orders'));
  document.getElementById('navUser').addEventListener('click',()=>switchTab('user'));
  document.getElementById('headerBell').addEventListener('click',e=>{e.stopPropagation();openNotifications();});

  document.addEventListener('click',function(e){
    if(e.target.classList.contains('reward-preset')){
      const pr=document.getElementById('pubReward'); if(pr)pr.value=e.target.dataset.val;
      document.querySelectorAll('.reward-preset').forEach(b=>{b.classList.remove('btn-primary');b.classList.add('btn-outline');});
      e.target.classList.remove('btn-outline'); e.target.classList.add('btn-primary');
    }
  });
  document.addEventListener('click',function(e){ const p=document.getElementById('notifPanel'); if(p&&!p.contains(e.target)&&e.target.id!=='headerBell')p.remove(); });
  renderPublish();
}

// ---------- API 同步（后台静默，不阻塞 UI） ----------

async function syncToAPI() {
  const API = window.XbdtAPI;
  if (!API || !API.isOnline()) return;
  const uid = STATE.currentUserId;
  // 这里仅做轻量推送：如有未同步的新任务/评价/通知，后续可扩展
  // 当前版本保证 localStorage 为主，API 为辅
  try {
    await API.updateUserRoute(uid, STATE.userRoute.pickup, STATE.userRoute.delivery);
  } catch (e) { /* 静默 */ }
}

// ---------- 启动 ----------

document.addEventListener('DOMContentLoaded', async () => {
  loadFromStorage();

  // ★ 初始化 Supabase API 层
  if (typeof XbdtAPI !== 'undefined') {
    XbdtAPI.init(SUPABASE_URL, SUPABASE_ANON_KEY);
    if (SUPABASE_ANON_KEY) {
      const online = await XbdtAPI.probe();
      if (online) {
        console.log('[校帮递] Supabase 已连接，拉取云端数据...');
        await XbdtAPI.pullAll(STATE.currentUserId);
        loadFromStorage();
      } else {
        console.log('[校帮递] Supabase 不可达，使用本地数据');
      }
    }
  }

  renderAll();
  bindEvents();
  updateBadge();
});
