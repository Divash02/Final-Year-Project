import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { getUserRoles, logAudit } from "../db.js";
import { User, Student, Staff } from "../models/index.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { normalizeRoles } from "../permissions/catalog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(__dirname, "../../uploads/avatars");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const filename = `avatar-${req.user._id || req.user.id}-${Date.now()}${ext}`;
    cb(null, filename);
  },
});

const ALLOWED_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

/** Rejection raised by the multer filter so the route can map it to 422. */
class UploadRejectedError extends Error {
  constructor(message) {
    super(message);
    this.name = "UploadRejectedError";
    this.isUploadRejection = true;
  }
}

const upload = multer({
  storage,
  limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_AVATAR_TYPES.has(String(file.mimetype).toLowerCase())) {
      cb(null, true);
      return;
    }
    cb(
      new UploadRejectedError(
        "Only JPG, PNG and WebP images can be used as a profile photo.",
      ),
    );
  },
});

/** Avatar dimensions that still read clearly as an identity photograph. */
const MIN_AVATAR_EDGE = 120;
const MIN_AVATAR_ASPECT = 0.6;
const MAX_AVATAR_ASPECT = 1.6;

/**
 * Authoritative server-side image validation.
 *
 * The declared MIME type is not trusted: the file's magic bytes must identify
 * it as JPEG, PNG or WebP before any dimension rules are applied. Dimension and
 * framing checks steer uploads towards a usable portrait crop.
 *
 * Scope note: this establishes that the upload is a real image of portrait
 * proportions. It is not, and does not claim to be, identity verification — it
 * cannot establish that the person in the photo is the account holder.
 */
function validateAvatarImage(buffer) {
  if (!buffer || buffer.length < 1024) {
    return { valid: false, error: "Image file is empty or corrupted." };
  }
  if (buffer.length > MAX_AVATAR_BYTES) {
    return { valid: false, error: "Image file size exceeds the 5MB limit." };
  }

  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  const isWebp =
    buffer.subarray(0, 4).toString("latin1") === "RIFF" &&
    buffer.subarray(8, 12).toString("latin1") === "WEBP";

  if (!isJpeg && !isPng && !isWebp) {
    return {
      valid: false,
      error:
        "That file is not a valid JPG, PNG or WebP image. Documents, text files and executables are not accepted.",
    };
  }

  let width = 0;
  let height = 0;

  if (isPng && buffer.length >= 24) {
    width = buffer.readUInt32BE(16);
    height = buffer.readUInt32BE(20);
  } else if (isJpeg) {
    let offset = 2;
    while (offset < buffer.length - 8) {
      const marker = buffer[offset + 1];
      // SOF0/2/3/5/6/7/9/10/11/13/14/15 carry the frame dimensions.
      if (
        buffer[offset] === 0xff &&
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        height = buffer.readUInt16BE(offset + 5);
        width = buffer.readUInt16BE(offset + 7);
        break;
      }
      offset += 1;
    }
  }

  if (width > 0 && height > 0) {
    const aspectRatio = width / height;
    if (aspectRatio < MIN_AVATAR_ASPECT || aspectRatio > MAX_AVATAR_ASPECT) {
      return {
        valid: false,
        error:
          "Please upload a portrait-oriented photo (roughly square), not a document scan, banner or landscape image.",
      };
    }
    if (width < MIN_AVATAR_EDGE || height < MIN_AVATAR_EDGE) {
      return {
        valid: false,
        error: `Image resolution is too low for a profile photo. Minimum size is ${MIN_AVATAR_EDGE}x${MIN_AVATAR_EDGE} pixels.`,
      };
    }
  }

  return { valid: true, width, height };
}

/** Removes a previously stored avatar, ignoring anything outside the upload dir. */
function discardStoredAvatar(avatarUrl) {
  if (!avatarUrl || typeof avatarUrl !== "string") return;
  const filename = path.basename(avatarUrl);
  if (!filename.startsWith("avatar-")) return;
  const target = path.join(uploadDir, filename);
  // Defence in depth: never unlink outside the managed avatar directory.
  if (path.dirname(path.resolve(target)) !== path.resolve(uploadDir)) return;
  try {
    fs.unlinkSync(target);
  } catch {
    /* already removed */
  }
}

/** Runs the multer middleware and maps its errors to client-safe responses. */
function runAvatarUpload(req, res, handler) {
  upload.single("avatar")(req, res, (uploadError) => {
    if (!uploadError) {
      handler(null);
      return;
    }
    if (uploadError instanceof UploadRejectedError || uploadError.isUploadRejection) {
      res.status(422).json({ error: uploadError.message });
      return;
    }
    if (uploadError.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "Profile photos must be 5MB or smaller." });
      return;
    }
    res.status(400).json({ error: "The upload could not be processed." });
  });
}

/**
 * Authoritative role classification for the authenticated user.
 *
 * The role is read from the server-side `User.roles` array that the session
 * middleware attached to `req.user`. It is never taken from a request body
 * field, because a caller could otherwise claim to be a student and have their
 * upload mirrored into the Student collection.
 *
 * Returns `true` only when the stored role set actually contains `student`.
 * A user who holds both `student` and a staff role is still treated as a
 * student for the purposes of photo synchronisation: their own student record
 * is the one attendance reads.
 */
function isStudentUser(user) {
  const roles = normalizeRoles(user?.roles);
  return roles.includes("student");
}

/**
 * Builds the profile payload returned to the client.
 *
 * `avatar_url` resolves from `User.avatarUrl` first: the user record is the
 * single source of truth for a profile photo, and every module that shows the
 * person (directory, attendance, communication) reads it from there. The
 * `Student.avatarUrl` mirror is only consulted as a legacy fallback for records
 * written before the user-level field existed.
 */
async function buildProfilePayload(user) {
  const [student, staff] = await Promise.all([
    Student.findOne({ user: user._id }),
    Staff.findOne({ user: user._id }),
  ]);

  return {
    id: user._id.toString(),
    name: [user.firstName, user.middleName, user.lastName]
      .filter(Boolean)
      .join(" "),
    firstName: user.firstName,
    middleName: user.middleName,
    lastName: user.lastName,
    email: user.collegeEmail || user.email,
    phone: user.phone,
    personal_email: user.personalEmail,
    address: user.address,
    emergency_contact: user.emergencyContact,
    avatar_url: user.avatarUrl || student?.avatarUrl || null,
    account_status: user.accountStatus,
    roles: user.roles || ["student"],
    student_id: student?.studentId || null,
    program: student?.program || null,
    student_department: student?.department || null,
    batch: student?.batch || null,
    section: student?.section || null,
    semester: student?.semester ?? null,
    employee_id: staff?.employeeId || null,
    employee_department: staff?.department || null,
    designation: staff?.designation || null,
  };
}

export function registerProfileRoutes(app) {
  // Read the signed-in user's own profile.
  app.get("/api/profile/me", requireAuth, async (req, res) => {
    try {
      const user = await User.findById(req.user._id || req.user.id);
      if (!user) return res.status(404).json({ error: "User not found." });

      res.json({ profile: await buildProfilePayload(user) });
    } catch (err) {
      res.status(500).json({ error: "Failed to load profile." });
    }
  });

  // Self-service profile updates (Permitted fields only)
  // Requirement 33: Students must NOT be able to edit official institutional fields
  app.patch(
    "/api/profile/me",
    requireAuth,
    requirePermission("profile.update.self"),
    async (req, res) => {
      try {
        const body = req.body || {};
        const allowedFields = new Set([
          "phone",
          "personalEmail",
          "address",
          "emergencyContact",
        ]);

        const suppliedFields = Object.keys(body);
        if (suppliedFields.length === 0 || suppliedFields.some((f) => !allowedFields.has(f))) {
          return res.status(400).json({
            error: "Only phone, personal email, address, and emergency contact can be modified.",
          });
        }

        const user = await User.findById(req.user._id || req.user.id);
        if (!user) return res.status(404).json({ error: "User not found." });

        if ("phone" in body) user.phone = String(body.phone || "").trim() || null;
        if ("personalEmail" in body) {
          const email = String(body.personalEmail || "").trim().toLowerCase();
          if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: "Enter a valid personal email." });
          }
          user.personalEmail = email || null;
        }
        if ("address" in body) user.address = String(body.address || "").trim() || null;
        if ("emergencyContact" in body) user.emergencyContact = String(body.emergencyContact || "").trim() || null;

        await user.save();

        // Update student phone if exists
        await Student.updateOne(
          { user: user._id },
          { $set: { phone: user.phone } }
        );

        await logAudit({
          userId: user._id,
          action: "PROFILE_UPDATED",
          module: "profile",
          resource: "user",
          resourceId: user._id.toString(),
          details: "Self-service contact information updated.",
        });

        res.json({ profile: await buildProfilePayload(user) });
      } catch (err) {
        res.status(500).json({ error: "Failed to update profile." });
      }
    }
  );

  /**
   * Profile photo upload.
   *
   * The target account is always the authenticated user (`req.user`), so a
   * caller cannot attach a photo to somebody else's profile by supplying an
   * identifier.
   *
   * The authoritative copy of the photo lives on `User.avatarUrl`. The
   * `Student.avatarUrl` mirror is only written when the authenticated account
   * actually holds the `student` role, and only for the student record linked
   * to that user. A teacher, administrator or any other staff member updates
   * their own photo only — their write is never mirrored into the Student
   * collection, so student attendance displays are never touched by a
   * non-student upload.
   */
  app.post(
    "/api/profile/avatar",
    requireAuth,
    requirePermission("profile.update.self"),
    (req, res) => {
      runAvatarUpload(req, res, async (uploadError) => {
        if (uploadError) {
          res.status(500).json({ error: "The upload could not be processed." });
          return;
        }

        if (!req.file) {
          res.status(400).json({ error: "Please select an image file to upload." });
          return;
        }

        const filePath = req.file.path;
        let buffer;
        try {
          buffer = fs.readFileSync(filePath);
        } catch {
          res.status(400).json({ error: "The uploaded image could not be read." });
          return;
        }

        const validation = validateAvatarImage(buffer);
        if (!validation.valid) {
          discardStoredAvatar(filePath);
          res.status(422).json({
            error: validation.error || "That image cannot be used as a profile photo.",
          });
          return;
        }

        const user = await User.findById(req.user._id || req.user.id);
        if (!user) {
          discardStoredAvatar(filePath);
          res.status(404).json({ error: "User not found." });
          return;
        }

        const previousAvatar = user.avatarUrl;
        // Stored as an API-relative path so the value survives a host/port change.
        const avatarUrl = `/uploads/avatars/${path.basename(filePath)}`;

        const studentRole = isStudentUser(user);

        user.avatarUrl = avatarUrl;
        await user.save();

        /**
         * Student-only synchronisation.
         *
         * Attendance and the student directory read the photo from the user
         * record, falling back to `Student.avatarUrl` for legacy rows. When the
         * caller is a student, the mirror on their own student record is kept in
         * step so every reader agrees. When the caller is not a student, no
         * `Student` document is touched at all — not even one that happens to
         * share the user id, because non-student accounts never link to a
         * Student record in the first place.
         */
        if (studentRole) {
          await Student.updateOne(
            { user: user._id },
            { $set: { avatarUrl } },
          );
        }

        // The replaced file is only unlinked after the new one is committed.
        if (previousAvatar && previousAvatar !== avatarUrl) {
          discardStoredAvatar(previousAvatar);
        }

        await logAudit({
          userId: user._id,
          action: "PROFILE_AVATAR_UPDATED",
          module: "profile",
          resource: "user",
          resourceId: user._id.toString(),
          oldValue: { avatarUrl: previousAvatar || null },
          newValue: { avatarUrl },
          details: studentRole
            ? "Profile photo replaced. It is now used everywhere this student appears, including attendance."
            : "Profile photo replaced. It applies to this account only and does not affect any student attendance photo.",
          metadata: {
            width: validation.width,
            height: validation.height,
            role: studentRole ? "student" : "non-student",
          },
        });

        res.json({
          success: true,
          avatarUrl,
          message: studentRole
            ? "Profile photo saved. It now appears wherever this student is shown, including attendance."
            : "Profile photo saved. It is used for this account only and does not change any student attendance photo.",
        });
      });
    },
  );

/**
    * Remove the signed-in user's profile photo. Any file still referenced by
    * another account is never touched, because only `req.user` is in scope.
    *
    * The `Student.avatarUrl` mirror is only cleared when the caller actually
    * holds the student role, so a staff member removing their own photo can
    * never clear a student's attendance photo.
    */
  app.delete(
    "/api/profile/avatar",
    requireAuth,
    requirePermission("profile.update.self"),
    async (req, res) => {
      try {
        const user = await User.findById(req.user._id || req.user.id);
        if (!user) return res.status(404).json({ error: "User not found." });

        const previousAvatar = user.avatarUrl;
        const studentRole = isStudentUser(user);

        user.avatarUrl = null;
        await user.save();

        if (studentRole) {
          await Student.updateOne({ user: user._id }, { $set: { avatarUrl: null } });
        }

        if (previousAvatar) {
          discardStoredAvatar(previousAvatar);
        }

        await logAudit({
          userId: user._id,
          action: "PROFILE_AVATAR_REMOVED",
          module: "profile",
          resource: "user",
          resourceId: user._id.toString(),
          oldValue: { avatarUrl: previousAvatar || null },
          newValue: { avatarUrl: null },
          details: studentRole
            ? "Profile photo removed. It is no longer shown for this student, including attendance."
            : "Profile photo removed. It applied to this account only.",
        });

        res.json({ success: true, avatarUrl: null });
      } catch (err) {
        res.status(500).json({ error: "Failed to remove profile photo." });
      }
    },
  );
}
