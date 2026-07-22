const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const PORT = Number(process.env.PORT || 5050);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

const defaultDb = {
  teachers: [
    {
      id: 'teacher_1',
      name: 'Priya',
      phone: '9876543210',
      speciality: 'Zumba cardio'
    }
  ],
  students: [],
  classes: [
    {
      id: 'class_1',
      title: 'Zumba Cardio',
      day: 'Monday',
      time: '6:30 PM',
      teacherId: 'teacher_1',
      capacity: 20
    },
    {
      id: 'class_2',
      title: 'Bollywood Zumba',
      day: 'Wednesday',
      time: '7:00 PM',
      teacherId: 'teacher_1',
      capacity: 20
    }
  ],
  attendance: [],
  orders: []
};

const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type'
};

function id(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

async function readDb() {
  await ensureDb();
  return JSON.parse(await fs.readFile(DB_PATH, 'utf8'));
}

async function writeDb(db) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));
}

async function ensureDb() {
  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DB_PATH, JSON.stringify(defaultDb, null, 2));
  }
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function readBody(req) {
  const raw = await readRawBody(req);
  return raw ? JSON.parse(raw) : {};
}

function verifyShopifyWebhook(req, rawBody) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) return true;
  const hmac = req.headers['x-shopify-hmac-sha256'];
  if (!hmac) return false;
  const digest = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));
}

function classesFromLineItem(title) {
  const text = String(title || '').toLowerCase();
  if (text.includes('monthly') || text.includes('unlimited')) return 30;
  const match = text.match(/(\d+)\s*[- ]?class/);
  if (match) return Number(match[1]);
  if (text.includes('trial')) return 1;
  return 1;
}

function upsertStudentFromOrder(db, order) {
  const customer = order.customer || {};
  const firstName = customer.first_name || order.billing_address?.first_name || '';
  const lastName = customer.last_name || order.billing_address?.last_name || '';
  const name = `${firstName} ${lastName}`.trim() || order.email || order.phone || 'Shopify customer';
  const phone = order.phone || customer.phone || order.billing_address?.phone || '';
  const email = order.email || customer.email || '';
  const lineItems = order.line_items || [];
  const plan = lineItems.map((item) => item.title).filter(Boolean).join(', ') || 'Shopify order';
  const totalClasses = lineItems.reduce((sum, item) => {
    return sum + classesFromLineItem(item.title) * Number(item.quantity || 1);
  }, 0) || 1;

  let student = db.students.find((item) => {
    return (email && item.email === email) || (phone && item.phone === phone);
  });

  if (student) {
    student.plan = plan;
    student.totalClasses += totalClasses;
    student.remainingClasses += totalClasses;
  } else {
    student = {
      id: id('student'),
      name,
      phone,
      email,
      plan,
      totalClasses,
      remainingClasses: totalClasses
    };
    db.students.push(student);
  }

  return student;
}

function send(res, status, data) {
  res.writeHead(status, jsonHeaders);
  res.end(JSON.stringify(data));
}

function notFound(res) {
  send(res, 404, { error: 'Not found' });
}

function badRequest(res, message) {
  send(res, 400, { error: message });
}

function withTeacher(db, classItem) {
  const teacher = db.teachers.find((item) => item.id === classItem.teacherId);
  return { ...classItem, teacherName: teacher ? teacher.name : 'Unassigned' };
}

function attendanceDetails(db, item) {
  const student = db.students.find((entry) => entry.id === item.studentId);
  const classItem = db.classes.find((entry) => entry.id === item.classId);
  const teacher = classItem ? db.teachers.find((entry) => entry.id === classItem.teacherId) : null;
  return {
    ...item,
    studentName: student ? student.name : 'Unknown student',
    studentPhone: student ? student.phone : '',
    classTitle: classItem ? classItem.title : 'Unknown class',
    classTime: classItem ? `${classItem.day} ${classItem.time}` : '',
    teacherName: teacher ? teacher.name : 'Unassigned'
  };
}

async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const db = await readDb();

  if (req.method === 'GET' && url.pathname === '/api/summary') {
    return send(res, 200, {
      students: db.students.length,
      teachers: db.teachers.length,
      classes: db.classes.length,
      attendance: db.attendance.length,
      lowBalanceStudents: db.students.filter((student) => student.remainingClasses <= 2)
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/teachers') {
    return send(res, 200, db.teachers);
  }

  if (req.method === 'GET' && url.pathname === '/api/students') {
    return send(res, 200, db.students);
  }

  if (req.method === 'GET' && url.pathname === '/api/classes') {
    return send(res, 200, db.classes.map((item) => withTeacher(db, item)));
  }

  if (req.method === 'GET' && url.pathname === '/api/attendance') {
    return send(res, 200, db.attendance.map((item) => attendanceDetails(db, item)));
  }

  if (req.method === 'GET' && url.pathname === '/api/orders') {
    return send(res, 200, db.orders || []);
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return send(res, 200, { ok: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/teachers') {
    const body = await readBody(req);
    if (!body.name) return badRequest(res, 'Teacher name is required');
    const teacher = {
      id: id('teacher'),
      name: body.name,
      phone: body.phone || '',
      speciality: body.speciality || ''
    };
    db.teachers.push(teacher);
    await writeDb(db);
    return send(res, 201, teacher);
  }

  if (req.method === 'POST' && url.pathname === '/api/students') {
    const body = await readBody(req);
    if (!body.name || !body.phone) return badRequest(res, 'Student name and phone are required');
    const totalClasses = Number(body.totalClasses || 1);
    const student = {
      id: id('student'),
      name: body.name,
      phone: body.phone,
      email: body.email || '',
      plan: body.plan || 'Trial Class',
      totalClasses,
      remainingClasses: totalClasses
    };
    db.students.push(student);
    await writeDb(db);
    return send(res, 201, student);
  }

  if (req.method === 'POST' && url.pathname === '/api/classes') {
    const body = await readBody(req);
    if (!body.title || !body.day || !body.time) return badRequest(res, 'Class title, day, and time are required');
    const classItem = {
      id: id('class'),
      title: body.title,
      day: body.day,
      time: body.time,
      teacherId: body.teacherId || '',
      capacity: Number(body.capacity || 20)
    };
    db.classes.push(classItem);
    await writeDb(db);
    return send(res, 201, withTeacher(db, classItem));
  }

  if (req.method === 'POST' && url.pathname === '/api/checkin') {
    const body = await readBody(req);
    const student = db.students.find((item) => item.id === body.studentId);
    const classItem = db.classes.find((item) => item.id === body.classId);
    if (!student || !classItem) return badRequest(res, 'Valid student and class are required');
    if (student.remainingClasses <= 0) return badRequest(res, 'Student has no remaining classes');

    const date = body.date || new Date().toISOString().slice(0, 10);
    const alreadyMarked = db.attendance.some((item) => {
      return item.studentId === body.studentId && item.classId === body.classId && item.date === date;
    });
    if (alreadyMarked) return badRequest(res, 'Attendance already marked for this student, class, and date');

    student.remainingClasses -= 1;
    const attendance = {
      id: id('attendance'),
      studentId: student.id,
      classId: classItem.id,
      date,
      status: 'attended'
    };
    db.attendance.push(attendance);
    await writeDb(db);
    return send(res, 201, attendanceDetails(db, attendance));
  }

  if (req.method === 'POST' && url.pathname === '/api/simulate-shopify-order') {
    const body = await readBody(req);
    const order = {
      id: id('sample_order'),
      name: `#SIM-${Date.now().toString().slice(-5)}`,
      email: body.email || 'student@example.com',
      phone: body.phone || '9000000000',
      customer: {
        first_name: body.firstName || 'Sample',
        last_name: body.lastName || 'Student',
        email: body.email || 'student@example.com',
        phone: body.phone || '9000000000'
      },
      line_items: [
        {
          title: body.product || '10-Class Pass',
          quantity: Number(body.quantity || 1)
        }
      ],
      created_at: new Date().toISOString()
    };
    const student = upsertStudentFromOrder(db, order);
    db.orders = db.orders || [];
    db.orders.push({
      id: String(order.id),
      name: order.name,
      customerName: student.name,
      email: student.email,
      phone: student.phone,
      plan: student.plan,
      classesAdded: classesFromLineItem(order.line_items[0].title) * Number(order.line_items[0].quantity || 1),
      createdAt: order.created_at,
      source: 'simulation'
    });
    await writeDb(db);
    return send(res, 201, { order, student });
  }

  return notFound(res);
}

async function handleWebhook(req, res, url) {
  if (req.method !== 'POST' || url.pathname !== '/webhooks/shopify/orders-create') {
    return notFound(res);
  }

  const rawBody = await readRawBody(req);
  if (!verifyShopifyWebhook(req, rawBody)) {
    return send(res, 401, { error: 'Invalid Shopify webhook signature' });
  }

  const order = rawBody ? JSON.parse(rawBody) : {};
  const db = await readDb();
  db.orders = db.orders || [];

  const orderId = String(order.id || '');
  const existing = db.orders.find((item) => item.id === orderId && item.source === 'shopify');
  if (existing) return send(res, 200, { ok: true, duplicate: true });

  const before = db.students.map((student) => ({ id: student.id, remainingClasses: student.remainingClasses }));
  const student = upsertStudentFromOrder(db, order);
  const oldBalance = before.find((item) => item.id === student.id)?.remainingClasses || 0;

  db.orders.push({
    id: orderId || id('shopify_order'),
    name: order.name || order.order_number || orderId || 'Shopify order',
    customerName: student.name,
    email: student.email,
    phone: student.phone,
    plan: student.plan,
    classesAdded: student.remainingClasses - oldBalance,
    createdAt: order.created_at || new Date().toISOString(),
    source: 'shopify'
  });

  await writeDb(db);
  return send(res, 200, { ok: true });
}

async function serveStatic(req, res, url) {
  const requested = url.pathname === '/' ? '/admin.html' : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));
  if (!filePath.startsWith(PUBLIC_DIR)) return notFound(res);

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    const type = ext === '.html' ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8';
    res.writeHead(200, { 'content-type': type });
    res.end(data);
  } catch {
    notFound(res);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/webhooks/')) {
      await handleWebhook(req, res, url);
    } else if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else {
      await serveStatic(req, res, url);
    }
  } catch (error) {
    send(res, 500, { error: error.message });
  }
});

ensureDb().then(() => {
  server.listen(PORT, () => {
  console.log(`Zumba backend running: http://127.0.0.1:${PORT}`);
  });
});
