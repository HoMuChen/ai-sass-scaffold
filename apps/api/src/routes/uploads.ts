import { db, schema } from "@repo/db";
import { presignDownload, presignUpload } from "@repo/storage";
import { presignDownloadRequestSchema, presignUploadRequestSchema } from "@repo/schema";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

export const uploadsRoute = new Hono<{ Variables: AuthVariables }>()
  .use("*", requireAuth)
  /**
   * POST /uploads/presign
   * Returns a one-shot PUT URL the client uses to upload directly to S3.
   * Blueprint §3 - "嚴禁讓 API 伺服器中轉大檔案".
   */
  .post("/presign", zValidator("json", presignUploadRequestSchema), async (c) => {
    const body = c.req.valid("json");
    const userId = c.get("userId");

    const presigned = await presignUpload({
      userId,
      filename: body.filename,
      contentType: body.contentType,
    });

    await db.insert(schema.uploads).values({
      userId,
      key: presigned.key,
      filename: body.filename,
      contentType: body.contentType,
      sizeBytes: body.sizeBytes,
    });

    return c.json(presigned);
  })
  /** GET /uploads/download?key=... — short-lived signed GET URL. */
  .get("/download", zValidator("query", presignDownloadRequestSchema), async (c) => {
    const { key } = c.req.valid("query");
    const url = await presignDownload(key);
    return c.json({ url });
  });
