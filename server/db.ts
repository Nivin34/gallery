import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import mongoose, { Schema, type Model } from 'mongoose';
import { DATA_ROOT, MONGODB_URI } from './config.js';
import type {
  CollectionLayout,
  FileCategory,
  GalleryFileDTO,
  NoteDTO,
  NoteImageItem,
  NoteStatus,
  NoteTemplateDTO,
  PasswordResetRequestDTO,
  PermissionLevel,
  TemplateCategory,
  UserDTO,
  UserRole,
  UserStatus,
  Visibility,
} from '../src/types.js';

export interface UserEntity {
  id: string;
  name: string;
  email: string;
  bio: string;
  passwordHash: string;
  recoveryCodeHash: string;
  emailVerificationTokenHash: string | null;
  role: UserRole;
  status: UserStatus;
  isActive: boolean;
  emailVerified: boolean;
  permissionLevel: PermissionLevel;
  canPublishPublic: boolean;
  maxFileCount: number;
  maxFileSizeMB: number;
  maxStorageMB: number;
  tokenVersion: number;
  themePreference: 'light' | 'dark';
  createdAt: string;
  updatedAt: string;
}

export interface FileEntity {
  id: string;
  ownerId: string;
  originalName: string;
  title: string;
  description: string;
  folder?: string;
  tags: string[];
  mimeType: string;
  extension: string;
  category: FileCategory;
  sizeBytes: number;
  storageKey: string;
  checksum: string;
  fileData: string | null;
  previewDataUrl: string | null;
  visibility: Visibility;
  lockedByAdmin: boolean;
  shareSlug: string;
  createdAt: string;
  updatedAt: string;
}

export interface NoteEntity {
  id: string;
  ownerId: string;
  title: string;
  shareSlug: string;
  contentHtml: string;
  plainText: string;
  excerpt: string;
  tags: string[];
  images?: NoteImageItem[];
  collectionLayout?: CollectionLayout;
  status: NoteStatus;
  visibility: Visibility;
  lockedByAdmin: boolean;
  readingTimeMinutes: number;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResetTokenEntity {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  used: boolean;
  createdAt: string;
}

export interface ResetRequestEntity {
  id: string;
  userId: string;
  status: 'pending' | 'fulfilled';
  createdAt: string;
}

export interface TemplateEntity {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  category: TemplateCategory;
  defaultTitle: string;
  contentHtml: string;
  tags: string[];
  collectionLayout: CollectionLayout;
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
}

interface LocalStoreData {
  users: UserEntity[];
  files: FileEntity[];
  notes: NoteEntity[];
  templates: TemplateEntity[];
  resetTokens: ResetTokenEntity[];
  resetRequests: ResetRequestEntity[];
}

// --- Mongoose Schemas (Active when MONGODB_URI is provided) ---
const UserSchema = new Schema<UserEntity>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    bio: { type: String, default: '' },
    passwordHash: { type: String, required: true },
    recoveryCodeHash: { type: String, required: true },
    emailVerificationTokenHash: { type: String, default: null },
    role: { type: String, enum: ['admin', 'user'], default: 'user', index: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    isActive: { type: Boolean, default: true },
    emailVerified: { type: Boolean, default: false },
    permissionLevel: {
      type: String,
      enum: ['view_only', 'view_edit', 'view_edit_delete'],
      default: 'view_edit_delete',
    },
    canPublishPublic: { type: Boolean, default: true },
    maxFileCount: { type: Number, default: 100 },
    maxFileSizeMB: { type: Number, default: 10 },
    maxStorageMB: { type: Number, default: 250 },
    tokenVersion: { type: Number, default: 1 },
    themePreference: { type: String, enum: ['light', 'dark'], default: 'light' },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { versionKey: false }
);

const FileSchema = new Schema<FileEntity>(
  {
    id: { type: String, required: true, unique: true, index: true },
    ownerId: { type: String, required: true, index: true },
    originalName: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    folder: { type: String, default: '', index: true },
    tags: { type: [String], default: [] },
    mimeType: { type: String, required: true },
    extension: { type: String, required: true },
    category: { type: String, enum: ['image', 'document', 'spreadsheet', 'other'], required: true, index: true },
    sizeBytes: { type: Number, required: true },
    storageKey: { type: String, default: '' },
    checksum: { type: String, required: true },
    fileData: { type: String, default: null },
    previewDataUrl: { type: String, default: null },
    visibility: { type: String, enum: ['private', 'public'], default: 'private', index: true },
    lockedByAdmin: { type: Boolean, default: false },
    shareSlug: { type: String, required: true, unique: true, index: true },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { versionKey: false }
);

const NoteImageSubSchema = new Schema<NoteImageItem>(
  {
    id: { type: String, required: true },
    fileId: { type: String, default: null },
    src: { type: String, required: true },
    fileName: { type: String, required: true },
    caption: { type: String, default: '' },
    marked: { type: Boolean, default: false },
    order: { type: Number, required: true },
  },
  { _id: false }
);

const NoteSchema = new Schema<NoteEntity>(
  {
    id: { type: String, required: true, unique: true, index: true },
    ownerId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    shareSlug: { type: String, required: true, unique: true, index: true },
    contentHtml: { type: String, default: '' },
    plainText: { type: String, default: '' },
    excerpt: { type: String, default: '' },
    tags: { type: [String], default: [] },
    images: { type: [NoteImageSubSchema], default: [] },
    collectionLayout: { type: String, enum: ['grid', 'columns', 'stack'], default: 'grid' },
    status: { type: String, enum: ['draft', 'published'], default: 'draft', index: true },
    visibility: { type: String, enum: ['private', 'public'], default: 'private', index: true },
    lockedByAdmin: { type: Boolean, default: false },
    readingTimeMinutes: { type: Number, default: 1 },
    wordCount: { type: Number, default: 0 },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { versionKey: false }
);

const ResetTokenSchema = new Schema<ResetTokenEntity>(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, index: true },
    expiresAt: { type: String, required: true },
    used: { type: Boolean, default: false },
    createdAt: { type: String, required: true },
  },
  { versionKey: false }
);

const ResetRequestSchema = new Schema<ResetRequestEntity>(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    status: { type: String, enum: ['pending', 'fulfilled'], default: 'pending' },
    createdAt: { type: String, required: true },
  },
  { versionKey: false }
);

const TemplateSchema = new Schema<TemplateEntity>(
  {
    id: { type: String, required: true, unique: true, index: true },
    ownerId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    category: {
      type: String,
      enum: ['general', 'technical', 'editorial', 'collection', 'meeting'],
      default: 'general',
    },
    defaultTitle: { type: String, default: '' },
    contentHtml: { type: String, default: '' },
    tags: { type: [String], default: [] },
    collectionLayout: { type: String, enum: ['grid', 'columns', 'stack'], default: 'grid' },
    isShared: { type: Boolean, default: false },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { versionKey: false }
);

let mongoConnected = false;
let mongoFallbackReason: string | null = null;
let mongoErrorListenerAttached = false;
let UserModel: Model<UserEntity> | null = null;
let FileModel: Model<FileEntity> | null = null;
let NoteModel: Model<NoteEntity> | null = null;
let TemplateModel: Model<TemplateEntity> | null = null;
let ResetTokenModel: Model<ResetTokenEntity> | null = null;
let ResetRequestModel: Model<ResetRequestEntity> | null = null;

const LOCAL_DB_FILE = path.join(DATA_ROOT, 'vault-db.json');
let localCache: LocalStoreData | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function ensureLocalStore(): Promise<LocalStoreData> {
  if (localCache) return localCache;
  await fs.mkdir(DATA_ROOT, { recursive: true });
  try {
    const raw = await fs.readFile(LOCAL_DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<LocalStoreData>;
    localCache = {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      files: Array.isArray(parsed.files) ? parsed.files : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      templates: Array.isArray(parsed.templates) ? parsed.templates : [],
      resetTokens: Array.isArray(parsed.resetTokens) ? parsed.resetTokens : [],
      resetRequests: Array.isArray(parsed.resetRequests) ? parsed.resetRequests : [],
    };
  } catch {
    localCache = {
      users: [],
      files: [],
      notes: [],
      templates: [],
      resetTokens: [],
      resetRequests: [],
    };
    await persistLocalStore();
  }
  return localCache;
}

async function persistLocalStore(): Promise<void> {
  if (!localCache) return;
  const snapshot = JSON.stringify(localCache, null, 2);
  const tmpPath = `${LOCAL_DB_FILE}.tmp`;
  writeQueue = writeQueue.then(async () => {
    await fs.writeFile(tmpPath, snapshot, 'utf8');
    await fs.rename(tmpPath, LOCAL_DB_FILE);
  });
  await writeQueue;
}

export async function initDatabase(): Promise<'mongodb' | 'local-document-store'> {
  mongoFallbackReason = null;
  if (MONGODB_URI) {
    try {
      if (!mongoErrorListenerAttached) {
        mongoose.connection.on('error', () => {
          // Prevent unhandled EventEmitter 'error' crashes during Atlas/network interruptions
        });
        mongoErrorListenerAttached = true;
      }
      await mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 4000,
        connectTimeoutMS: 4000,
      });
      UserModel = mongoose.models.User || mongoose.model<UserEntity>('User', UserSchema);
      FileModel = mongoose.models.GalleryFile || mongoose.model<FileEntity>('GalleryFile', FileSchema);
      NoteModel = mongoose.models.Note || mongoose.model<NoteEntity>('Note', NoteSchema);
      TemplateModel =
        mongoose.models.NoteTemplate ||
        mongoose.model<TemplateEntity>('NoteTemplate', TemplateSchema);
      ResetTokenModel =
        mongoose.models.ResetToken || mongoose.model<ResetTokenEntity>('ResetToken', ResetTokenSchema);
      ResetRequestModel =
        mongoose.models.ResetRequest ||
        mongoose.model<ResetRequestEntity>('ResetRequest', ResetRequestSchema);
      mongoConnected = true;
      console.log('[DB] Connected to MongoDB via Mongoose');
      return 'mongodb';
    } catch (err) {
      await mongoose.disconnect().catch(() => {});
      const message = err instanceof Error ? err.message : '';
      const isAtlasWhitelist =
        message.includes('whitelist') ||
        message.includes('Atlas') ||
        message.includes('ServerSelection');
      mongoFallbackReason = isAtlasWhitelist
        ? 'Remote MongoDB Atlas cluster is unreachable from this server IP (add 0.0.0.0/0 in Atlas Network Access to connect).'
        : 'Remote MongoDB server is unreachable; using local persistence.';
      console.log(
        `[DB] ${mongoFallbackReason} Falling back to persistent local document store at data/vault-db.json.`
      );
    }
  }
  await ensureLocalStore();
  mongoConnected = false;
  console.log('[DB] Using persistent local document store at data/vault-db.json');
  return 'local-document-store';
}

export function getDatabaseEngine(): 'mongodb' | 'local-document-store' {
  return mongoConnected ? 'mongodb' : 'local-document-store';
}

export function getDatabaseFallbackReason(): string | null {
  return mongoFallbackReason;
}

// --- Serialized registration lock so first user is atomically Admin ---
let registrationMutex: Promise<unknown> = Promise.resolve();
function withRegistrationLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = registrationMutex.then(fn, fn);
  registrationMutex = next.catch(() => {});
  return next;
}

// --- User Operations ---
export async function countUsers(): Promise<number> {
  if (mongoConnected && UserModel) {
    return UserModel.countDocuments();
  }
  const db = await ensureLocalStore();
  return db.users.length;
}

export async function findUserById(id: string): Promise<UserEntity | null> {
  if (mongoConnected && UserModel) {
    return UserModel.findOne({ id }).lean<UserEntity>();
  }
  const db = await ensureLocalStore();
  return db.users.find((u) => u.id === id) || null;
}

export async function findUserByEmail(email: string): Promise<UserEntity | null> {
  const normalized = email.trim().toLowerCase();
  if (mongoConnected && UserModel) {
    return UserModel.findOne({ email: normalized }).lean<UserEntity>();
  }
  const db = await ensureLocalStore();
  return db.users.find((u) => u.email === normalized) || null;
}

export async function listAllUsers(): Promise<UserEntity[]> {
  if (mongoConnected && UserModel) {
    return UserModel.find().sort({ createdAt: -1 }).lean<UserEntity[]>();
  }
  const db = await ensureLocalStore();
  return [...db.users].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createUserAtomic(
  input: Omit<
    UserEntity,
    | 'id'
    | 'role'
    | 'status'
    | 'isActive'
    | 'emailVerified'
    | 'permissionLevel'
    | 'canPublishPublic'
    | 'maxFileCount'
    | 'maxFileSizeMB'
    | 'maxStorageMB'
    | 'tokenVersion'
    | 'themePreference'
    | 'createdAt'
    | 'updatedAt'
  >
): Promise<UserEntity> {
  return withRegistrationLock(async () => {
    const existing = await findUserByEmail(input.email);
    if (existing) {
      throw new Error('EMAIL_EXISTS');
    }
    const existingCount = await countUsers();
    const isFirstUser = existingCount === 0;
    const now = new Date().toISOString();

    const entity: UserEntity = {
      ...input,
      id: crypto.randomUUID(),
      email: input.email.trim().toLowerCase(),
      role: isFirstUser ? 'admin' : 'user',
      status: isFirstUser ? 'approved' : 'pending',
      isActive: true,
      emailVerified: isFirstUser ? true : false,
      permissionLevel: 'view_edit_delete',
      canPublishPublic: true,
      maxFileCount: isFirstUser ? 1000 : 100,
      maxFileSizeMB: isFirstUser ? 50 : 10,
      maxStorageMB: isFirstUser ? 2048 : 250,
      tokenVersion: 1,
      themePreference: 'light',
      createdAt: now,
      updatedAt: now,
    };

    if (mongoConnected && UserModel) {
      await UserModel.create(entity);
    } else {
      const db = await ensureLocalStore();
      db.users.push(entity);
      await persistLocalStore();
    }
    return entity;
  });
}

export async function updateUser(
  id: string,
  patch: Partial<Omit<UserEntity, 'id' | 'createdAt'>>
): Promise<UserEntity | null> {
  const updatedAt = new Date().toISOString();
  if (mongoConnected && UserModel) {
    return UserModel.findOneAndUpdate(
      { id },
      { $set: { ...patch, updatedAt } },
      { new: true }
    ).lean<UserEntity>();
  }
  const db = await ensureLocalStore();
  const idx = db.users.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  db.users[idx] = { ...db.users[idx], ...patch, updatedAt };
  await persistLocalStore();
  return db.users[idx];
}

export async function deleteUserById(id: string): Promise<boolean> {
  if (mongoConnected && UserModel && FileModel && NoteModel && ResetTokenModel && ResetRequestModel) {
    const res = await UserModel.deleteOne({ id });
    await FileModel.deleteMany({ ownerId: id });
    await NoteModel.deleteMany({ ownerId: id });
    await ResetTokenModel.deleteMany({ userId: id });
    await ResetRequestModel.deleteMany({ userId: id });
    return res.deletedCount > 0;
  }
  const db = await ensureLocalStore();
  const prevLen = db.users.length;
  db.users = db.users.filter((u) => u.id !== id);
  db.files = db.files.filter((f) => f.ownerId !== id);
  db.notes = db.notes.filter((n) => n.ownerId !== id);
  db.resetTokens = db.resetTokens.filter((t) => t.userId !== id);
  db.resetRequests = db.resetRequests.filter((r) => r.userId !== id);
  await persistLocalStore();
  return db.users.length < prevLen;
}

// --- File Operations ---
export async function listAllFiles(): Promise<FileEntity[]> {
  if (mongoConnected && FileModel) {
    return FileModel.find().lean<FileEntity[]>();
  }
  const db = await ensureLocalStore();
  return [...db.files];
}

export async function findFileById(id: string): Promise<FileEntity | null> {
  if (mongoConnected && FileModel) {
    return FileModel.findOne({ id }).lean<FileEntity>();
  }
  const db = await ensureLocalStore();
  return db.files.find((f) => f.id === id) || null;
}

export async function findFileByShareSlug(shareSlug: string): Promise<FileEntity | null> {
  if (mongoConnected && FileModel) {
    return FileModel.findOne({ shareSlug }).lean<FileEntity>();
  }
  const db = await ensureLocalStore();
  return db.files.find((f) => f.shareSlug === shareSlug) || null;
}

export async function createFile(entity: FileEntity): Promise<FileEntity> {
  if (mongoConnected && FileModel) {
    await FileModel.create(entity);
    return entity;
  }
  const db = await ensureLocalStore();
  db.files.push(entity);
  await persistLocalStore();
  return entity;
}

export async function updateFile(
  id: string,
  patch: Partial<Omit<FileEntity, 'id' | 'createdAt'>>
): Promise<FileEntity | null> {
  const updatedAt = new Date().toISOString();
  if (mongoConnected && FileModel) {
    return FileModel.findOneAndUpdate(
      { id },
      { $set: { ...patch, updatedAt } },
      { new: true }
    ).lean<FileEntity>();
  }
  const db = await ensureLocalStore();
  const idx = db.files.findIndex((f) => f.id === id);
  if (idx === -1) return null;
  db.files[idx] = { ...db.files[idx], ...patch, updatedAt };
  await persistLocalStore();
  return db.files[idx];
}

export async function deleteFileById(id: string): Promise<FileEntity | null> {
  if (mongoConnected && FileModel) {
    return FileModel.findOneAndDelete({ id }).lean<FileEntity>();
  }
  const db = await ensureLocalStore();
  const idx = db.files.findIndex((f) => f.id === id);
  if (idx === -1) return null;
  const [removed] = db.files.splice(idx, 1);
  await persistLocalStore();
  return removed;
}

// --- Note Operations ---
export async function listAllNotes(): Promise<NoteEntity[]> {
  if (mongoConnected && NoteModel) {
    return NoteModel.find().lean<NoteEntity[]>();
  }
  const db = await ensureLocalStore();
  return [...db.notes];
}

export async function findNoteById(id: string): Promise<NoteEntity | null> {
  if (mongoConnected && NoteModel) {
    return NoteModel.findOne({ id }).lean<NoteEntity>();
  }
  const db = await ensureLocalStore();
  return db.notes.find((n) => n.id === id) || null;
}

export async function findNoteByShareSlug(shareSlug: string): Promise<NoteEntity | null> {
  if (mongoConnected && NoteModel) {
    return NoteModel.findOne({ shareSlug }).lean<NoteEntity>();
  }
  const db = await ensureLocalStore();
  return db.notes.find((n) => n.shareSlug === shareSlug) || null;
}

export async function createNote(entity: NoteEntity): Promise<NoteEntity> {
  if (mongoConnected && NoteModel) {
    await NoteModel.create(entity);
    return entity;
  }
  const db = await ensureLocalStore();
  db.notes.push(entity);
  await persistLocalStore();
  return entity;
}

export async function updateNote(
  id: string,
  patch: Partial<Omit<NoteEntity, 'id' | 'createdAt'>>
): Promise<NoteEntity | null> {
  const updatedAt = new Date().toISOString();
  if (mongoConnected && NoteModel) {
    return NoteModel.findOneAndUpdate(
      { id },
      { $set: { ...patch, updatedAt } },
      { new: true }
    ).lean<NoteEntity>();
  }
  const db = await ensureLocalStore();
  const idx = db.notes.findIndex((n) => n.id === id);
  if (idx === -1) return null;
  db.notes[idx] = { ...db.notes[idx], ...patch, updatedAt };
  await persistLocalStore();
  return db.notes[idx];
}

export async function deleteNoteById(id: string): Promise<boolean> {
  if (mongoConnected && NoteModel) {
    const res = await NoteModel.deleteOne({ id });
    return res.deletedCount > 0;
  }
  const db = await ensureLocalStore();
  const prevLen = db.notes.length;
  db.notes = db.notes.filter((n) => n.id !== id);
  await persistLocalStore();
  return db.notes.length < prevLen;
}

// --- Template Operations ---
export async function listAllTemplates(): Promise<TemplateEntity[]> {
  if (mongoConnected && TemplateModel) {
    return TemplateModel.find().sort({ updatedAt: -1 }).lean<TemplateEntity[]>();
  }
  const db = await ensureLocalStore();
  return [...(db.templates || [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function findTemplateById(id: string): Promise<TemplateEntity | null> {
  if (mongoConnected && TemplateModel) {
    return TemplateModel.findOne({ id }).lean<TemplateEntity>();
  }
  const db = await ensureLocalStore();
  return (db.templates || []).find((t) => t.id === id) || null;
}

export async function createTemplate(entity: TemplateEntity): Promise<TemplateEntity> {
  if (mongoConnected && TemplateModel) {
    await TemplateModel.create(entity);
    return entity;
  }
  const db = await ensureLocalStore();
  if (!Array.isArray(db.templates)) db.templates = [];
  db.templates.push(entity);
  await persistLocalStore();
  return entity;
}

export async function deleteTemplateById(id: string): Promise<boolean> {
  if (mongoConnected && TemplateModel) {
    const res = await TemplateModel.deleteOne({ id });
    return res.deletedCount > 0;
  }
  const db = await ensureLocalStore();
  const prevLen = (db.templates || []).length;
  db.templates = (db.templates || []).filter((t) => t.id !== id);
  await persistLocalStore();
  return db.templates.length < prevLen;
}

// --- Reset Tokens & Requests ---
export async function createResetToken(entity: ResetTokenEntity): Promise<void> {
  if (mongoConnected && ResetTokenModel) {
    await ResetTokenModel.create(entity);
    return;
  }
  const db = await ensureLocalStore();
  db.resetTokens.push(entity);
  await persistLocalStore();
}

export async function findValidResetToken(tokenHash: string): Promise<ResetTokenEntity | null> {
  const nowIso = new Date().toISOString();
  if (mongoConnected && ResetTokenModel) {
    return ResetTokenModel.findOne({
      tokenHash,
      used: false,
      expiresAt: { $gt: nowIso },
    }).lean<ResetTokenEntity>();
  }
  const db = await ensureLocalStore();
  return (
    db.resetTokens.find((t) => t.tokenHash === tokenHash && !t.used && t.expiresAt > nowIso) ||
    null
  );
}

export async function markResetTokenUsed(id: string): Promise<void> {
  if (mongoConnected && ResetTokenModel) {
    await ResetTokenModel.updateOne({ id }, { $set: { used: true } });
    return;
  }
  const db = await ensureLocalStore();
  const item = db.resetTokens.find((t) => t.id === id);
  if (item) {
    item.used = true;
    await persistLocalStore();
  }
}

export async function createResetRequest(userId: string): Promise<ResetRequestEntity> {
  const entity: ResetRequestEntity = {
    id: crypto.randomUUID(),
    userId,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  if (mongoConnected && ResetRequestModel) {
    await ResetRequestModel.create(entity);
    return entity;
  }
  const db = await ensureLocalStore();
  // Avoid spamming multiple pending requests for the same user
  const existing = db.resetRequests.find((r) => r.userId === userId && r.status === 'pending');
  if (existing) return existing;
  db.resetRequests.push(entity);
  await persistLocalStore();
  return entity;
}

export async function listResetRequests(): Promise<PasswordResetRequestDTO[]> {
  const [users, requests] = await Promise.all([
    listAllUsers(),
    mongoConnected && ResetRequestModel
      ? ResetRequestModel.find({ status: 'pending' }).sort({ createdAt: -1 }).lean<ResetRequestEntity[]>()
      : ensureLocalStore().then((db) =>
          db.resetRequests
            .filter((r) => r.status === 'pending')
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        ),
  ]);
  const userMap = new Map(users.map((u) => [u.id, u]));
  return requests
    .map((r) => {
      const u = userMap.get(r.userId);
      if (!u) return null;
      return {
        id: r.id,
        userId: r.userId,
        userName: u.name,
        userEmail: u.email,
        status: r.status,
        createdAt: r.createdAt,
      };
    })
    .filter((x): x is PasswordResetRequestDTO => x !== null);
}

export async function fulfillResetRequestsForUser(userId: string): Promise<void> {
  if (mongoConnected && ResetRequestModel) {
    await ResetRequestModel.updateMany({ userId, status: 'pending' }, { $set: { status: 'fulfilled' } });
    return;
  }
  const db = await ensureLocalStore();
  let changed = false;
  for (const req of db.resetRequests) {
    if (req.userId === userId && req.status === 'pending') {
      req.status = 'fulfilled';
      changed = true;
    }
  }
  if (changed) await persistLocalStore();
}

// --- DTO Mappers (Never leak hashes/secrets) ---
export async function toUserDTO(user: UserEntity): Promise<UserDTO> {
  const [files, notes] = await Promise.all([listAllFiles(), listAllNotes()]);
  const userFiles = files.filter((f) => f.ownerId === user.id);
  const userNotes = notes.filter((n) => n.ownerId === user.id);
  const usedStorageBytes = userFiles.reduce((acc, f) => acc + f.sizeBytes, 0);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    bio: user.bio,
    role: user.role,
    status: user.status,
    isActive: user.isActive,
    emailVerified: user.emailVerified,
    permissionLevel: user.permissionLevel,
    canPublishPublic: user.canPublishPublic,
    maxFileCount: user.maxFileCount,
    maxFileSizeMB: user.maxFileSizeMB,
    maxStorageMB: user.maxStorageMB,
    usedStorageBytes,
    fileCount: userFiles.length,
    noteCount: userNotes.length,
    themePreference: user.themePreference,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function toFileDTO(file: FileEntity, ownerName: string): GalleryFileDTO {
  return {
    id: file.id,
    ownerId: file.ownerId,
    ownerName,
    originalName: file.originalName,
    title: file.title,
    description: file.description,
    folder: file.folder || '',
    tags: file.tags,
    mimeType: file.mimeType,
    extension: file.extension,
    category: file.category,
    sizeBytes: file.sizeBytes,
    visibility: file.visibility,
    lockedByAdmin: file.lockedByAdmin,
    shareSlug: file.shareSlug,
    contentUrl:
      file.visibility === 'public'
        ? `/api/public/files/${file.shareSlug}/content`
        : `/api/files/${file.id}/content`,
    fileData: file.fileData ?? file.previewDataUrl ?? null,
    previewDataUrl: file.previewDataUrl,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
  };
}

export function toNoteDTO(note: NoteEntity, ownerName: string): NoteDTO {
  const images = Array.isArray(note.images)
    ? [...note.images].sort((a, b) => a.order - b.order)
    : [];
  return {
    id: note.id,
    ownerId: note.ownerId,
    ownerName,
    title: note.title,
    shareSlug: note.shareSlug,
    contentHtml: note.contentHtml,
    excerpt: note.excerpt,
    tags: note.tags,
    images,
    collectionLayout: note.collectionLayout || 'grid',
    status: note.status,
    visibility: note.visibility,
    lockedByAdmin: note.lockedByAdmin,
    readingTimeMinutes: note.readingTimeMinutes,
    wordCount: note.wordCount,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

export function toTemplateDTO(tpl: TemplateEntity, ownerName: string): NoteTemplateDTO {
  return {
    id: tpl.id,
    ownerId: tpl.ownerId,
    ownerName,
    name: tpl.name,
    description: tpl.description,
    category: tpl.category,
    defaultTitle: tpl.defaultTitle,
    contentHtml: tpl.contentHtml,
    tags: tpl.tags,
    collectionLayout: tpl.collectionLayout || 'grid',
    isShared: Boolean(tpl.isShared),
    isBuiltIn: false,
    createdAt: tpl.createdAt,
    updatedAt: tpl.updatedAt,
  };
}
