// app.js
import express from "express";
import pkg from "@prisma/client";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { PrismaClient, Status } = pkg;
const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// EJSテンプレート設定
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ----------------------------------------
// デモ用：最初にイベントが無ければ1件だけ作成
// ----------------------------------------
async function ensureSeed() {
  const count = await prisma.event.count();
  if (count === 0) {
    await prisma.event.create({
      data: {
        title: "サークル飲み会",
        startsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        location: "仙台駅前 居酒屋",
        note: "19:00集合",
      },
    });
  }
}

// ----------------------------------------
// トップページ（出欠一覧表示）
// ----------------------------------------
app.get("/", async (req, res) => {
  await ensureSeed();

  const events = await prisma.event.findMany({ orderBy: { startsAt: "desc" } });
  const currentEventId = Number(req.query.eventId || events[0]?.id);
  const members = await prisma.member.findMany({ orderBy: { id: "asc" } });
  const attendances = await prisma.attendance.findMany({
    where: { eventId: currentEventId || undefined },
    include: { member: true },
    orderBy: { updatedAt: "desc" },
  });

  res.render("index", { events, currentEventId, attendances, members });
});

// ----------------------------------------
// 出欠登録フォーム送信
// ----------------------------------------
app.post("/rsvp", async (req, res) => {
  const { eventId, newName, newEmail, status, comment } = req.body;
  const eid = Number(eventId);

  let member = await prisma.member.findFirst({
    where: { email: newEmail || undefined },
  });

  if (!member) {
    member = await prisma.member.create({
      data: { name: newName, email: newEmail || null },
    });
  }

  await prisma.attendance.upsert({
    where: { eventId_memberId: { eventId: eid, memberId: member.id } },
    update: { status, comment },
    create: {
      eventId: eid,
      memberId: member.id,
      status: status in Status ? status : "UNDECIDED",
      comment,
    },
  });

  res.redirect("/");
});

// ----------------------------------------
// イベント追加
// ----------------------------------------
app.post("/events", async (req, res) => {
  const { title, startsAt, location, note } = req.body;
  await prisma.event.create({
    data: {
      title: title?.trim(),
      startsAt: startsAt ? new Date(startsAt) : null,
      location: location || null,
      note: note || null,
    },
  });
  res.redirect("/");
});

// ----------------------------------------
// メンバー追加
// ----------------------------------------
app.post("/members", async (req, res) => {
  const { name, email } = req.body;
  if (name?.trim()) {
    try {
      await prisma.member.create({
        data: { name: name.trim(), email: email || null },
      });
    } catch {
      // email重複などは無視
    }
  }
  res.redirect("/");
});

// ----------------------------------------
// 開発用：全データ削除
// ----------------------------------------
app.post("/dev/clear", async (_req, res) => {
  await prisma.attendance.deleteMany();
  await prisma.member.deleteMany();
  await prisma.event.deleteMany();
  res.redirect("/");
});

// ----------------------------------------
// サーバー起動
// ----------------------------------------
const port = process.env.PORT || 3000;
app.listen(port, () =>
  console.log(`✅ Server started → http://localhost:${port}`)
);
