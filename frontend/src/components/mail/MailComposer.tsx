import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPaperPlane } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { FormField } from "../ui/Input";
import { Alert } from "../ui/Alert";

export interface MailComposerProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (payload: {
    recipientEmail: string;
    subject: string;
    body: string;
  }) => Promise<void>;
  /** Pre-filled reply target. */
  initialRecipient?: string;
  initialSubject?: string;
  initialBody?: string;
}

/** Compose / reply dialog backed by the real `POST /api/mail` endpoint. */
export const MailComposer: React.FC<MailComposerProps> = ({
  isOpen,
  onClose,
  onSend,
  initialRecipient = "",
  initialSubject = "",
  initialBody = "",
}) => {
  const [recipientEmail, setRecipientEmail] = useState(initialRecipient);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setRecipientEmail(initialRecipient);
    setSubject(initialSubject);
    setBody(initialBody);
    setError("");
  }, [isOpen, initialRecipient, initialSubject, initialBody]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSend({ recipientEmail: recipientEmail.trim(), subject, body });
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not send this mail.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Compose College Mail"
      subtitle="Formal institutional correspondence"
      maxWidth="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="mail-composer-form"
            icon={faPaperPlane}
            isLoading={busy}
            loadingLabel="Sending..."
          >
            Send mail
          </Button>
        </>
      }
    >
      <form id="mail-composer-form" onSubmit={submit} noValidate className="space-y-5">
        {error && <Alert variant="error">{error}</Alert>}

        <FormField label="Recipient" required>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              name="recipient"
              type="email"
              required
              autoComplete="off"
              value={recipientEmail}
              onChange={(event) => setRecipientEmail(event.target.value)}
              placeholder="name@techspire.edu.np"
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              className="cos-input"
            />
          )}
        </FormField>

        <FormField label="Subject" required>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              name="subject"
              type="text"
              required
              maxLength={180}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Subject"
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              className="cos-input"
            />
          )}
        </FormField>

        <FormField label="Message" required>
          {({ id, describedBy, invalid }) => (
            <textarea
              id={id}
              name="body"
              required
              rows={10}
              maxLength={20000}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Write your message"
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              className="cos-input min-h-[12rem] resize-y leading-relaxed"
            />
          )}
        </FormField>
      </form>
    </Modal>
  );
};

export default MailComposer;