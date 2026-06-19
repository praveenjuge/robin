import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const defaultDoc = `---
color:
  primary: "#1B4D3E"
  surface: "#FFFFFF"
  text: "#111111"
typography:
  font_sans: "Inter"
  scale: [12, 14, 16, 20, 24, 32, 48]
spacing: [2, 4, 8, 12, 16, 24, 32, 48]
radius: { sm: 4, md: 8, lg: 16, pill: 999 }
components:
  button: { radius: pill, height: 40, weight: 600 }
---

## Overview
Robin has not learned this project yet.

## Principles
- Keep interfaces direct and legible.

## Voice & tone
Clear, calm, and specific.

## Components
Capture component guidance as Robin learns it.

## Don'ts
- Do not invent tokens without a source.
`;

export function sanitizeProjectId(projectId: string) {
  if (!/^[a-z0-9:_-]{8,80}$/i.test(projectId)) throw new Error("Invalid project id.");
  return projectId;
}

export function projectKey(projectId: string, suffix: string) {
  return `projects/${sanitizeProjectId(projectId)}/${suffix}`;
}

export async function readObject(key: string) {
  try {
    const response = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    return (await response.Body?.transformToString()) ?? "";
  } catch (error) {
    if (error instanceof NoSuchKey || (error as { name?: string }).name === "NoSuchKey") {
      return null;
    }
    throw error;
  }
}

export async function writeObject(key: string, body: string, contentType = "text/markdown") {
  if (body.length > 80_000) throw new Error("Document is too large.");
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function readDesignDoc(projectId: string) {
  return (await readObject(projectKey(projectId, "design.md"))) ?? defaultDoc;
}

let s3Client: S3Client | null = null;

function client() {
  if (s3Client) return s3Client;
  const accountId = requiredEnv("CLOUDFLARE_ACCOUNT_ID");
  s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
  return s3Client;
}

function bucket() {
  return requiredEnv("R2_BUCKET");
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}
