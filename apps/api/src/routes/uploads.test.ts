import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { fakeRequireAuth } from "../test-utils/fakes.js";
import { createUploadsRoute } from "./uploads.js";

describe("uploads routes", () => {
  it("stores organizationId and createdByUserId on presign", async () => {
    const createPresignedUpload = vi.fn(async () => ({
      key: "orgs/org_9/uploads/upload-1-report.pdf",
      uploadUrl: "https://example.com/upload",
      publicUrl: "https://cdn.example.com/orgs/org_9/uploads/upload-1-report.pdf",
      expiresInSeconds: 300,
    }));
    const recordUpload = vi.fn(async () => undefined);
    const app = new Hono().route(
      "/uploads",
      createUploadsRoute({
        requireAuth: fakeRequireAuth({ userId: "user_7", organizationId: "org_9" }),
        createPresignedUpload,
        recordUpload,
      }),
    );

    const res = await app.request("http://test/uploads/presign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filename: "report.pdf",
        contentType: "application/pdf",
        sizeBytes: 1024,
      }),
    });

    expect(res.status).toBe(200);
    expect(createPresignedUpload).toHaveBeenCalledWith({
      organizationId: "org_9",
      body: {
        filename: "report.pdf",
        contentType: "application/pdf",
        sizeBytes: 1024,
      },
    });
    expect(recordUpload).toHaveBeenCalledWith({
      organizationId: "org_9",
      userId: "user_7",
      body: {
        filename: "report.pdf",
        contentType: "application/pdf",
        sizeBytes: 1024,
      },
      key: "orgs/org_9/uploads/upload-1-report.pdf",
    });
  });

  it("refuses to presign a download for a key outside the active organization", async () => {
    const findUploadByKey = vi.fn(async () => undefined);
    const createPresignedDownload = vi.fn(async () => "https://example.com/download");
    const app = new Hono().route(
      "/uploads",
      createUploadsRoute({
        requireAuth: fakeRequireAuth({ userId: "user_7", organizationId: "org_9" }),
        findUploadByKey,
        createPresignedDownload,
      }),
    );

    const res = await app.request(
      "http://test/uploads/download?key=orgs/org_other/uploads/upload-1-report.pdf",
    );

    expect(res.status).toBe(404);
    expect(findUploadByKey).toHaveBeenCalledWith({
      key: "orgs/org_other/uploads/upload-1-report.pdf",
      organizationId: "org_9",
    });
    expect(await res.json()).toEqual({ error: "Not found" });
    expect(createPresignedDownload).not.toHaveBeenCalled();
  });

  it("presigns downloads for uploads in the active organization", async () => {
    const key = "orgs/org_9/uploads/upload-1-report.pdf";
    const findUploadByKey = vi.fn(async () => ({
      id: "upload_1",
      organizationId: "org_9",
      createdByUserId: "user_7",
      key,
      filename: "report.pdf",
      contentType: "application/pdf",
      sizeBytes: 1024,
      createdAt: new Date("2026-05-14T00:00:00.000Z"),
    }));
    const createPresignedDownload = vi.fn(async () => "https://example.com/download");
    const app = new Hono().route(
      "/uploads",
      createUploadsRoute({
        requireAuth: fakeRequireAuth({ userId: "user_7", organizationId: "org_9" }),
        findUploadByKey,
        createPresignedDownload,
      }),
    );

    const res = await app.request(`http://test/uploads/download?key=${encodeURIComponent(key)}`);

    expect(res.status).toBe(200);
    expect(findUploadByKey).toHaveBeenCalledWith({
      key,
      organizationId: "org_9",
    });
    expect(createPresignedDownload).toHaveBeenCalledWith(key);
    expect(await res.json()).toEqual({ url: "https://example.com/download" });
  });

  it("uses organization-scoped storage keys in the real presign path", async () => {
    const originalEnv = {
      S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
      S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
      S3_BUCKET: process.env.S3_BUCKET,
      S3_ENDPOINT: process.env.S3_ENDPOINT,
      S3_PUBLIC_URL: process.env.S3_PUBLIC_URL,
      S3_REGION: process.env.S3_REGION,
      S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE,
    };
    process.env.S3_ACCESS_KEY_ID = "test-access-key";
    process.env.S3_SECRET_ACCESS_KEY = "test-secret-key";
    process.env.S3_BUCKET = "test-bucket";
    process.env.S3_ENDPOINT = "http://127.0.0.1:9000";
    process.env.S3_PUBLIC_URL = "http://127.0.0.1:9000/public";
    process.env.S3_REGION = "us-east-1";
    process.env.S3_FORCE_PATH_STYLE = "true";

    const recordUpload = vi.fn(async () => undefined);
    const app = new Hono().route(
      "/uploads",
      createUploadsRoute({
        requireAuth: fakeRequireAuth({ userId: "user_7", organizationId: "org_9" }),
        recordUpload,
      }),
    );

    try {
      const res = await app.request("http://test/uploads/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: "Quarterly Report.pdf",
          contentType: "application/pdf",
          sizeBytes: 1024,
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.key).toMatch(
        /^orgs\/org_9\/uploads\/\d+-[0-9a-f-]+-Quarterly_Report\.pdf$/,
      );
      expect(json.uploadUrl).toContain(`/test-bucket/${json.key}`);
      expect(json.publicUrl).toBe(`http://127.0.0.1:9000/public/test-bucket/${json.key}`);
      expect(recordUpload).toHaveBeenCalledWith({
        organizationId: "org_9",
        userId: "user_7",
        body: {
          filename: "Quarterly Report.pdf",
          contentType: "application/pdf",
          sizeBytes: 1024,
        },
        key: json.key,
      });
    } finally {
      process.env.S3_ACCESS_KEY_ID = originalEnv.S3_ACCESS_KEY_ID;
      process.env.S3_SECRET_ACCESS_KEY = originalEnv.S3_SECRET_ACCESS_KEY;
      process.env.S3_BUCKET = originalEnv.S3_BUCKET;
      process.env.S3_ENDPOINT = originalEnv.S3_ENDPOINT;
      process.env.S3_PUBLIC_URL = originalEnv.S3_PUBLIC_URL;
      process.env.S3_REGION = originalEnv.S3_REGION;
      process.env.S3_FORCE_PATH_STYLE = originalEnv.S3_FORCE_PATH_STYLE;
    }
  });
});
