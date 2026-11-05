import { requireAuth } from "../middleware/auth.js";
import { Folder, Document } from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { route, notFound, forbidden } from "../utils/apiError.js";
import { canAccessDocument } from "./documents.js";
import { getUserRoles } from "../db.js";
import { hasPermission } from "../permissions/catalog.js";

const PRIVILEGED = ["super_admin", "dean", "registrar", "college_admin"];

function canManageFolders(user) {
  const roles = getUserRoles(user);
  return (
    roles.some((role) => PRIVILEGED.includes(role)) ||
    hasPermission(roles, "documents.manage")
  );
}

function folderFilter(user, folderId) {
  const filter = { _id: folderId };
  if (!canManageFolders(user)) filter.owner = user._id || user.id;
  return filter;
}

export function registerFolderRoutes(app) {
  app.get("/api/folders", requireAuth, asyncHandler(async (req, res) => {
    const parent = req.query.parent || null;
    const filter = {
      parent: parent === "null" ? null : parent,
      archived: false,
    };
    if (!canManageFolders(req.user)) filter.owner = req.user._id || req.user.id;
    const folders = await Folder.find(filter).sort({ name: 1 }).lean();
    res.json({ folders });
  }));
  app.post("/api/folders", requireAuth, asyncHandler(async (req, res) => {
    const { name, parent } = req.body || {};
    if (!name) return res.status(400).json({ error: "name required" });
    if (parent) {
      const parentFolder = await Folder.findOne(folderFilter(req.user, parent)).lean();
      if (!parentFolder || parentFolder.archived) throw notFound("Parent folder not found.");
    }
    const folder = await Folder.create({ name, parent: parent || null, owner: req.user._id || req.user.id });
    res.json({ folder });
  }));
  app.patch("/api/folders/:id", requireAuth, asyncHandler(async (req, res) => {
    const folder = await Folder.findOne(folderFilter(req.user, req.params.id));
    if (!folder) throw notFound("Folder not found.");
    if (req.body?.name) folder.name = req.body.name;
    await folder.save();
    res.json({ folder });
  }));
  app.delete("/api/folders/:id", requireAuth, asyncHandler(async (req, res) => {
    const folder = await Folder.findOne(folderFilter(req.user, req.params.id));
    if (!folder) throw notFound("Folder not found.");
    folder.archived = true;
    await folder.save();
    res.json({ ok: true });
  }));
  app.get("/api/folders/:id/documents", requireAuth, asyncHandler(async (req, res) => {
    const folder = await Folder.findOne(folderFilter(req.user, req.params.id)).lean();
    if (!folder) throw notFound("Folder not found.");
    const docs = await Document.find({ folder: req.params.id, archived: false })
      .populate("user", "firstName lastName email")
      .populate("sharedWith.user", "firstName lastName email roles")
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    const visible = [];
    for (const d of docs) {
      if (await canAccessDocument(req, d, "view")) visible.push(d);
    }
    res.json({ documents: visible, folder });
  }));
}