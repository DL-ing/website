-- ============================================
-- “校帮递” Supabase (PostgreSQL) 数据库 Schema
-- 在 Supabase SQL Editor 中执行此文件即可建表 + 种子数据
-- ============================================

-- ---------- 表定义 ----------

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  student_id  TEXT NOT NULL,
  avatar      TEXT DEFAULT '',
  role        TEXT DEFAULT 'both',
  phone       TEXT DEFAULT '',
  password    TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  pickup         TEXT NOT NULL,
  delivery       TEXT NOT NULL,
  reward         INTEGER NOT NULL DEFAULT 2,
  time           TEXT NOT NULL,
  notes          TEXT DEFAULT '',
  publisher_id   TEXT NOT NULL REFERENCES users(id),
  publisher_name TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',
  accepter_id    TEXT REFERENCES users(id),
  accepter_name  TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  urgent         BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS messages (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  from_id     TEXT NOT NULL,
  from_name   TEXT NOT NULL,
  text        TEXT NOT NULL,
  time        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id   TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  from_id   TEXT NOT NULL,
  to_id     TEXT NOT NULL,
  rating    INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment   TEXT DEFAULT '',
  time      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id        TEXT PRIMARY KEY,
  user_id   TEXT NOT NULL REFERENCES users(id),
  type      TEXT NOT NULL DEFAULT 'system',
  task_id   TEXT,
  text      TEXT NOT NULL,
  time      TIMESTAMPTZ DEFAULT now(),
  read      BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS user_routes (
  id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id   TEXT UNIQUE NOT NULL REFERENCES users(id),
  pickup    TEXT DEFAULT '',
  delivery  TEXT DEFAULT ''
);

-- ---------- 启用 Row Level Security（可选：先全放行，后续按需收紧） ----------

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_routes ENABLE ROW LEVEL SECURITY;

-- 为匿名角色开放全部读写（生产环境请根据用户身份细化策略）
CREATE POLICY "Allow all for anon" ON users         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON tasks         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON messages      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON reviews       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON notifications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON user_routes   FOR ALL USING (true) WITH CHECK (true);

-- ---------- 种子数据 ----------

INSERT INTO users(id, name, student_id, avatar, role, phone) VALUES
  ('u1','陈静',  'P241012484','陈','both',     '138****5678'),
  ('u2','王金阳','P241012497','王','both',     '139****1234'),
  ('u3','李金铭','P241012469','李','both',     '136****9012'),
  ('u4','张明',  'P241012301','张','runner',   '137****3456'),
  ('u5','刘芳',  'P241012302','刘','runner',   '135****7890'),
  ('u6','赵强',  'P241012303','赵','runner',   '133****1111'),
  ('u7','孙雨',  'P241012304','孙','requester','132****2222'),
  ('u8','周杰',  'P241012305','周','requester','131****3333')
ON CONFLICT (id) DO NOTHING;

INSERT INTO tasks(id, title, pickup, delivery, reward, time, notes, publisher_id, publisher_name, status, accepter_id, accepter_name, created_at, urgent) VALUES
  ('t1','菜鸟驿站代取快递（小件）','菜鸟驿站（东区）','宿舍1号楼',3,'今天 18:00 前','取件码 3-2-5678','u7','孙雨','pending',null,null,'2026-06-16 10:30',false),
  ('t2','帮忙取外卖（二食堂麻辣烫）','二食堂','宿舍3号楼',2,'今天 12:00 左右','麻辣烫已点好','u8','周杰','pending',null,null,'2026-06-16 11:00',true),
  ('t3','顺丰快递代取（大件）','顺丰快递点','宿舍5号楼',5,'今天 15:00-17:00','大箱子有点重','u7','孙雨','accepted','u4','张明','2026-06-16 09:00',false),
  ('t4','图书馆还书代送','宿舍2号楼','图书馆',2,'今天任意时间','两本书三楼还书处','u8','周杰','pending',null,null,'2026-06-16 08:20',false),
  ('t5','京东快递代取','京东快递点','宿舍4号楼',3,'今天 14:00 前','JD-20260616-001','u7','孙雨','delivering','u5','刘芳','2026-06-16 13:00',false),
  ('t6','一食堂带饭（盖浇饭）','一食堂','教学楼A区',3,'今天 11:30','鱼香肉丝盖浇饭不要辣','u8','周杰','done','u6','赵强','2026-06-15 11:00',false),
  ('t7','菜鸟驿站取件（中件）','菜鸟驿站（西区）','宿舍6号楼',4,'2026-06-17 上午','取件码 1-4-2234','u3','李金铭','pending',null,null,'2026-06-16 14:00',false),
  ('t8','校门口取外卖','校门口','宿舍1号楼',2,'今天 18:30','外卖架尾号888','u2','王金阳','pending',null,null,'2026-06-16 16:00',true),
  ('t9','三食堂代取晚餐','三食堂','宿舍4号楼',3,'今天 17:30','黄焖鸡米饭+奶茶','u1','陈静','pending',null,null,'2026-06-16 15:00',false),
  ('t10','菜鸟驿站代取（已接单）','菜鸟驿站（东区）','宿舍2号楼',3,'今天 16:00 前','取件码 2-3-1123','u7','孙雨','accepted','u1','陈静','2026-06-16 14:30',false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO messages(task_id, from_id, from_name, text, time) VALUES
  ('t3','u4','张明','你好，已经接单了，马上去取','09:15'),
  ('t3','u7','孙雨','好的！取件码 SF-20260616-003','09:16'),
  ('t3','u4','张明','收到，大概15分钟送到','09:17'),
  ('t5','u5','刘芳','已取到快递，正在路上','13:20'),
  ('t5','u7','孙雨','好的，我在宿舍楼下等你','13:21'),
  ('t10','u7','孙雨','麻烦帮忙取一下快递，谢谢！','14:32'),
  ('t10','u1','陈静','好的，顺路马上取','14:33'),
  ('t10','u7','孙雨','取件码 2-3-1123 东区菜鸟驿站','14:34');

INSERT INTO reviews(task_id, from_id, to_id, rating, comment, time) VALUES
  ('t6','u8','u6',5,'赵强同学非常靠谱，准时送达！','2026-06-15 12:00'),
  ('t6','u6','u8',5,'沟通很顺畅，愉快的合作','2026-06-15 12:05');

INSERT INTO notifications(id, user_id, type, task_id, text, time, read) VALUES
  ('n1','u1','status','t10','你接了孙雨发布的「菜鸟驿站代取」任务','2026-06-16 14:33',false),
  ('n2','u1','msg',   't10','孙雨给你发送了一条新消息','2026-06-16 14:34',false),
  ('n3','u1','system',null,'欢迎使用"校帮递"校园跑腿代取平台！','2026-06-16 08:00',true);

INSERT INTO user_routes(user_id, pickup, delivery) VALUES
  ('u1','菜鸟驿站（东区）','宿舍1号楼'),
  ('u2','菜鸟驿站（西区）','宿舍3号楼'),
  ('u3','京东快递点','宿舍6号楼')
ON CONFLICT (user_id) DO NOTHING;
