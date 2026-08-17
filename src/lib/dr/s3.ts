import { createHash, createHmac } from "node:crypto";
import type { ColdStorageConfig } from "@/lib/dr/config";

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** AWS URI encode: encodeURIComponent, then restore AWS-allowed chars. */
export function awsEncode(value: string, encodeSlash: boolean): string {
  const encoded = encodeURIComponent(value).replace(/[!'()*]/g, (ch) => {
    return `%${ch.charCodeAt(0).toString(16).toUpperCase()}`;
  });
  return encodeSlash ? encoded.replace(/%2F/gi, "/") : encoded;
}

export function objectUri(key: string): string {
  return `/${key.split("/").map((part) => awsEncode(part, false)).join("/")}`;
}

function amzDate(at: Date): { amz: string; date: string } {
  const iso = at.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amz: iso, date: iso.slice(0, 8) };
}

export type SignedRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
};

function signingKey(
  secret: string,
  date: string,
  region: string,
  service: string
): Buffer {
  const kDate = hmac(`AWS4${secret}`, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

export function signS3Request(opts: {
  config: ColdStorageConfig;
  method: "GET" | "PUT";
  key: string;
  query?: Record<string, string>;
  body?: Buffer;
  at?: Date;
}): SignedRequest {
  const { config, method, key } = opts;
  const at = opts.at ?? new Date();
  const { amz, date } = amzDate(at);
  const body = opts.body ?? Buffer.alloc(0);
  const payloadHash = sha256Hex(body);
  const pathStyle = Boolean(config.endpoint);
  const host = pathStyle
    ? new URL(config.endpoint!).host
    : `${config.bucket}.s3.${config.region}.amazonaws.com`;
  const canonicalUri = pathStyle
    ? `/${awsEncode(config.bucket, false)}${key ? objectUri(key) : ""}`
    : key
      ? objectUri(key)
      : "/";
  const query = opts.query ?? {};
  const queryString = Object.keys(query)
    .sort()
    .map((k) => `${awsEncode(k, false)}=${awsEncode(query[k], false)}`)
    .join("&");
  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amz,
  };
  const extra: Record<string, string> = {};
  if (method === "PUT") {
    extra["content-type"] = "application/octet-stream";
    extra["content-length"] = String(body.length);
  }
  const signedHeaderNames = Object.keys(headers)
    .map((h) => h.toLowerCase())
    .sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${headers[name].trim()}\n`)
    .join("");
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalRequest = [
    method,
    canonicalUri,
    queryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${date}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amz,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = hmac(
    signingKey(config.secretAccessKey, date, config.region, "s3"),
    stringToSign
  ).toString("hex");
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const origin = pathStyle
    ? config.endpoint!.replace(/\/+$/, "")
    : `https://${host}`;
  const url = `${origin}${canonicalUri}${queryString ? `?${queryString}` : ""}`;
  return { url, method, headers: { ...headers, ...extra } };
}

async function s3Fetch(
  signed: SignedRequest,
  body?: Buffer
): Promise<{ status: number; text: string; bytes: Buffer }> {
  const res = await fetch(signed.url, {
    method: signed.method,
    headers: signed.headers,
    body: body && body.length > 0 ? new Uint8Array(body) : undefined,
  });
  const bytes = Buffer.from(await res.arrayBuffer());
  return { status: res.status, text: bytes.toString("utf8"), bytes };
}

export async function putObject(
  config: ColdStorageConfig,
  key: string,
  body: Buffer
): Promise<void> {
  const signed = signS3Request({ config, method: "PUT", key, body });
  const res = await s3Fetch(signed, body);
  if (res.status !== 200 && res.status !== 204) {
    throw new Error(
      `Cold storage PUT failed (${res.status}): ${res.text.slice(0, 400)}`
    );
  }
}

export async function getObject(
  config: ColdStorageConfig,
  key: string
): Promise<Buffer> {
  const signed = signS3Request({ config, method: "GET", key });
  const res = await s3Fetch(signed);
  if (res.status !== 200) {
    throw new Error(
      `Cold storage GET failed (${res.status}): ${res.text.slice(0, 400)}`
    );
  }
  return res.bytes;
}

export type ListedObject = { key: string; lastModified?: string };

export async function listObjects(
  config: ColdStorageConfig,
  prefix: string
): Promise<ListedObject[]> {
  const out: ListedObject[] = [];
  let token: string | undefined;
  do {
    const query: Record<string, string> = {
      "list-type": "2",
      prefix,
      "max-keys": "1000",
    };
    if (token) query["continuation-token"] = token;
    const signed = signS3Request({
      config,
      method: "GET",
      key: "",
      query,
    });
    const res = await s3Fetch(signed);
    if (res.status !== 200) {
      throw new Error(
        `Cold storage LIST failed (${res.status}): ${res.text.slice(0, 400)}`
      );
    }
    const xml = res.text;
    const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) =>
      decodeXml(m[1])
    );
    const dates = [...xml.matchAll(/<LastModified>([^<]+)<\/LastModified>/g)].map(
      (m) => m[1]
    );
    for (let i = 0; i < keys.length; i++) {
      out.push({ key: keys[i], lastModified: dates[i] });
    }
    const truncated = /<IsTruncated>true<\/IsTruncated>/i.test(xml);
    const next = xml.match(
      /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/
    );
    token = truncated && next ? decodeXml(next[1]) : undefined;
  } while (token);
  return out;
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
