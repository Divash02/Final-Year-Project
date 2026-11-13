import React, { useCallback, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEnvelope,
  faInbox,
  faStar,
  faPaperPlane,
  faPen,
  faBoxArchive,
  faTrash,
  faChevronLeft,
  faCaretDown,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import { useCollegeOS } from "../../context/CollegeOSContext";
import {
  MAIL_FOLDERS,
  MailFolderId,
} from "./mailTypes";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { Tooltip } from "../ui/Tooltip";

export interface MailNavigationProps {
  folder: MailFolderId;
  onFolderChange: (folder: MailFolderId) => void;
  unreadCount: number;
  onCompose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const FOLDER_SECTIONS: { id: string; label: string; folderIds: MailFolderId[] }[] = [
  {
    id: "mailbox",
    label: "MAILBOX",
    folderIds: [
      "inbox",
      "starred",
      "sent",
      "drafts",
      "archive",
      "spam",
      "trash",
      "all",
    ],
  },
];

export const MailNavigation: React.FC<MailNavigationProps> = ({
  folder,
  onFolderChange,
  unreadCount,
  onCompose,
  collapsed,
  onToggleCollapse,
}) => {
  const { currentTenant, currentUser } = useCollegeOS();

  const handleFolderChange = useCallback(
    (next: MailFolderId) => {
      onFolderChange(next);
    },
    [onFolderChange],
  );

  const folderDefinitions = useMemo(
    () =>
      MAIL_FOLDERS.filter((f) =>
        FOLDER_SECTIONS[0].folderIds.includes(f.id),
      ),
    [],
  );

  return (
    <nav
      aria-label="Mail folders"
      className={`mail-nav-rail ${collapsed ? "collapsed" : ""}`}
    >
      {/* App identity at top */}
      <div className="mail-nav-app">
        <div className="mail-nav-app-icon">
          <FontAwesomeIcon icon={faEnvelope} className="w-5 h-5" aria-hidden="true" />
        </div>
        {!collapsed && (
          <div className="mail-nav-app-text">
            <div className="mail-nav-app-title">CollegeOS Mail</div>
            <div className="mail-nav-app-subtitle">
              {currentTenant?.name || "Institution"}
            </div>
          </div>
        )}
      </div>

      {/* Compose button - Gmail style */}
      <button
        type="button"
        className="mail-compose-btn"
        onClick={onCompose}
        aria-label="Compose new message"
      >
        <FontAwesomeIcon
          icon={faPlus}
          className="mail-compose-btn-icon"
          aria-hidden="true"
        />
        {!collapsed && "Compose"}
      </button>

      {/* Folder navigation sections */}
      <div className="mail-nav-section">
        <div className="mail-nav-section-label">
          <span>{FOLDER_SECTIONS[0].label}</span>
          {collapsed && (
            <button
              type="button"
              className="mail-nav-collapse-toggle"
              onClick={onToggleCollapse}
              aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
              aria-expanded={!collapsed}
            >
              <FontAwesomeIcon
                icon={collapsed ? faCaretDown : faChevronLeft}
                className="w-4 h-4"
                aria-hidden="true"
              />
            </button>
          )}
        </div>

        <div className="mail-nav-list">
          {folderDefinitions.map((definition) => {
            const isActive = folder === definition.id;
            const showBadge = definition.id === "inbox" && unreadCount > 0;
            return (
                <button
                  type="button"
                  onClick={() => handleFolderChange(definition.id)}
                  aria-current={isActive ? "page" : undefined}
                  className="mail-nav-item"
                >
                  <FontAwesomeIcon
                    icon={definition.icon}
                    className="mail-nav-item-icon"
                    aria-hidden="true"
                  />
                  {!collapsed && (
                    <span className="mail-nav-item-label">
                      {definition.label}
                    </span>
                  )}
                  {showBadge && !collapsed && (
                    <span className="mail-nav-item-badge">
                      {unreadCount}
                    </span>
                  )}
                </button>
            );
          })}
        </div>
      </div>

      {/* Bottom connection status */}
      <div className="mail-nav-footer">
        <div className="mail-nav-connection">
          <span
            className={`mail-nav-connection-dot ${"online"}`}
            aria-hidden="true"
          />
          <span className="mail-nav-connection-label">
            {currentTenant?.config?.timezone?.replace("Asia/", "") ||
              currentTenant?.name ||
              "Connected"}
          </span>
        </div>
      </div>
    </nav>
  );
};

export default MailNavigation;
