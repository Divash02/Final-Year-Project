import { requireAuth } from "../middleware/authentication.js";
import {
  serveLinkedDocument,
  searchUsers,
  listDocuments,
  createDocument,
  getDocument,
  updateDocument,
  changeFolder,
  shareDocument,
  unshareDocument,
  createVersion,
  restoreVersion,
  listVersions,
  archiveDocument,
} from "../controllers/documentController.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export function registerDocumentRoutes(app) {
  app.get("/api/documents/linked/:type/:id", requireAuth, asyncHandler(serveLinkedDocument));

  app.get("/api/documents/users/search", requireAuth, asyncHandler(searchUsers));

  app.get("/api/documents", requireAuth, asyncHandler(listDocuments));

  app.post("/api/documents", requireAuth, createDocument);

  app.get("/api/documents/:id", requireAuth, asyncHandler(getDocument));

  app.patch("/api/documents/:id", requireAuth, asyncHandler(updateDocument));

  app.patch("/api/documents/:id/folder", requireAuth, asyncHandler(changeFolder));

  app.post("/api/documents/:id/share", requireAuth, asyncHandler(shareDocument));

  app.delete("/api/documents/:id/share/:userId", requireAuth, asyncHandler(unshareDocument));

  app.post("/api/documents/:id/versions", requireAuth, createVersion);

  app.post("/api/documents/:id/restore/:version", requireAuth, asyncHandler(restoreVersion));

  app.get("/api/documents/:id/versions", requireAuth, asyncHandler(listVersions));

  app.delete("/api/documents/:id", requireAuth, asyncHandler(archiveDocument));
}
