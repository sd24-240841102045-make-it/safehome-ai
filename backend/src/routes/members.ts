import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { DatabaseService } from '../services/db.js';
import { recordAuditLog } from '../services/auditLog.js';
import { logger } from '../services/logger.js';

export function createMembersRouter(db: DatabaseService, authMiddleware: any): Router {
  const router = Router();
  router.use(authMiddleware);

  // Helper to get active home for user
  async function getUserHome(userId: string) {
    const directHome = await db.get('SELECT * FROM homes WHERE user_id = ? ORDER BY created_at ASC LIMIT 1', [userId]);
    if (directHome) return { home: directHome, role: 'owner' };

    const memberRecord = await db.get(
      `SELECT hm.*, h.name as home_name, h.address 
       FROM home_members hm 
       JOIN homes h ON hm.home_id = h.id 
       WHERE hm.user_id = ? 
       ORDER BY hm.joined_at ASC LIMIT 1`,
      [userId]
    );

    if (memberRecord) {
      const home = await db.get('SELECT * FROM homes WHERE id = ?', [memberRecord.home_id]);
      return { home, role: memberRecord.role };
    }

    return { home: null, role: null };
  }

  // GET /api/homes/members
  router.get('/homes/members', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      const { home, role } = await getUserHome(userId);

      if (!home) {
        return res.json({ success: true, data: { members: [], my_role: 'owner', home_name: 'Default Home' } });
      }

      // Fetch owner profile
      const owner = await db.get('SELECT id, email, full_name, role FROM profiles WHERE id = ?', [home.user_id]);

      // Fetch other members
      const members = await db.query(
        `SELECT hm.id, hm.home_id, hm.user_id, hm.role, hm.joined_at, p.email, p.full_name
         FROM home_members hm
         JOIN profiles p ON hm.user_id = p.id
         WHERE hm.home_id = ?
         ORDER BY hm.joined_at ASC`,
        [home.id]
      );

      const allMembers = [];
      if (owner) {
        allMembers.push({
          id: `owner-${owner.id}`,
          user_id: owner.id,
          email: owner.email,
          full_name: owner.full_name,
          role: 'owner',
          joined_at: home.created_at || new Date().toISOString()
        });
      }

      for (const m of members) {
        if (m.user_id !== home.user_id) {
          allMembers.push(m);
        }
      }

      res.json({
        success: true,
        data: {
          home_id: home.id,
          home_name: home.name,
          my_role: role,
          members: allMembers
        }
      });
    } catch (err: any) {
      logger.error('Error fetching home members:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/homes/invites - List active invites
  router.get('/homes/invites', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      const { home, role } = await getUserHome(userId);

      if (!home) {
        return res.json({ success: true, data: { invites: [] } });
      }

      const invites = await db.query(
        `SELECT id, invite_code, email, role, expires_at, is_accepted, created_at
         FROM home_invites
         WHERE home_id = ? AND is_accepted = 0
         ORDER BY created_at DESC`,
        [home.id]
      );

      res.json({ success: true, data: { invites } });
    } catch (err: any) {
      logger.error('Error fetching home invites:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/homes/invites - Create invite code
  router.post('/homes/invites', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      const { role = 'member', email } = req.body;
      const { home, role: userRole } = await getUserHome(userId);

      if (!home) {
        return res.status(404).json({ success: false, error: 'No active home found' });
      }

      if (userRole !== 'owner' && userRole !== 'admin') {
        return res.status(403).json({ success: false, error: 'Only home owners or admins can invite new members' });
      }

      const inviteId = crypto.randomUUID();
      const inviteCode = `SAFE-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

      await db.run(
        `INSERT INTO home_invites (id, home_id, invite_code, email, role, created_by, expires_at, is_accepted)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
        [inviteId, home.id, inviteCode, email || null, role, userId, expiresAt]
      );

      await recordAuditLog(db, {
        userId,
        homeId: home.id,
        eventType: 'member_invited',
        resourceType: 'home_invite',
        resourceId: inviteId,
        details: { invite_code: inviteCode, role, target_email: email }
      });

      res.status(201).json({
        success: true,
        data: {
          id: inviteId,
          invite_code: inviteCode,
          role,
          email: email || null,
          expires_at: expiresAt
        }
      });
    } catch (err: any) {
      logger.error('Error creating home invite:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/homes/join - Join a home using an invite code
  router.post('/homes/join', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      const { invite_code } = req.body;

      if (!invite_code) {
        return res.status(400).json({ success: false, error: 'Invite code is required' });
      }

      const invite = await db.get(
        `SELECT * FROM home_invites WHERE invite_code = ? AND is_accepted = 0`,
        [invite_code.trim().toUpperCase()]
      );

      if (!invite) {
        return res.status(404).json({ success: false, error: 'Invalid or expired invite code' });
      }

      if (new Date(invite.expires_at).getTime() < Date.now()) {
        return res.status(400).json({ success: false, error: 'This invitation code has expired' });
      }

      // Check if user is already a member
      const existing = await db.get(
        `SELECT id FROM home_members WHERE home_id = ? AND user_id = ?`,
        [invite.home_id, userId]
      );

      if (existing) {
        return res.status(400).json({ success: false, error: 'You are already a member of this home' });
      }

      // Add to home_members
      const memberId = crypto.randomUUID();
      await db.run(
        `INSERT INTO home_members (id, home_id, user_id, role, invited_by, joined_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [memberId, invite.home_id, userId, invite.role, invite.created_by]
      );

      // Mark invite as used
      await db.run(
        `UPDATE home_invites SET is_accepted = 1, accepted_by = ? WHERE id = ?`,
        [userId, invite.id]
      );

      await recordAuditLog(db, {
        userId,
        homeId: invite.home_id,
        eventType: 'member_joined',
        resourceType: 'home_member',
        resourceId: memberId,
        details: { role: invite.role, invite_id: invite.id }
      });

      res.json({
        success: true,
        message: 'Successfully joined home',
        data: {
          home_id: invite.home_id,
          role: invite.role
        }
      });
    } catch (err: any) {
      logger.error('Error joining home:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE /api/homes/members/:id - Remove a member
  router.delete('/homes/members/:id', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      const targetMemberId = String(req.params.id);
      const { home, role: userRole } = await getUserHome(userId);

      if (!home) {
        return res.status(404).json({ success: false, error: 'No active home found' });
      }

      if (userRole !== 'owner' && userRole !== 'admin') {
        return res.status(403).json({ success: false, error: 'Only owners or admins can remove members' });
      }

      const target = await db.get('SELECT * FROM home_members WHERE id = ? AND home_id = ?', [targetMemberId, home.id]);
      if (!target) {
        return res.status(404).json({ success: false, error: 'Member not found' });
      }

      if (target.role === 'owner') {
        return res.status(403).json({ success: false, error: 'Cannot remove the primary home owner' });
      }

      await db.run('DELETE FROM home_members WHERE id = ?', [targetMemberId]);

      await recordAuditLog(db, {
        userId,
        homeId: home.id,
        eventType: 'member_removed',
        resourceType: 'home_member',
        resourceId: targetMemberId,
        details: { removed_user_id: target.user_id, role: target.role }
      });

      res.json({ success: true, message: 'Member removed successfully' });
    } catch (err: any) {
      logger.error('Error removing home member:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PATCH /api/homes/members/:id/role - Change member role
  router.patch('/homes/members/:id/role', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      const targetMemberId = String(req.params.id);
      const { role: newRole } = req.body;
      const { home, role: userRole } = await getUserHome(userId);

      if (!home) {
        return res.status(404).json({ success: false, error: 'No active home found' });
      }

      if (userRole !== 'owner') {
        return res.status(403).json({ success: false, error: 'Only the home owner can modify member roles' });
      }

      if (!['admin', 'member', 'viewer'].includes(newRole)) {
        return res.status(400).json({ success: false, error: 'Invalid role. Choose admin, member, or viewer' });
      }

      await db.run('UPDATE home_members SET role = ? WHERE id = ? AND home_id = ?', [newRole, targetMemberId, home.id]);

      await recordAuditLog(db, {
        userId,
        homeId: home.id,
        eventType: 'member_role_changed',
        resourceType: 'home_member',
        resourceId: targetMemberId,
        details: { new_role: newRole }
      });

      res.json({ success: true, message: 'Role updated successfully' });
    } catch (err: any) {
      logger.error('Error updating member role:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
