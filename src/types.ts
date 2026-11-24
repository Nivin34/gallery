export type UserRole = 'admin' | 'user';
export type UserStatus = 'pending' | 'approved' | 'rejected';
export type PermissionLevel = 'view_only' | 'view_edit' | 'view_edit_delete';
export type Visibility = 'private' | 'public';
export type FileCategory = 'image' | 'document' | 'spreadsheet' | 'other';
export type NoteStatus = 'draft' | 'published';

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  bio: string;
  role: UserRole;
  status: UserStatus;
  isActive: boolean;
  emailVerified: boolean;
  permissionLevel: PermissionLevel;
  canPublishPublic: boolean;
  maxFileCount: number;
  maxFileSizeMB: number;
  maxStorageMB: number;
  usedStorageBytes: number;
  fileCount: number;
  noteCount: number;
  themePreference: 'light' | 'dark';
  createdAt: string;
  updatedAt: string;
}

export interface ConvertedFilePayload {
  base64: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface GalleryFileDTO {
  id: string;
  ownerId: string;
  ownerName: string;
  originalName: string;
  title: string;
  description: string;
  folder: string;
  tags: string[];
  mimeType: string;
  extension: string;
  category: FileCategory;
  sizeBytes: number;
  visibility: Visibility;
  lockedByAdmin: boolean;
  shareSlug: string;
  contentUrl: string;
  fileData?: string | null;
  previewDataUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CollectionLayout = 'grid' | 'columns' | 'stack';

export interface NoteImageItem {
  id: string;
  fileId?: string | null;
  src: string;
  fileName: string;
  caption: string;
  marked: boolean;
  order: number;
}

export interface NoteDTO {
  id: string;
  ownerId: string;
  ownerName: string;
  title: string;
  shareSlug: string;
  contentHtml: string;
  excerpt: string;
  tags: string[];
  images: NoteImageItem[];
  collectionLayout: CollectionLayout;
  status: NoteStatus;
  visibility: Visibility;
  lockedByAdmin: boolean;
  readingTimeMinutes: number;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

export type TemplateCategory = 'general' | 'technical' | 'editorial' | 'collection' | 'meeting';

export interface NoteTemplateDTO {
  id: string;
  ownerId: string;
  ownerName: string;
  name: string;
  description: string;
  category: TemplateCategory;
  defaultTitle: string;
  contentHtml: string;
  tags: string[];
  collectionLayout: CollectionLayout;
  isShared: boolean;
  isBuiltIn: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface GalleryFilesResponse extends PaginatedResponse<GalleryFileDTO> {
  folders: string[];
}

export interface BatchFileActionResponse {
  ok: boolean;
  processed: number;
  skipped: number;
  errors: string[];
}

export interface AdminStatsDTO {
  databaseEngine: 'mongodb' | 'local-document-store';
  databaseFallbackReason?: string | null;
  totalUsers: number;
  pendingUsers: number;
  approvedUsers: number;
  deactivatedUsers: number;
  totalFiles: number;
  publicFiles: number;
  privateFiles: number;
  totalNotes: number;
  publishedNotes: number;
  draftNotes: number;
  totalStorageBytes: number;
  storageByCategory: Record<FileCategory, { count: number; bytes: number }>;
  pendingResetRequests: number;
}

export interface PasswordResetRequestDTO {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  status: 'pending' | 'fulfilled';
  createdAt: string;
}
