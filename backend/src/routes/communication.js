import {
  getUserByEmail,
  getUserById,
  logAudit,
} from "../db.js";
import { User, Student, Mail, Message, Notification } from "../models/index.js";
import { requireAuth } from "../middleware/auth.js";

export function registerCommunicationRoutes(app) {
  // 1. Recipient Recommendations / Search (Requirement 31)
  app.get("/api/mail/recipients/suggest", requireAuth, async (req, res) => {
    try {
      const query = String(req.query.q || "").trim().toLowerCase();
      if (!query || query.length < 2) {
        return res.json({ suggestions: [] });
      }

      const regex = new RegExp(query, "i");
      const [users, students] = await Promise.all([
        User.find({
          $or: [
            { email: regex },
            { collegeEmail: regex },
            { firstName: regex },
            { lastName: regex },
          ],
          isActive: true,
        }).limit(20),
        Student.find({
          $or: [
            { studentId: regex },
            { firstName: regex },
            { lastName: regex },
            { collegeEmail: regex },
          ],
        }).populate("user").limit(20),
      ]);

      const seenEmails = new Set();
      const suggestions = [];

      for (const st of students) {
        const email = st.collegeEmail || st.email || st.user?.email;
        if (!email || seenEmails.has(email)) continue;
        seenEmails.add(email);
        suggestions.push({
          id: st.user?._id?.toString() || st._id.toString(),
          name: `${st.firstName} ${st.lastName}`.trim(),
          email,
          role: "Student",
          section: st.section ? `Section ${st.section}` : "",
          program: st.program || "BCA",
          studentId: st.studentId,
        });
      }

      for (const u of users) {
        const email = u.collegeEmail || u.email;
        if (!email || seenEmails.has(email)) continue;
        seenEmails.add(email);
        const roleLabel = (u.roles?.[0] || "Staff").replace("_", " ").toUpperCase();
        suggestions.push({
          id: u._id.toString(),
          name: [u.firstName, u.middleName, u.lastName].filter(Boolean).join(" "),
          email,
          role: roleLabel,
          section: "",
          program: "",
        });
      }

      res.json({ suggestions: suggestions.slice(0, 10) });
    } catch (err) {
      console.error("Recipient suggest error:", err);
      res.status(500).json({ error: "Failed to find recipient suggestions." });
    }
  });

  // 2. Get Mail for specific folder (inbox, sent, drafts, trash, starred, archive)
  // Requirement 30 & 32
  app.get("/api/mail", requireAuth, async (req, res) => {
    try {
      const folder = String(req.query.folder || "inbox").toLowerCase();
      const currentUserId = req.user._id || req.user.id;

      let filter = {};

      if (folder === "sent") {
        filter = {
          sender: currentUserId,
          isDraft: false,
          userStates: {
            $elemMatch: {
              user: currentUserId,
              folder: { $ne: "trash" },
              isDeleted: false,
            },
          },
        };
      } else if (folder === "drafts") {
        filter = {
          sender: currentUserId,
          isDraft: true,
        };
      } else if (folder === "starred") {
        filter = {
          userStates: {
            $elemMatch: {
              user: currentUserId,
              isStarred: true,
              folder: { $ne: "trash" },
              isDeleted: false,
            },
          },
        };
      } else if (folder === "trash") {
        filter = {
          userStates: {
            $elemMatch: {
              user: currentUserId,
              folder: "trash",
            },
          },
        };
      } else if (folder === "archive") {
        filter = {
          userStates: {
            $elemMatch: {
              user: currentUserId,
              folder: "archive",
              isDeleted: false,
            },
          },
        };
      } else {
        // inbox (default)
        filter = {
          isDraft: false,
          userStates: {
            $elemMatch: {
              user: currentUserId,
              folder: "inbox",
              isDeleted: false,
            },
          },
        };
      }

      const emails = await Mail.find(filter)
        .populate("sender", "firstName lastName email collegeEmail avatarUrl")
        .sort({ createdAt: -1 })
        .limit(100);

      const formatted = emails.map((m) => {
        const userState = m.userStates.find(
          (s) => s.user.toString() === currentUserId.toString()
        ) || { isRead: false, isStarred: false, folder: "inbox" };

        const senderName = m.sender
          ? `${m.sender.firstName} ${m.sender.lastName}`.trim()
          : m.senderName || m.senderEmail;

        return {
          id: m._id.toString(),
          _id: m._id.toString(),
          subject: m.subject,
          body: m.body,
          sender_email: m.senderEmail,
          sender_name: senderName,
          email: m.senderEmail,
          first_name: m.sender?.firstName || "",
          last_name: m.sender?.lastName || "",
          created_at: m.createdAt.toISOString(),
          folder: userState.folder || folder,
          read_at: userState.isRead ? m.updatedAt.toISOString() : null,
          is_starred: Boolean(userState.isStarred),
          isRead: Boolean(userState.isRead),
          isStarred: Boolean(userState.isStarred),
          isDraft: Boolean(m.isDraft),
          attachments: m.attachments || [],
          recipientEmails: m.recipientEmails || [],
        };
      });

      res.json({ mail: formatted });
    } catch (err) {
      console.error("Fetch mail error:", err);
      res.status(500).json({ error: "Failed to load mailbox." });
    }
  });

  // 3. Get single mail details
  app.get("/api/mail/:id", requireAuth, async (req, res) => {
    try {
      const currentUserId = req.user._id || req.user.id;
      const mail = await Mail.findById(req.params.id).populate("sender recipients");
      if (!mail) return res.status(404).json({ error: "Mail not found." });

      // Mark as read in user's state
      await Mail.updateOne(
        { _id: mail._id, "userStates.user": currentUserId },
        { $set: { "userStates.$.isRead": true } }
      );

      const userState = mail.userStates.find(
        (s) => s.user.toString() === currentUserId.toString()
      ) || { isRead: true, isStarred: false };

      const senderName = mail.sender
        ? `${mail.sender.firstName} ${mail.sender.lastName}`.trim()
        : mail.senderName || mail.senderEmail;

      const recipients = (mail.recipients || []).map((r) => ({
        email: r.collegeEmail || r.email,
        first_name: r.firstName,
        last_name: r.lastName,
      }));

      res.json({
        thread: {
          id: mail._id.toString(),
          _id: mail._id.toString(),
          subject: mail.subject,
          body: mail.body,
          sender_email: mail.senderEmail,
          sender_name: senderName,
          email: mail.senderEmail,
          first_name: mail.sender?.firstName || "",
          last_name: mail.sender?.lastName || "",
          created_at: mail.createdAt.toISOString(),
          folder: userState.folder,
          read_at: new Date().toISOString(),
          is_starred: Boolean(userState.isStarred),
          isRead: true,
          isStarred: Boolean(userState.isStarred),
          attachments: mail.attachments || [],
        },
        recipients,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to load email thread." });
    }
  });

  // 4. Send or draft mail
  app.post("/api/mail", requireAuth, async (req, res) => {
    try {
      const {
        recipientEmail,
        recipientEmails: multiEmails,
        subject = "(no subject)",
        body = "",
        isDraft = false,
        attachments = [],
      } = req.body || {};

      const currentUserId = req.user._id || req.user.id;
      const senderEmail = req.user.collegeEmail || req.user.email;
      const senderName = [req.user.firstName, req.user.lastName].filter(Boolean).join(" ");

      // Handle recipients
      const emailList = multiEmails && Array.isArray(multiEmails)
        ? multiEmails
        : recipientEmail ? [recipientEmail] : [];

      const normalizedRecipients = emailList
        .map((e) => String(e).trim().toLowerCase())
        .filter(Boolean);

      // Attachments arrive as JSON-serializable metadata objects. Raw File
      // objects cannot survive JSON.stringify (they become {}) and lack the
      // required fileName/fileUrl fields, which would otherwise abort the
      // entire send with a 500. Keep only valid attachment metadata.
      const validAttachments = Array.isArray(attachments)
        ? attachments.filter(
            (a) =>
              a &&
              typeof a.fileName === "string" &&
              typeof a.fileUrl === "string",
          )
        : [];

      if (!isDraft && normalizedRecipients.length === 0) {
        return res.status(400).json({ error: "Recipient email is required." });
      }

      // Lookup recipient users in MongoDB
      const recipientUsers = await User.find({
        $or: [
          { email: { $in: normalizedRecipients } },
          { collegeEmail: { $in: normalizedRecipients } },
        ],
      });

      const userStates = [
        {
          user: currentUserId,
          folder: isDraft ? "drafts" : "sent",
          isRead: true,
          isStarred: false,
          isDeleted: false,
        },
      ];

      // Add inbox state for each recipient
      for (const recUser of recipientUsers) {
        if (recUser._id.toString() !== currentUserId.toString()) {
          userStates.push({
            user: recUser._id,
            folder: "inbox",
            isRead: false,
            isStarred: false,
            isDeleted: false,
          });

          // Create notification for recipient
          if (!isDraft) {
            await Notification.create({
              user: recUser._id,
              title: "New College Mail",
              message: `${senderName}: ${subject}`,
              category: "mail",
              actionUrl: "/communication",
            });
          }
        }
      }

      const newMail = await Mail.create({
        sender: currentUserId,
        senderEmail,
        senderName,
        recipientEmails: normalizedRecipients,
        recipients: recipientUsers.map((u) => u._id),
        subject: String(subject).trim() || "(no subject)",
        body: String(body).trim(),
        attachments: validAttachments,
        isDraft: Boolean(isDraft),
        userStates,
      });

      if (!isDraft) {
        await logAudit({
          userId: currentUserId,
          action: "MAIL_SENT",
          module: "communication",
          resource: "mail",
          resourceId: newMail._id.toString(),
          details: `Sent institutional email to ${normalizedRecipients.join(", ")}: "${subject}".`,
        });
      }

      res.status(201).json({
        success: true,
        threadId: newMail._id.toString(),
        mailId: newMail._id.toString(),
        isDraft: Boolean(isDraft),
      });
    } catch (err) {
      console.error("Send mail error:", err);
      res.status(500).json({ error: "Failed to send email." });
    }
  });

  // 5. Toggle Star state
  app.patch("/api/mail/:id/star", requireAuth, async (req, res) => {
    try {
      const currentUserId = req.user._id || req.user.id;
      const mail = await Mail.findById(req.params.id);
      if (!mail) return res.status(404).json({ error: "Mail not found." });

      const stateIndex = mail.userStates.findIndex(
        (s) => s.user.toString() === currentUserId.toString()
      );

      let isStarred = true;
      if (stateIndex >= 0) {
        isStarred = !mail.userStates[stateIndex].isStarred;
        mail.userStates[stateIndex].isStarred = isStarred;
      } else {
        mail.userStates.push({
          user: currentUserId,
          folder: "inbox",
          isRead: true,
          isStarred: true,
        });
      }

      await mail.save();
      res.json({ success: true, isStarred });
    } catch (err) {
      res.status(500).json({ error: "Failed to update star status." });
    }
  });

  // 6. Toggle Read state
  app.patch("/api/mail/:id/read", requireAuth, async (req, res) => {
    try {
      const currentUserId = req.user._id || req.user.id;
      const { isRead = true } = req.body || {};
      const mail = await Mail.findById(req.params.id);
      if (!mail) return res.status(404).json({ error: "Mail not found." });

      const stateIndex = mail.userStates.findIndex(
        (s) => s.user.toString() === currentUserId.toString()
      );

      if (stateIndex >= 0) {
        mail.userStates[stateIndex].isRead = Boolean(isRead);
      } else {
        mail.userStates.push({
          user: currentUserId,
          folder: "inbox",
          isRead: Boolean(isRead),
          isStarred: false,
        });
      }

      await mail.save();
      res.json({ success: true, isRead: Boolean(isRead) });
    } catch (err) {
      res.status(500).json({ error: "Failed to update read status." });
    }
  });

  // 7. Move to Trash / Archive / Folder
  app.patch("/api/mail/:id/folder", requireAuth, async (req, res) => {
    try {
      const currentUserId = req.user._id || req.user.id;
      const { folder = "trash" } = req.body || {};
      const mail = await Mail.findById(req.params.id);
      if (!mail) return res.status(404).json({ error: "Mail not found." });

      const stateIndex = mail.userStates.findIndex(
        (s) => s.user.toString() === currentUserId.toString()
      );

      if (stateIndex >= 0) {
        mail.userStates[stateIndex].folder = folder;
      } else {
        mail.userStates.push({
          user: currentUserId,
          folder,
          isRead: true,
          isStarred: false,
        });
      }

      await mail.save();
      res.json({ success: true, folder });
    } catch (err) {
      res.status(500).json({ error: "Failed to move mail." });
    }
  });

  // 8. Delete mail (Permanent or Trash)
  app.delete("/api/mail/:id", requireAuth, async (req, res) => {
    try {
      const currentUserId = req.user._id || req.user.id;
      const mail = await Mail.findById(req.params.id);
      if (!mail) return res.status(404).json({ error: "Mail not found." });

      const stateIndex = mail.userStates.findIndex(
        (s) => s.user.toString() === currentUserId.toString()
      );

      if (stateIndex >= 0) {
        // If already in trash, mark as deleted
        if (mail.userStates[stateIndex].folder === "trash") {
          mail.userStates[stateIndex].isDeleted = true;
        } else {
          mail.userStates[stateIndex].folder = "trash";
        }
      }

      await mail.save();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete mail." });
    }
  });

  // Direct Institutional Messages
  app.get("/api/messages/contacts", requireAuth, async (req, res) => {
    try {
      const query = String(req.query.q || "").trim();
      const currentUserId = req.user._id || req.user.id;
      const filter = { _id: { $ne: currentUserId }, isActive: true };

      if (query.length >= 2) {
        const regex = new RegExp(query, "i");
        filter.$or = [
          { email: regex },
          { collegeEmail: regex },
          { firstName: regex },
          { lastName: regex },
        ];
      }

      const users = await User.find(filter).limit(25);
      const formatted = users.map((u) => ({
        id: u._id.toString(),
        email: u.collegeEmail || u.email,
        name: `${u.firstName} ${u.lastName}`.trim(),
        avatarUrl: u.avatarUrl || null,
        roles: u.roles || ["student"],
      }));

      res.json({ users: formatted });
    } catch (err) {
      res.status(500).json({ error: "Failed to load contacts." });
    }
  });

  app.get("/api/messages", requireAuth, async (req, res) => {
    try {
      const currentUserId = req.user._id || req.user.id;
      const messages = await Message.find({
        $or: [{ sender: currentUserId }, { recipient: currentUserId }],
      })
        .populate("sender recipient", "firstName lastName email collegeEmail avatarUrl")
        .sort({ createdAt: -1 })
        .limit(100);

      // Group into conversations by other user
      const conversationsMap = new Map();
      for (const m of messages) {
        const isSelf = m.sender._id.toString() === currentUserId.toString();
        const other = isSelf ? m.recipient : m.sender;
        if (!other) continue;
        const otherId = other._id.toString();

        if (!conversationsMap.has(otherId)) {
          conversationsMap.set(otherId, {
            user: {
              id: otherId,
              email: other.collegeEmail || other.email,
              name: `${other.firstName} ${other.lastName}`.trim(),
              avatarUrl: other.avatarUrl || null,
            },
            lastMessage: m.body,
            lastMessageAt: m.createdAt.toISOString(),
            unreadCount: !isSelf && !m.isRead ? 1 : 0,
          });
        } else if (!isSelf && !m.isRead) {
          conversationsMap.get(otherId).unreadCount += 1;
        }
      }

      res.json({ conversations: Array.from(conversationsMap.values()) });
    } catch (err) {
      res.status(500).json({ error: "Failed to load conversations." });
    }
  });

  app.get("/api/messages/:userId", requireAuth, async (req, res) => {
    try {
      const currentUserId = req.user._id || req.user.id;
      const otherUserId = req.params.userId;
      const otherUser = await User.findById(otherUserId);
      if (!otherUser) return res.status(404).json({ error: "User not found." });

      const messages = await Message.find({
        $or: [
          { sender: currentUserId, recipient: otherUserId },
          { sender: otherUserId, recipient: currentUserId },
        ],
      })
        .sort({ createdAt: 1 })
        .limit(100);

      // Mark unread as read
      await Message.updateMany(
        { sender: otherUserId, recipient: currentUserId, isRead: false },
        { isRead: true }
      );

      const formatted = messages.map((m) => ({
        id: m._id.toString(),
        body: m.body,
        isRead: m.isRead,
        created_at: m.createdAt.toISOString(),
        isSelf: m.sender.toString() === currentUserId.toString(),
      }));

      res.json({
        user: {
          id: otherUser._id.toString(),
          email: otherUser.collegeEmail || otherUser.email,
          name: `${otherUser.firstName} ${otherUser.lastName}`.trim(),
          avatarUrl: otherUser.avatarUrl || null,
        },
        messages: formatted,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to load messages." });
    }
  });

  app.post("/api/messages/:userId", requireAuth, async (req, res) => {
    try {
      const currentUserId = req.user._id || req.user.id;
      const otherUserId = req.params.userId;
      const { body } = req.body || {};

      if (!body || !String(body).trim()) {
        return res.status(400).json({ error: "Message content is required." });
      }

      const otherUser = await User.findById(otherUserId);
      if (!otherUser) return res.status(404).json({ error: "Recipient not found." });

      const msg = await Message.create({
        sender: currentUserId,
        recipient: otherUserId,
        body: String(body).trim(),
      });

      await Notification.create({
        user: otherUserId,
        title: "New Message",
        message: `${req.user.firstName} sent you a message.`,
        category: "message",
        actionUrl: "/messages",
      });

      res.status(201).json({ success: true, messageId: msg._id.toString() });
    } catch (err) {
      res.status(500).json({ error: "Failed to send message." });
    }
  });

  // 9. Notifications Engine API
  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const currentUserId = req.user._id || req.user.id;
      const notifications = await Notification.find({ user: currentUserId })
        .sort({ createdAt: -1 })
        .limit(100);

      const unreadCount = await Notification.countDocuments({
        user: currentUserId,
        read: false,
      });

      const formatted = notifications.map((n) => ({
        id: n._id.toString(),
        _id: n._id.toString(),
        title: n.title,
        message: n.message,
        category: n.category,
        priority: n.priority,
        read: Boolean(n.read),
        actionUrl: n.actionUrl,
        examId: n.examId ? n.examId.toString() : null,
        created_at: n.createdAt.toISOString(),
      }));

      res.json({ notifications: formatted, unreadCount });
    } catch (err) {
      res.status(500).json({ error: "Failed to load notifications." });
    }
  });

  app.patch("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      const currentUserId = req.user._id || req.user.id;
      const notif = await Notification.findOneAndUpdate(
        { _id: req.params.id, user: currentUserId },
        { read: true, readAt: new Date() },
        { returnDocument: 'after' }
      );
      if (!notif) return res.status(404).json({ error: "Notification not found." });
      res.json({ success: true, read: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to update notification." });
    }
  });

  app.post("/api/notifications/read-all", requireAuth, async (req, res) => {
    try {
      const currentUserId = req.user._id || req.user.id;
      await Notification.updateMany(
        { user: currentUserId, read: false },
        { read: true, readAt: new Date() }
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to mark all as read." });
    }
  });
}
