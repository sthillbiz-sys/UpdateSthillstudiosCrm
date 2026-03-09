import dotenv from "dotenv";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import multer from "multer";
import * as XLSX from "xlsx";
import * as pdf from "pdf-parse";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, isMysqlDuplicateError, pingDatabase, toNumeric } from "./db/mysql.ts";

dotenv.config({ path: ".env.local", override: false });
dotenv.config({ override: false });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function normalizeBasePath(input: string | undefined): string {
  const raw = (input || "/employeelogin").trim();
  if (!raw || raw === "/") {
    return "/employeelogin";
  }
  return `/${raw.replace(/^\/+|\/+$/g, "")}`;
}

const BASE_PATH = normalizeBasePath(process.env.CRM_BASE_PATH);
const API_BASE = `${BASE_PATH}/api`;
const WS_PATH = `${BASE_PATH}/ws`;
const API_PATHS = Array.from(new Set([API_BASE, "/api"]));
const WS_PATHS = Array.from(new Set([WS_PATH, "/ws"]));
const PORT = Number(process.env.PORT || "3000");
const NODE_ENV = process.env.NODE_ENV || "development";
const ALLOW_SIGNUP = process.env.ALLOW_SIGNUP === "true";
const JWT_SECRET = process.env.JWT_SECRET || "";
const EFFECTIVE_JWT_SECRET = JWT_SECRET || "dev-only-change-me";
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || "12");

if (NODE_ENV === "production" && !JWT_SECRET) {
  throw new Error("JWT_SECRET is required in production.");
}

type AuthTokenPayload = {
  id: number;
  name: string;
  email: string;
  role: string;
};

type AuthedRequest = Request & {
  user?: AuthTokenPayload;
};

type JoinInfo = {
  userId: number;
  role: string;
  name: string;
  email: string;
  roomId: string;
};

function isAdminRole(role: string | null | undefined): boolean {
  return String(role || "").trim().toLowerCase().includes("admin");
}

type UserRow = {
  id: number;
  name: string;
  email: string;
  password: string;
  role: string;
};

type UserSafeRow = {
  id: number;
  name: string;
  email: string;
  role: string;
};

const upload = multer({ storage: multer.memoryStorage() });

type ImportedLeadRow = {
  name: string;
  email: string;
  phone: string;
};

const XLSX_NAME_HEADERS = new Set([
  "name",
  "business",
  "businessname",
  "company",
  "companyname",
  "contactname",
  "business_name",
]);

const XLSX_EMAIL_HEADERS = new Set([
  "email",
  "emails",
  "emailaddress",
  "primaryemail",
  "contactemail",
]);

const XLSX_PHONE_HEADERS = new Set([
  "phone",
  "phones",
  "phonenumber",
  "primaryphone",
  "contactphone",
  "mobile",
  "telephone",
]);

const XLSX_LEADISH_HEADERS = new Set([
  ...XLSX_NAME_HEADERS,
  ...XLSX_EMAIL_HEADERS,
  ...XLSX_PHONE_HEADERS,
  "address",
  "website",
  "url",
  "rating",
  "platform",
  "score",
]);

const PDF_NOISE_PREFIXES = [
  "lead report",
  "verified leads report",
  "bamlead intelligence report",
  "lead summary",
  "generated:",
  "total leads:",
  "valid emails:",
  "avg lead score:",
  "page ",
  "status:",
  "platform:",
  "mobile score:",
  "issues:",
  "needs upgrade",
  "good website",
  "business name",
  "business phone email score",
  "phone email score",
];

function normalizeHeader(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeCellValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeCellValue(item)).filter(Boolean).join("; ");
  }
  return String(value).trim();
}

function pickFirstEmail(value: string): string {
  const matches = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  return matches?.[0]?.trim() || "";
}

function pickFirstPhone(value: string): string {
  const matches = value.match(/(?:\+?\d[\d().\-\s]{6,}\d)/g);
  return matches?.[0]?.replace(/\s+/g, " ").trim() || "";
}

function sanitizeLeadName(value: string): string {
  return value
    .replace(/^\d+\.\s*/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function hasMeaningfulLeadData(lead: ImportedLeadRow): boolean {
  return lead.name !== "" || lead.email !== "" || lead.phone !== "";
}

function isLikelyNoiseLine(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return PDF_NOISE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function extractLeadFromRecord(record: Record<string, unknown>): ImportedLeadRow | null {
  let name = "";
  let email = "";
  let phone = "";

  for (const [rawKey, rawValue] of Object.entries(record)) {
    const key = normalizeHeader(rawKey);
    const value = normalizeCellValue(rawValue);
    if (!value) {
      continue;
    }

    if (!name && XLSX_NAME_HEADERS.has(key)) {
      name = sanitizeLeadName(value);
      continue;
    }

    if (!email && XLSX_EMAIL_HEADERS.has(key)) {
      email = pickFirstEmail(value);
      continue;
    }

    if (!phone && XLSX_PHONE_HEADERS.has(key)) {
      phone = pickFirstPhone(value);
    }
  }

  if (!email) {
    for (const rawValue of Object.values(record)) {
      email = pickFirstEmail(normalizeCellValue(rawValue));
      if (email) {
        break;
      }
    }
  }

  if (!phone) {
    for (const rawValue of Object.values(record)) {
      phone = pickFirstPhone(normalizeCellValue(rawValue));
      if (phone) {
        break;
      }
    }
  }

  if (!name) {
    const fallbackKeys = ["website", "url"];
    for (const [rawKey, rawValue] of Object.entries(record)) {
      const key = normalizeHeader(rawKey);
      if (!fallbackKeys.includes(key)) {
        continue;
      }
      const value = normalizeCellValue(rawValue);
      if (value) {
        name = value.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim();
        if (name) {
          break;
        }
      }
    }
  }

  const lead = {
    name,
    email,
    phone,
  };

  if (!hasMeaningfulLeadData(lead)) {
    return null;
  }

  if (normalizeHeader(name) === "field" || normalizeHeader(name) === "value") {
    return null;
  }

  return lead;
}

function extractLeadsFromWorkbook(buffer: Buffer): ImportedLeadRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const leads: ImportedLeadRow[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: "",
      raw: false,
    });

    let headerRowIndex = -1;
    let headerValues: string[] = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index] || [];
      const normalized = row.map((cell) => normalizeHeader(cell)).filter(Boolean);
      const score = normalized.filter((value) => XLSX_LEADISH_HEADERS.has(value)).length;
      if (score >= 2 || (score >= 1 && normalized.some((value) => XLSX_NAME_HEADERS.has(value)))) {
        headerRowIndex = index;
        headerValues = normalized;
        break;
      }
    }

    if (headerRowIndex < 0 || headerValues.length === 0) {
      continue;
    }

    for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] || [];
      const record: Record<string, unknown> = {};
      let hasNonEmptyCell = false;

      headerValues.forEach((header, cellIndex) => {
        if (!header) {
          return;
        }
        const value = normalizeCellValue(row[cellIndex]);
        if (value) {
          hasNonEmptyCell = true;
        }
        record[header] = value;
      });

      if (!hasNonEmptyCell) {
        continue;
      }

      const lead = extractLeadFromRecord(record);
      if (lead) {
        leads.push(lead);
      }
    }
  }

  return leads;
}

function parsePdfTableRow(line: string): ImportedLeadRow | null {
  const email = pickFirstEmail(line);
  const phone = pickFirstPhone(line);
  if (!email && !phone) {
    return null;
  }

  let name = line;
  const cutoffCandidates = [email, phone].filter(Boolean);
  for (const candidate of cutoffCandidates) {
    const candidateIndex = name.indexOf(candidate);
    if (candidateIndex > 0) {
      name = name.slice(0, candidateIndex);
      break;
    }
  }

  name = sanitizeLeadName(name)
    .replace(/[|•]+/g, " ")
    .trim();

  if (!name || isLikelyNoiseLine(name)) {
    return null;
  }

  return {
    name,
    email,
    phone,
  };
}

function extractLeadsFromPdfText(text: string): ImportedLeadRow[] {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const leads: ImportedLeadRow[] = [];
  let currentLead: ImportedLeadRow | null = null;

  const flushCurrentLead = () => {
    if (currentLead && hasMeaningfulLeadData(currentLead)) {
      currentLead.name = sanitizeLeadName(currentLead.name);
      if (currentLead.name || currentLead.email || currentLead.phone) {
        leads.push(currentLead);
      }
    }
    currentLead = null;
  };

  for (const line of lines) {
    if (isLikelyNoiseLine(line)) {
      continue;
    }

    const numberedLeadMatch = line.match(/^\d+\.\s+(.+)/);
    if (numberedLeadMatch) {
      flushCurrentLead();
      currentLead = {
        name: sanitizeLeadName(numberedLeadMatch[1] || ""),
        email: "",
        phone: "",
      };
      continue;
    }

    if (/^email\s*:/i.test(line)) {
      const email = pickFirstEmail(line);
      if (!currentLead) {
        currentLead = { name: "", email: "", phone: "" };
      }
      currentLead.email = email;
      continue;
    }

    if (/^phone\s*:/i.test(line)) {
      const phone = pickFirstPhone(line);
      if (!currentLead) {
        currentLead = { name: "", email: "", phone: "" };
      }
      currentLead.phone = phone;
      continue;
    }

    if (/^(website|address)\s*:/i.test(line)) {
      continue;
    }

    const inlineLead = parsePdfTableRow(line);
    if (inlineLead) {
      flushCurrentLead();
      leads.push(inlineLead);
      continue;
    }
  }

  flushCurrentLead();
  return leads;
}

function dedupeImportedLeads(leads: ImportedLeadRow[]): ImportedLeadRow[] {
  const seen = new Set<string>();
  const unique: ImportedLeadRow[] = [];

  for (const lead of leads) {
    const normalizedLead = {
      name: sanitizeLeadName(lead.name || ""),
      email: pickFirstEmail(lead.email || ""),
      phone: pickFirstPhone(lead.phone || ""),
    };

    if (!hasMeaningfulLeadData(normalizedLead)) {
      continue;
    }

    const key = [
      normalizeHeader(normalizedLead.name),
      normalizedLead.email.toLowerCase(),
      normalizedLead.phone.replace(/\D+/g, ""),
    ].join("|");

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(normalizedLead);
  }

  return unique;
}

function toSafeUser(user: UserSafeRow): AuthTokenPayload {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role || "agent",
  };
}

function getBearerToken(req: Request): string | null {
  const header = req.header("authorization");
  if (!header) {
    return null;
  }
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }
  return token;
}

function verifyToken(token: string): AuthTokenPayload | null {
  try {
    const payload = jwt.verify(token, EFFECTIVE_JWT_SECRET) as AuthTokenPayload;
    return payload;
  } catch {
    return null;
  }
}

function createToken(user: AuthTokenPayload): string {
  return jwt.sign(user, EFFECTIVE_JWT_SECRET, { expiresIn: "12h" });
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing auth token" });
    return;
  }

  const user = verifyToken(token);
  if (!user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  req.user = user;
  next();
}

function asyncHandler<TReq extends Request = Request>(
  fn: (req: TReq, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as TReq, res, next)).catch(next);
  };
}

async function seedInitialData(): Promise<void> {
  const contactCountRow = await db("contacts").count<{ count: unknown }>({ count: "*" }).first();
  const contactCount = toNumeric(contactCountRow?.count);

  if (contactCount === 0) {
    await db("contacts").insert({ name: "Test Contact", email: "test@example.com", status: "active" });
    await db("projects").insert([
      { name: "Sthillstudios.com", description: "SthillStudios.com project", status: "active" },
      { name: "Bamead.com", description: "Bamead.com project", status: "active" },
    ]);
    await db("employees").insert({
      name: "Adrian St.Hill",
      email: "adrian@sthillstudios.com",
      role: "CEO/Admin",
      contact_info: "+1234567890",
    });
  }

  const userCountRow = await db("users").count<{ count: unknown }>({ count: "*" }).first();
  const userCount = toNumeric(userCountRow?.count);
  if (userCount > 0) {
    return;
  }

  const adminName = process.env.CRM_ADMIN_NAME;
  const adminEmail = process.env.CRM_ADMIN_EMAIL;
  const adminPassword = process.env.CRM_ADMIN_PASSWORD;

  if (!adminName || !adminEmail || !adminPassword) {
    console.warn("No initial admin user seeded. Set CRM_ADMIN_NAME, CRM_ADMIN_EMAIL, and CRM_ADMIN_PASSWORD.");
    return;
  }

  const hashedPassword = await bcrypt.hash(adminPassword, BCRYPT_ROUNDS);
  await db("users").insert({
    name: adminName,
    email: adminEmail.trim().toLowerCase(),
    password: hashedPassword,
    role: "admin",
  });
  console.log("Seeded initial CRM admin user from environment variables.");
}

async function startServer() {
  await pingDatabase();
  await seedInitialData();

  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Map<WebSocket, JoinInfo>();

  app.use(express.json({ limit: "2mb" }));

  server.on("upgrade", (request, socket, head) => {
    const host = request.headers.host || "localhost";
    let requestUrl: URL;
    try {
      requestUrl = new URL(request.url || "", `http://${host}`);
    } catch {
      socket.destroy();
      return;
    }

    if (!WS_PATHS.includes(requestUrl.pathname)) {
      return;
    }

    const token = requestUrl.searchParams.get("token");
    if (!token) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    const user = verifyToken(token);
    if (!user) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      const authedWs = ws as WebSocket & { authUser?: AuthTokenPayload };
      authedWs.authUser = user;
      wss.emit("connection", authedWs, request);
    });
  });

  function broadcastToRoom(roomId: string, message: Record<string, unknown>) {
    const data = JSON.stringify(message);
    wss.clients.forEach((socket) => {
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }
      const info = clients.get(socket);
      if (info && info.roomId === roomId) {
        socket.send(data);
      }
    });
  }

  function broadcastPresence(roomId: string) {
    const presentUsers = Array.from(clients.values())
      .filter((client) => client.roomId === roomId)
      .map((client) => client.name);

    broadcastToRoom(roomId, { type: "presence", users: presentUsers });
  }

  wss.on("connection", (socket) => {
    const ws = socket as WebSocket & { authUser?: AuthTokenPayload };
    const authUser = ws.authUser;
    if (!authUser) {
      ws.close();
      return;
    }

    ws.on("message", (data) => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (message.type === "join") {
        const roomId = typeof message.roomId === "string" && message.roomId ? message.roomId : "default-room";
        const displayName =
          typeof message.name === "string" && message.name.trim().length > 0 ? message.name.trim() : authUser.name;

        clients.set(ws, {
          userId: authUser.id,
          role: authUser.role,
          name: displayName,
          email: authUser.email,
          roomId,
        });
        broadcastPresence(roomId);
        return;
      }

      if (message.type === "chat") {
        const sender = clients.get(ws);
        const text = typeof message.text === "string" ? message.text.trim() : "";
        if (!sender || !text) {
          return;
        }

        broadcastToRoom(sender.roomId, {
          type: "chat",
          name: sender.name,
          text,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (message.type === "help-request") {
        const sender = clients.get(ws);
        if (!sender) {
          return;
        }

        if (isAdminRole(sender.role)) {
          return;
        }

        const payload = JSON.stringify({
          type: "help-alert",
          agentName: sender.name,
          agentEmail: authUser.email,
          page: typeof message.page === "string" && message.page.trim() ? message.page.trim() : sender.roomId,
          timestamp: new Date().toISOString(),
        });

        wss.clients.forEach((clientSocket) => {
          if (clientSocket.readyState !== WebSocket.OPEN) {
            return;
          }
          const recipient = clients.get(clientSocket);
          if (recipient && isAdminRole(recipient.role)) {
            clientSocket.send(payload);
          }
        });
        return;
      }

      if (message.type === "meeting-invite") {
        const sender = clients.get(ws);
        if (!sender) {
          return;
        }

        const attendees = Array.isArray(message.attendees)
          ? message.attendees
              .map((value) => (typeof value === "string" ? value.trim().toLowerCase() : ""))
              .filter((value) => value.length > 0)
          : [];

        if (attendees.length === 0) {
          return;
        }

        const payload = JSON.stringify({
          type: "meeting-invite-alert",
          meetingId: typeof message.meetingId === "number" || typeof message.meetingId === "string" ? message.meetingId : null,
          title: typeof message.title === "string" ? message.title : "Meeting invite",
          meetingType: typeof message.meetingType === "string" ? message.meetingType : "video",
          roomName: typeof message.roomName === "string" ? message.roomName : "SthillStudiosMain",
          status: typeof message.status === "string" ? message.status : "scheduled",
          scheduledDate: typeof message.scheduledDate === "string" ? message.scheduledDate : "",
          scheduledTime: typeof message.scheduledTime === "string" ? message.scheduledTime : "",
          senderName: sender.name,
          attendees,
          timestamp: new Date().toISOString(),
        });

        wss.clients.forEach((clientSocket) => {
          if (clientSocket.readyState !== WebSocket.OPEN) {
            return;
          }
          const recipient = clients.get(clientSocket);
          if (!recipient) {
            return;
          }

          const recipientEmail = recipient.email.trim().toLowerCase();
          if (!recipientEmail || !attendees.includes(recipientEmail)) {
            return;
          }

          clientSocket.send(payload);
        });
      }
    });

    ws.on("close", () => {
      const sender = clients.get(ws);
      if (!sender) {
        return;
      }
      clients.delete(ws);
      broadcastPresence(sender.roomId);
    });
  });

  const authRouter = express.Router();

  authRouter.post(
    "/signup",
    asyncHandler(async (req, res) => {
      if (!ALLOW_SIGNUP) {
        res.status(403).json({ error: "Signup is disabled" });
        return;
      }

      const { name, email, password } = req.body as { name?: string; email?: string; password?: string };
      if (!name || !email || !password) {
        res.status(400).json({ error: "Name, email, and password are required" });
        return;
      }

      try {
        const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const insertedIds = await db("users").insert({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password: hashedPassword,
          role: "agent",
        });
        const insertedId = toNumeric(insertedIds[0]);

        const user = (await db("users")
          .select("id", "name", "email", "role")
          .where({ id: insertedId })
          .first()) as UserSafeRow | undefined;

        if (!user) {
          res.status(500).json({ error: "Failed to create user" });
          return;
        }

        const safeUser = toSafeUser(user);
        const token = createToken(safeUser);
        res.json({ token, user: safeUser });
      } catch (error) {
        if (isMysqlDuplicateError(error)) {
          res.status(400).json({ error: "Email already exists" });
          return;
        }
        throw error;
      }
    }),
  );

  authRouter.post(
    "/login",
    asyncHandler(async (req, res) => {
      const { email, password } = req.body as { email?: string; password?: string };
      if (!email || !password) {
        res.status(400).json({ error: "Email and password are required" });
        return;
      }

      const user = (await db("users")
        .select("id", "name", "email", "password", "role")
        .where({ email: email.trim().toLowerCase() })
        .first()) as UserRow | undefined;

      if (!user) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      const usesHash = typeof user.password === "string" && user.password.startsWith("$2");
      const isMatch = usesHash ? await bcrypt.compare(password, user.password) : password === user.password;

      if (!isMatch) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      if (!usesHash) {
        const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
        await db("users").where({ id: user.id }).update({ password: hashedPassword });
      }

      const safeUser = toSafeUser({ id: user.id, name: user.name, email: user.email, role: user.role });
      const token = createToken(safeUser);
      res.json({ token, user: safeUser });
    }),
  );

  const apiRouter = express.Router();
  apiRouter.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  apiRouter.use("/auth", authRouter);
  apiRouter.use(requireAuth);

  apiRouter.get(
    "/contacts",
    asyncHandler(async (_req, res) => {
      const contacts = await db("contacts").select("*");
      res.json(contacts);
    }),
  );

  apiRouter.get(
    "/projects",
    asyncHandler(async (_req, res) => {
      const projects = await db("projects").select("*").orderBy("id", "desc");
      res.json(projects);
    }),
  );

  apiRouter.delete(
    "/projects/:id",
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: "Invalid project id" });
        return;
      }

      const affectedRows = await db("projects").where({ id }).del();
      if (affectedRows === 0) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      res.json({ success: true });
    }),
  );

  apiRouter.get(
    "/employees",
    asyncHandler(async (_req, res) => {
      const employees = await db("employees").select("*").orderBy("id", "desc");
      res.json(employees);
    }),
  );

  apiRouter.post(
    "/employees",
    asyncHandler(async (req, res) => {
      const { name, email, role, contact_info } = req.body;
      if (!name) {
        res.status(400).json({ error: "Employee name is required" });
        return;
      }

      const insertedIds = await db("employees").insert({
        name,
        email: email || "",
        role: role || "",
        contact_info: contact_info || "",
      });

      res.json({ id: toNumeric(insertedIds[0]) });
    }),
  );

  apiRouter.put(
    "/employees/:id",
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: "Invalid employee id" });
        return;
      }

      const body = req.body as Record<string, unknown>;
      const payload: Record<string, unknown> = {};

      if (Object.prototype.hasOwnProperty.call(body, "full_name")) {
        payload.name = String(body.full_name ?? "").trim();
      } else if (Object.prototype.hasOwnProperty.call(body, "name")) {
        payload.name = String(body.name ?? "").trim();
      }

      if (Object.prototype.hasOwnProperty.call(body, "email")) {
        payload.email = String(body.email ?? "").trim();
      }
      if (Object.prototype.hasOwnProperty.call(body, "role")) {
        payload.role = String(body.role ?? "").trim();
      }
      if (Object.prototype.hasOwnProperty.call(body, "phone")) {
        payload.contact_info = String(body.phone ?? "").trim();
      } else if (Object.prototype.hasOwnProperty.call(body, "contact_info")) {
        payload.contact_info = String(body.contact_info ?? "").trim();
      }
      if (Object.prototype.hasOwnProperty.call(body, "hourly_rate")) {
        const raw = body.hourly_rate;
        payload.hourly_rate = raw === "" || raw === null ? null : Number(raw);
      }
      if (Object.prototype.hasOwnProperty.call(body, "hire_date")) {
        const raw = String(body.hire_date ?? "").trim();
        payload.hire_date = raw === "" ? null : raw;
      }
      if (Object.prototype.hasOwnProperty.call(body, "status")) {
        const raw = String(body.status ?? "").trim();
        payload.status = raw || "active";
      }

      if (Object.keys(payload).length === 0) {
        res.status(400).json({ error: "No updatable fields provided" });
        return;
      }

      const affectedRows = await db("employees").where({ id }).update(payload);
      if (affectedRows === 0) {
        const existing = await db("employees").where({ id }).first();
        if (!existing) {
          res.status(404).json({ error: "Employee not found" });
          return;
        }
      }

      res.json({ success: true });
    }),
  );

  apiRouter.get(
    "/calls",
    asyncHandler<AuthedRequest>(async (req, res) => {
      const role = (req.user?.role || "agent").toLowerCase();
      const canViewAllCalls = role === "admin" || role === "manager";

      const query = db("calls").select("*").orderBy("timestamp", "desc");
      if (!canViewAllCalls) {
        query.where({ created_by_user_id: req.user?.id || 0 });
      }

      const calls = await query;
      res.json(calls);
    }),
  );

  apiRouter.get(
    "/calls/metrics",
    asyncHandler<AuthedRequest>(async (req, res) => {
      const role = (req.user?.role || "agent").toLowerCase();
      const canViewAllCalls = role === "admin" || role === "manager";

      const metricsQuery = db("calls")
        .count<{ totalCalls: unknown }>({ totalCalls: "*" })
        .avg<{ avgDuration: unknown }>({ avgDuration: "duration" });

      if (!canViewAllCalls) {
        metricsQuery.where({ created_by_user_id: req.user?.id || 0 });
      }

      const metrics = (await metricsQuery.first()) as { totalCalls?: unknown; avgDuration?: unknown } | undefined;

      res.json({
        totalCalls: toNumeric(metrics?.totalCalls),
        avgDuration: toNumeric(metrics?.avgDuration),
      });
    }),
  );

  apiRouter.post(
    "/calls",
    asyncHandler<AuthedRequest>(async (req, res) => {
      const { contact_name, phone_number, duration, status } = req.body;
      const insertedIds = await db("calls").insert({
        contact_name: contact_name || "",
        phone_number: phone_number || "",
        duration: Number(duration) || 0,
        status: status || "completed",
        created_by_user_id: req.user?.id || null,
      });
      res.json({ id: toNumeric(insertedIds[0]) });
    }),
  );

  apiRouter.get(
    "/leads",
    asyncHandler(async (_req, res) => {
      const leads = await db("leads").select("*").orderBy("timestamp", "desc");
      res.json(leads);
    }),
  );

  apiRouter.post(
    "/leads",
    asyncHandler<AuthedRequest>(async (req, res) => {
      const body = req.body as Record<string, unknown>;
      const name = String(body.name ?? "").trim();
      if (!name) {
        res.status(400).json({ error: "Lead name is required" });
        return;
      }

      const insertedIds = await db("leads").insert({
        name,
        email: String(body.email ?? "").trim(),
        phone: String(body.phone ?? "").trim(),
        source: String(body.source ?? "manual").trim() || "manual",
        created_by_user_id: req.user?.id || null,
      });

      res.json({ id: toNumeric(insertedIds[0]) });
    }),
  );

  apiRouter.put(
    "/leads/:id",
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: "Invalid lead id" });
        return;
      }

      const body = req.body as Record<string, unknown>;
      const payload: Record<string, unknown> = {};
      if (Object.prototype.hasOwnProperty.call(body, "name")) {
        payload.name = String(body.name ?? "").trim();
      }
      if (Object.prototype.hasOwnProperty.call(body, "email")) {
        payload.email = String(body.email ?? "").trim();
      }
      if (Object.prototype.hasOwnProperty.call(body, "phone")) {
        payload.phone = String(body.phone ?? "").trim();
      }
      if (Object.prototype.hasOwnProperty.call(body, "source")) {
        payload.source = String(body.source ?? "manual").trim() || "manual";
      }

      if (Object.keys(payload).length === 0) {
        res.status(400).json({ error: "No updatable fields provided" });
        return;
      }

      const affectedRows = await db("leads").where({ id }).update(payload);
      if (affectedRows === 0) {
        const existing = await db("leads").where({ id }).first();
        if (!existing) {
          res.status(404).json({ error: "Lead not found" });
          return;
        }
      }

      res.json({ success: true });
    }),
  );

  apiRouter.delete(
    "/leads/:id",
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: "Invalid lead id" });
        return;
      }

      const affectedRows = await db("leads").where({ id }).del();
      if (affectedRows === 0) {
        res.status(404).json({ error: "Lead not found" });
        return;
      }
      res.json({ success: true });
    }),
  );

  apiRouter.post(
    "/leads/upload",
    upload.single("file"),
    asyncHandler<AuthedRequest & { file?: { originalname: string; buffer: Buffer } }>(async (req, res) => {
      if (!isAdminRole(req.user?.role)) {
        res.status(403).json({ error: "Only administrators can import leads" });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      const fileName = req.file.originalname;
      const extension = path.extname(fileName).toLowerCase();
      let leadsData: ImportedLeadRow[] = [];

      if (extension === ".xlsx" || extension === ".xls") {
        leadsData = extractLeadsFromWorkbook(req.file.buffer);
      } else if (extension === ".pdf") {
        const data = await (pdf as unknown as (buffer: Buffer) => Promise<{ text: string }>)(req.file.buffer);
        leadsData = extractLeadsFromPdfText(data.text);
      } else {
        res.status(400).json({ error: "Unsupported file type. Upload a BamLead Excel or PDF file." });
        return;
      }

      const uniqueLeads = dedupeImportedLeads(leadsData);
      if (uniqueLeads.length === 0) {
        res.status(400).json({ error: "No leads were detected in this file. Use a BamLead Excel or PDF export." });
        return;
      }

      await db.transaction(async (trx) => {
        const rows = uniqueLeads.map((lead) => ({
          name: lead.name || "Unknown",
          email: lead.email || "",
          phone: lead.phone || "",
          source: fileName,
          created_by_user_id: req.user?.id || null,
        }));

        if (rows.length > 0) {
          await trx("leads").insert(rows);
        }
      });

      res.json({ success: true, count: uniqueLeads.length });
    }),
  );

  API_PATHS.forEach((apiPath) => {
    app.use(apiPath, apiRouter);
  });

  // Some hosting proxies strip one or more path segments before forwarding.
  // This fallback keeps API routes working if requests arrive as /auth, /contacts, etc.
  const unprefixedApiPrefixes = ["/health", "/auth", "/contacts", "/projects", "/employees", "/calls", "/leads"];
  app.use((req, res, next) => {
    const matched = unprefixedApiPrefixes.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`));
    if (!matched) {
      next();
      return;
    }
    apiRouter(req, res, next);
  });

  if (NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });

    app.get(BASE_PATH, (req, res, next) => {
      req.url = "/";
      vite.middlewares(req, res, next);
    });

    app.use(BASE_PATH, vite.middlewares);
  } else {
    const distDir = path.join(__dirname, "dist");
    app.use(BASE_PATH, express.static(distDir, { index: false, redirect: false }));

    app.get(BASE_PATH, async (_req, res) => {
      const indexPath = path.join(distDir, "index.html");
      const html = await fs.readFile(indexPath, "utf8");
      res.setHeader("Content-Type", "text/html");
      res.send(html);
    });

    app.get(`${BASE_PATH}/*`, async (_req, res) => {
      const indexPath = path.join(distDir, "index.html");
      const html = await fs.readFile(indexPath, "utf8");
      res.setHeader("Content-Type", "text/html");
      res.send(html);
    });
  }

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Unhandled server error:", error);
    if (res.headersSent) {
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`CRM server running on http://localhost:${PORT}${BASE_PATH}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start CRM server:", error);
  process.exit(1);
});
