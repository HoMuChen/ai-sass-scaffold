import { presignDownloadRequestSchema, presignUploadRequestSchema } from "@repo/schema";
import { zValidator } from "@hono/zod-validator";
import { Hono, type MiddlewareHandler } from "hono";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import type { z } from "zod";

type PresignUploadBody = z.infer<typeof presignUploadRequestSchema>;
type PresignedUpload = {
  key: string;
  uploadUrl: string;
  publicUrl: string;
  expiresInSeconds: number;
};
type UploadRecord = {
  id: string;
  organizationId: string;
  createdByUserId: string;
  key: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
};

let dbModulePromise: Promise<typeof import("@repo/db")> | undefined;
let storageModulePromise: Promise<typeof import("@repo/storage")> | undefined;

async function loadDbModule(): Promise<typeof import("@repo/db")> {
  dbModulePromise ??= import("@repo/db");
  return dbModulePromise;
}

async function loadStorageModule(): Promise<typeof import("@repo/storage")> {
  storageModulePromise ??= import("@repo/storage");
  return storageModulePromise;
}

export type UploadsRouteDeps = {
  requireAuth: MiddlewareHandler<{ Variables: AuthVariables }>;
  createPresignedUpload: (input: {
    organizationId: string;
    body: PresignUploadBody;
  }) => Promise<PresignedUpload>;
  recordUpload: (input: {
    organizationId: string;
    userId: string;
    body: PresignUploadBody;
    key: string;
  }) => Promise<void>;
  findUploadByKey: (input: {
    key: string;
    organizationId: string;
  }) => Promise<UploadRecord | undefined>;
  createPresignedDownload: (key: string) => Promise<string>;
};

function getDefaultDeps(): UploadsRouteDeps {
  return {
    requireAuth,
    createPresignedUpload: async ({ organizationId, body }) => {
      const { presignUpload } = await loadStorageModule();
      return presignUpload({
        organizationId,
        filename: body.filename,
        contentType: body.contentType,
      });
    },
    recordUpload: async ({ organizationId, userId, body, key }) => {
      const { db, schema } = await loadDbModule();
      await db.insert(schema.uploads).values({
        organizationId,
        createdByUserId: userId,
        key,
        filename: body.filename,
        contentType: body.contentType,
        sizeBytes: body.sizeBytes,
      });
    },
    findUploadByKey: async ({ key, organizationId }) => {
      const { db } = await loadDbModule();
      return db.query.uploads.findFirst({
        where: (upload, { and, eq }) =>
          and(eq(upload.key, key), eq(upload.organizationId, organizationId)),
      });
    },
    createPresignedDownload: async (key) => {
      const { presignDownload } = await loadStorageModule();
      return presignDownload(key);
    },
  };
}

function resolveDeps(overrides: Partial<UploadsRouteDeps> = {}): UploadsRouteDeps {
  return {
    ...getDefaultDeps(),
    ...overrides,
  };
}

export function createUploadsRoute(overrides: Partial<UploadsRouteDeps> = {}) {
  const deps = resolveDeps(overrides);

  return new Hono<{ Variables: AuthVariables }>()
    .use("*", deps.requireAuth)
    /**
     * POST /uploads/presign
     * Returns a one-shot PUT URL the client uses to upload directly to S3.
     * Blueprint §3 - "嚴禁讓 API 伺服器中轉大檔案".
     */
    .post("/presign", zValidator("json", presignUploadRequestSchema), async (c) => {
      const body = c.req.valid("json");
      const userId = c.get("userId");
      const organizationId = c.get("organizationId");

      const presigned = await deps.createPresignedUpload({ organizationId, body });

      await deps.recordUpload({ organizationId, userId, body, key: presigned.key });

      return c.json(presigned);
    })
    /** GET /uploads/download?key=... — short-lived signed GET URL. */
    .get("/download", zValidator("query", presignDownloadRequestSchema), async (c) => {
      const query = c.req.valid("query");
      const organizationId = c.get("organizationId");
      const upload = await deps.findUploadByKey({
        key: query.key,
        organizationId,
      });
      if (!upload) return c.json({ error: "Not found" }, 404);

      const url = await deps.createPresignedDownload(upload.key);
      return c.json({ url });
    });
}

export const uploadsRoute = createUploadsRoute();
