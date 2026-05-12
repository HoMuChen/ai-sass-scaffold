import { z } from "zod";

/**
 * Client → API: request a presigned PUT URL for direct S3 upload.
 * Per the blueprint, the API server NEVER proxies file bytes.
 */
export const presignUploadRequestSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive().max(500 * 1024 * 1024), // hard cap 500 MB
});
export type PresignUploadRequest = z.infer<typeof presignUploadRequestSchema>;

export const presignUploadResponseSchema = z.object({
  key: z.string(),
  uploadUrl: z.string().url(),
  publicUrl: z.string().url(),
  expiresInSeconds: z.number().int().positive(),
});
export type PresignUploadResponse = z.infer<typeof presignUploadResponseSchema>;

export const presignDownloadRequestSchema = z.object({
  key: z.string().min(1),
});
export type PresignDownloadRequest = z.infer<typeof presignDownloadRequestSchema>;
