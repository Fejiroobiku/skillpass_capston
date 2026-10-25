import { createReadStream } from 'node:fs';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { config } from '../config.js';
import { SignedUrlSigner } from './signedUrls.js';

/**
 * Evidence storage.
 *
 * EvidenceStore is the interface the routes use; LocalDiskStore keeps files on the server's disk.
 * To move to cloud storage (Supabase Storage, as in the deployment plan), add a subclass that uploads in
 * store() and deletes in remove(). Nothing else needs to change, because the SHA-256 and the file type
 * are worked out here before the file is stored.
 *
 * Files are private: the API never hands out a bare file address, only a signed link that expires
 * (see signedUrls.js), checked by EvidenceStore.serve() before the file is sent.
 */
export const tempDir = () => path.join(config.uploadDir, '.tmp');

export async function ensureDirs() {
  await mkdir(tempDir(), { recursive: true });
}

export function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/** Work out what a file really is from its first bytes. The browser's claimed type is not trusted. */
export async function sniffFile(filePath) {
  const handle = await open(filePath, 'r');
  const buf = Buffer.alloc(16);
  try {
    await handle.read(buf, 0, 16, 0);
  } finally {
    await handle.close();
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg', kind: 'photo' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png', kind: 'photo' };
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp', kind: 'photo' };
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp') return { mime: 'video/mp4', ext: 'mp4', kind: 'video' };
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { mime: 'video/webm', ext: 'webm', kind: 'video' };
  return null;
}

export class EvidenceStore {
  /** @param {SignedUrlSigner} signer */
  constructor(signer) {
    if (new.target === EvidenceStore) throw new TypeError('EvidenceStore is abstract; use a subclass.');
    this.signer = signer;
  }

  /** Turn a stored path like /uploads/abc.jpg into a link that expires. */
  signedPath(storedPath) {
    return this.signer.sign(storedPath);
  }

  // eslint-disable-next-line no-unused-vars
  async store(tempPath, ext) {
    throw new TypeError(`${this.constructor.name} must implement store().`);
  }

  // eslint-disable-next-line no-unused-vars
  async remove(key) {
    throw new TypeError(`${this.constructor.name} must implement remove().`);
  }

  /** Express middleware placed before the file server: refuses links that are unsigned, edited or expired. */
  guard() {
    return (req, res, next) => {
      const result = this.signer.check(`/uploads${req.path}`, req.query.exp, req.query.sig);
      if (result === 'ok') {
        res.setHeader('Cache-Control', `private, max-age=${this.signer.secondsLeft(req.query.exp)}`);
        return next();
      }
      res.status(403).json({ error: result === 'expired' ? 'This evidence link has expired. Reload the page to get a fresh one.' : 'This evidence link is not valid.' });
    };
  }
}

/** Keeps evidence files on the server's disk under unguessable names. */
export class LocalDiskStore extends EvidenceStore {
  constructor(signer, dir = config.uploadDir) {
    super(signer);
    this.dir = dir;
  }

  async store(tempPath, ext) {
    const key = `${randomUUID()}.${ext}`;
    await rename(tempPath, path.join(this.dir, key));
    return { key, url: `/uploads/${key}` };
  }

  async remove(key) {
    await removeFile(path.join(this.dir, key));
  }
}

export const removeFile = (filePath) => rm(filePath, { force: true }).catch(() => {});

export const evidenceStore = new LocalDiskStore(new SignedUrlSigner(config.signingKey, config.evidenceUrlMinutes * 60));

/** Move a verified temp file into permanent storage under an unguessable name. */
export const storeFile = (tempPath, ext) => evidenceStore.store(tempPath, ext);
export const removeStored = (key) => evidenceStore.remove(key);
