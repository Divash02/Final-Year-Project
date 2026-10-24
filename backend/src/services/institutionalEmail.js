import { User, InstitutionSetting } from "../models/index.js";

export function normalizeName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, ".");
}

export async function generateInstitutionalEmail(firstName, lastName, batch) {
  const normalizedFirst = normalizeName(firstName).split(".")[0];
  const normalizedLast = normalizeName(lastName);

  if (!normalizedFirst || !normalizedLast) {
    throw new Error(
      "A valid first and last name are required to generate an institutional email."
    );
  }

  const setting = await InstitutionSetting.findOne({ settingKey: "email_domain" });
  const domain = setting?.settingValue || process.env.INSTITUTION_EMAIL_DOMAIN || "techspire.edu.np";

  // Requirement 11:
  // firstname.lastname@techspire.edu.np
  // Collision: firstname.lastname2@techspire.edu.np
  const basePrefix = `${normalizedFirst}.${normalizedLast}`;
  let email = `${basePrefix}@${domain}`;

  let collision = 2;
  while (await User.findOne({ $or: [{ email }, { collegeEmail: email }] })) {
    email = `${basePrefix}${collision}@${domain}`;
    collision += 1;
  }

  return email;
}
