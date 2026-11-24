import type { NextFunction, Request, Response } from 'express';
import { verifySessionToken } from './auth.js';
import { findUserById, type UserEntity } from './db.js';
import type { Visibility } from '../src/types.js';

export interface AuthenticatedRequest extends Request {
  user?: UserEntity;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
    return;
  }

  const user = await findUserById(payload.sub);
  if (!user || user.tokenVersion !== payload.tv) {
    res.status(401).json({ error: 'Session invalidated. Please sign in again.' });
    return;
  }

  if (!user.isActive) {
    res.status(403).json({
      error: 'Your account has been deactivated by an administrator.',
      code: 'ACCOUNT_DEACTIVATED',
    });
    return;
  }

  if (user.status === 'pending') {
    res.status(403).json({
      error: 'Your registration is awaiting administrator approval.',
      code: 'PENDING_APPROVAL',
    });
    return;
  }

  if (user.status === 'rejected') {
    res.status(403).json({
      error: 'Your registration request was declined.',
      code: 'ACCOUNT_REJECTED',
    });
    return;
  }

  req.user = user;
  next();
}

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Administrator privileges are required for this action.' });
    return;
  }
  next();
}

// --- Permission Inheritance Rules (Single Source of Truth) ---
// 1. Role Baseline: Admins inherit view_edit_delete + global oversight across all resources.
// 2. Resource Permission Tier: Normal users inherit view_only | view_edit | view_edit_delete for own items.
// 3. Ownership & Visibility Precedence: Private items are strictly owner + admin.
//    Public items are readable by anyone, but mutable only by owner (per tier) or admin.
// 4. Admin Visibility Lock: If lockedByAdmin is true or user.canPublishPublic is false,
//    normal users cannot override visibility.

export function canCreateOrUpload(user: UserEntity): boolean {
  if (user.role === 'admin') return true;
  return user.permissionLevel === 'view_edit' || user.permissionLevel === 'view_edit_delete';
}

export function canViewResource(
  user: UserEntity,
  resource: { ownerId: string; visibility: Visibility }
): boolean {
  if (user.role === 'admin') return true;
  if (resource.ownerId === user.id) return true;
  return resource.visibility === 'public';
}

export function canEditResource(
  user: UserEntity,
  resource: { ownerId: string }
): boolean {
  if (user.role === 'admin') return true;
  if (resource.ownerId !== user.id) return false;
  return user.permissionLevel === 'view_edit' || user.permissionLevel === 'view_edit_delete';
}

export function canDeleteResource(
  user: UserEntity,
  resource: { ownerId: string }
): boolean {
  if (user.role === 'admin') return true;
  if (resource.ownerId !== user.id) return false;
  return user.permissionLevel === 'view_edit_delete';
}

export function canChangeVisibility(
  user: UserEntity,
  resource: { ownerId: string; lockedByAdmin: boolean; visibility: Visibility },
  nextVisibility: Visibility
): { allowed: boolean; reason?: string } {
  if (user.role === 'admin') return { allowed: true };
  if (!canEditResource(user, resource)) {
    return { allowed: false, reason: 'Your current permission tier does not allow editing.' };
  }
  if (resource.lockedByAdmin && nextVisibility !== resource.visibility) {
    return {
      allowed: false,
      reason: 'Visibility for this item has been locked by an administrator.',
    };
  }
  if (nextVisibility === 'public' && !user.canPublishPublic) {
    return {
      allowed: false,
      reason: 'Public publishing has been restricted on your account by an administrator.',
    };
  }
  return { allowed: true };
}
