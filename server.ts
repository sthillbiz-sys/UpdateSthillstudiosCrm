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
  roomId: string;
};

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

        const payload = JSON.stringify({
          type: "help-alert",
          agentName: sender.name,
          timestamp: new Date().toISOString(),
        });

        wss.clients.forEach((clientSocket) => {
          if (clientSocket.readyState !== WebSocket.OPEN) {
            return;
          }
          const recipient = clients.get(clientSocket);
          if (recipient && (recipient.role === "admin" || recipient.role === "manager")) {
            clientSocket.send(payload);
          }
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
    "/leads/upload",
    upload.single("file"),
    asyncHandler<Request & { file?: { originalname: string; buffer: Buffer } }>(async (req, res) => {
      if (!req.file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      const fileName = req.file.originalname;
      const extension = path.extname(fileName).toLowerCase();
      let leadsData: Record<string, string>[] = [];

      if (extension === ".xlsx" || extension === ".xls") {
        const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        leadsData = XLSX.utils.sheet_to_json(sheet) as Record<string, string>[];
      } else if (extension === ".pdf") {
        const data = await (pdf as unknown as (buffer: Buffer) => Promise<{ text: string }>)(req.file.buffer);
        const lines = data.text.split("\n").filter((line) => line.trim());
        leadsData = lines.map((line) => {
          const parts = line.split(/\s+/);
          return {
            name: parts[0] || "Unknown",
            email: parts[1] || "",
            phone: parts[2] || "",
          };
        });
      } else {
        res.status(400).json({ error: "Unsupported file type" });
        return;
      }

      await db.transaction(async (trx) => {
        const rows = leadsData.map((lead) => ({
          name: lead.name || "Unknown",
          email: lead.email || "",
          phone: lead.phone || "",
          source: fileName,
        }));

        if (rows.length > 0) {
          await trx("leads").insert(rows);
        }
      });

      res.json({ success: true, count: leadsData.length });
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
