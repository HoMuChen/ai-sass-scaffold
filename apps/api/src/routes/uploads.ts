import { db, schema } from "@repo/db";
import {
  presignDownload as defaultPresignDownload,
  presignUpload as defaultPresignUpload,
} from "@repo/storage";
import { presignDownloadRequestSchema, presignUploadRequestSchema } from "@repo/schema";
import { zValidator } from "@hono/zod-validator";
import { Hono, type MiddlewareHandler } from "hono";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import type { z } from "zod";

type PresignUploadBody = z.infer<typeof presignUploadRequestSchema>;
type PresignDownloadQuery = z.infer<typeof presignDownloadRequestSchema>;
type PresignedUpload = Awaited<ReturnType<typeof defaultPresignUpload>>;

export type UploadsRouteDeps = {
  requireAuth: MiddlewareHandler<{ Variables: AuthVariables }>;
  createPresignedUpload: (input: {
    userId: string;
    body: PresignUploadBody;
  }) => Promise<PresignedUpload>;
  recordUpload: (input: {
    userId: string;
    body: PresignUploadBody;
    key: string;
  }) => Promise<void>;
  createPresignedDownload: (input: PresignDownloadQuery) => Promise<string>;
};

function getDefaultDeps(): UploadsRouteDeps {
  return {
    requireAuth,
    createPresignedUpload: ({ userId, body }) =>
      defaultPresignUpload({
        userId,
        filename: body.filename,
        contentType: body.contentType,
      }),
    recordUpload: async ({ userId, body, key }) => {
      await db.insert(schema.uploads).values({
        userId,
        key,
        filename: body.filename,
        contentType: body.contentType,
        sizeBytes: body.sizeBytes,
      });
    },
    createPresignedDownload: ({ key }) => defaultPresignDownload(key),
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

      const presigned = await deps.createPresignedUpload({ userId, body });

      await deps.recordUpload({ userId, body, key: presigned.key });

      return c.json(presigned);
    })
    /** GET /uploads/download?key=... — short-lived signed GET URL. */
    .get("/download", zValidator("query", presignDownloadRequestSchema), async (c) => {
      const query = c.req.valid("query");
      const url = await deps.createPresignedDownload(query);
      return c.json({ url });
    });
}

export const uploadsRoute = createUploadsRoute();
