import { randomUUID } from "crypto";
import { usersByDN } from "../lib/db.js";
import { requireAdmin, getOptionalUser } from "../lib/auth.js";
import { shouldIncludeInPublicList, toPublicUser, toMinimalPublicRow, hashDn } from "../lib/publicUserFilter.js";
import { addListRowDisplayFields } from "../lib/displayUser.js";

function buildManualDn(id) {
  return `MANUAL:${id}`;
}

function extractManualIdFromDn(dn) {
  if (!dn || !dn.startsWith("MANUAL:")) return null;
  return dn.slice("MANUAL:".length);
}

export async function usersRoutes(fastify) {
  // Fetch users: admin gets full objects; non-admin/unauthenticated get filtered list with table-only fields.
  fastify.get("/users", async (request) => {
    const { isAdmin } = await getOptionalUser(request);
    const users = [];
    for await (const { value } of usersByDN.getRange({})) {
      if (!value) continue;
      if (isAdmin) {
        const row = {
          ...value,
          id: hashDn(value.dn),
        };
        if (value.isManual) row.manualId = extractManualIdFromDn(value.dn);
        users.push(addListRowDisplayFields(row));
        continue;
      }
      if (!shouldIncludeInPublicList(value)) continue;
      const publicRow = toPublicUser(value);
      const withDisplay = addListRowDisplayFields(publicRow);
      users.push(toMinimalPublicRow(withDisplay));
    }
    return users;
  });

  // Create a new manually managed contact (admin only)
  fastify.post("/manual-users", { preHandler: requireAdmin }, async (request, reply) => {
    const body = request.body || {};
    const {
      displayName,
      firstName,
      lastName,
      email,
      title,
      department,
      company,
      office,
      city,
      state,
      country,
      street,
      postalCode,
      phones = {},
    } = body;

    if (!displayName && !email) {
      reply.code(400);
      return { error: "displayName or email is required" };
    }

    const id = randomUUID();
    const dn = buildManualDn(id);
    const now = new Date().toISOString();

    const doc = {
      dn,
      guid: null,
      accountName: null,
      upn: null,
      email: email || null,
      displayName: displayName || null,
      firstName: firstName || null,
      lastName: lastName || null,
      title: title || null,
      department: department || null,
      company: company || null,
      office: office || null,
      location: {
        city: city || null,
        state: state || null,
        country: country || null,
        street: street || null,
        postalCode: postalCode || null,
      },
      phones: {
        business: phones.business || null,
        mobile: phones.mobile || null,
        ipPhone: phones.ipPhone || null,
      },
      groups: { dns: [], names: [] },
      managerDN: null,
      lastLogon: null,
      lastLogonTimestamp: null,
      passwordLastSet: null,
      whenChanged: null,
      whenCreated: null,
      uac: null,
      uacDescription: null,
      isManual: true,
      syncedAt: now,
    };

    await usersByDN.put(dn, doc);

    reply.code(201);
    return { ...doc, id };
  });

  // Update an existing manually managed contact (admin only)
  fastify.put("/manual-users/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params;
    const dn = buildManualDn(id);
    const existing = await usersByDN.get(dn);

    if (!existing || !existing.isManual) {
      reply.code(404);
      return { error: "Manual contact not found" };
    }

    const body = request.body || {};
    const {
      displayName,
      firstName,
      lastName,
      email,
      title,
      department,
      company,
      office,
      city,
      state,
      country,
      street,
      postalCode,
      phones,
    } = body;

    const updated = {
      ...existing,
      email: email !== undefined ? email : existing.email,
      displayName: displayName !== undefined ? displayName : existing.displayName,
      firstName: firstName !== undefined ? firstName : existing.firstName,
      lastName: lastName !== undefined ? lastName : existing.lastName,
      title: title !== undefined ? title : existing.title,
      department: department !== undefined ? department : existing.department,
      company: company !== undefined ? company : existing.company,
      office: office !== undefined ? office : existing.office,
      location: {
        city: city !== undefined ? city : existing.location?.city ?? null,
        state: state !== undefined ? state : existing.location?.state ?? null,
        country: country !== undefined ? country : existing.location?.country ?? null,
        street: street !== undefined ? street : existing.location?.street ?? null,
        postalCode:
          postalCode !== undefined ? postalCode : existing.location?.postalCode ?? null,
      },
      phones: {
        business:
          phones && "business" in phones
            ? phones.business
            : existing.phones?.business ?? null,
        mobile:
          phones && "mobile" in phones ? phones.mobile : existing.phones?.mobile ?? null,
        ipPhone:
          phones && "ipPhone" in phones
            ? phones.ipPhone
            : existing.phones?.ipPhone ?? null,
      },
      syncedAt: new Date().toISOString(),
    };

    await usersByDN.put(dn, updated);

    return { ...updated, id };
  });

  // Delete a manually managed contact (admin only)
  fastify.delete(
    "/manual-users/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params;
      const dn = buildManualDn(id);
      const existing = await usersByDN.get(dn);

      if (!existing || !existing.isManual) {
        reply.code(404);
        return { error: "Manual contact not found" };
      }

      await usersByDN.remove(dn);

      reply.code(204);
      return null;
    }
  );
}

