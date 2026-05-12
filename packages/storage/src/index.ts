import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} env var is required`);
  return v;
}

const endpoint = process.env.S3_ENDPOINT;
const region = process.env.S3_REGION ?? "us-east-1";
const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === "true";

const config: S3ClientConfig = {
  region,
  credentials: {
    accessKeyId: required("S3_ACCESS_KEY_ID"),
    secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
  },
  ...(endpoint ? { endpoint, forcePathStyle } : {}),
};

export const s3 = new S3Client(config);
export const bucket = required("S3_BUCKET");
const publicBaseUrl = process.env.S3_PUBLIC_URL ?? endpoint ?? "";

/**
 * Generate a presigned PUT URL for direct browser → S3 upload.
 * Per blueprint §3 storage layer — never proxy bytes through the API.
 */
export async function presignUpload(input: {
  userId: string;
  filename: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<{ key: string; uploadUrl: string; publicUrl: string; expiresInSeconds: number }> {
  const safeName = input.filename.replace(/[^\w.\-]+/g, "_");
  const key = `u/${input.userId}/${Date.now()}-${randomUUID()}-${safeName}`;
  const expiresInSeconds = input.expiresInSeconds ?? 300;

  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: input.contentType,
  });
  const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: expiresInSeconds });
  const publicUrl = `${publicBaseUrl.replace(/\/$/, "")}/${bucket}/${key}`;

  return { key, uploadUrl, publicUrl, expiresInSeconds };
}

/** Presigned GET URL for private downloads / previews. */
export async function presignDownload(
  key: string,
  expiresInSeconds = 300,
): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn: expiresInSeconds });
}
